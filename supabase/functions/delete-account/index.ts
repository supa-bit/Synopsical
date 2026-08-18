// Synopsical — delete-account Edge Function
//
// Deletes the calling user's own account, permanently. This has to be an
// Edge Function, not something the browser can do directly: removing a
// row from auth.users requires the Admin API, which requires the
// service_role key — a key that must never exist in client-side code,
// so this is the one place it's allowed to.
//
// Every table in supabase-schema.sql references auth.users(id) on
// delete cascade (entries, entry_fields, tags, links, settings) and so
// does profiles in supabase-schema-02-profiles.sql — deleting the auth
// user is enough to cascade-clean every database row on its own, no
// per-table deletes needed here. What cascade does NOT reach is Supabase
// Storage: uploaded faceplate images and font files live in the
// `faceplates`/`fonts` buckets under a `{user_id}/...` path, a separate
// system foreign keys can't touch, so this explicitly clears both
// buckets' contents for the user before deleting the account itself.
//
// Deploy:  supabase functions deploy delete-account
// No extra secrets needed — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are provided automatically to every Edge Function by Supabase itself.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Best-effort — a storage hiccup should never block someone from actually
// deleting their account, which is the part that has to work.
async function clearBucket(
  serviceClient: ReturnType<typeof createClient>,
  bucket: string,
  userId: string
) {
  try {
    const { data: files } = await serviceClient.storage.from(bucket).list(userId);
    if (files?.length) {
      const paths = files.map((f) => `${userId}/${f.name}`);
      await serviceClient.storage.from(bucket).remove(paths);
    }
  } catch {
    // logged nowhere on purpose — see comment above
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  // Identifies the caller from their own verified JWT — never from a
  // user id the client could send in the request body. A destructive,
  // no-undo operation like this only ever acts on whoever the token
  // actually proves you are.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Not signed in' }, 401);

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  await Promise.all([
    clearBucket(serviceClient, 'faceplates', user.id),
    clearBucket(serviceClient, 'fonts', user.id),
  ]);

  const { error: deleteErr } = await serviceClient.auth.admin.deleteUser(user.id);
  if (deleteErr) return json({ error: deleteErr.message }, 500);

  return json({ ok: true });
});
