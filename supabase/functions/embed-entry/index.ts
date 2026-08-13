// Synopsical — embed-entry Edge Function
//
// Generates a semantic embedding for one entry and stores it. This is
// the ONLY place the embeddings-provider API key exists — read from a
// Supabase secret, never from client code, never from the request body.
//
// Provider: OpenRouter, calling Qwen3-Embedding-8B — an open-source
// (Apache 2.0) model from Alibaba's Qwen team, routed through OpenRouter
// rather than signing up with Alibaba Cloud directly. That direct path
// was tried first and abandoned: Alibaba Cloud International's signup
// pushed into an enterprise-style billing form demanding a registered
// company name, with no confirmed individual-only path. OpenRouter is a
// standard individual-developer platform (email + card, no business
// entity) that still gets us a genuine cheap open-source Chinese model.
// DeepSeek was considered too, but its API is chat-only, no embeddings.
//
// Deploy:  supabase functions deploy embed-entry
// Secret:  supabase secrets set OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx
//
// Qwen3-Embedding-8B's native output is 4096 dimensions but it supports
// Matryoshka truncation down to 32 (confirmed on the model's own Hugging
// Face card) — so requesting 1024 below is a genuinely supported mode,
// not a guess. What IS still unconfirmed: whether OpenRouter's endpoint
// actually honours the `dimensions` request parameter for this specific
// model, since their own docs don't spell that out. If the first real
// call returns a vector whose length isn't 1024, that's the sign it was
// ignored — check the `dimensions` field this function returns on
// success, and adjust the `vector(1024)` column in
// supabase-schema-05-embeddings.sql to match whatever length actually
// comes back.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EMBEDDING_URL = 'https://openrouter.ai/api/v1/embeddings';
const EMBEDDING_MODEL = 'qwen/qwen3-embedding-8b';
const EMBEDDING_DIMENSIONS = 1024; // must match entries.embedding's column definition

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const body = await req.json().catch(() => null);
  const entryId = body?.entryId;
  if (!entryId) return json({ error: 'entryId is required' }, 400);

  // Acts as the calling user, not as an admin — Row Level Security still
  // applies, so this can only ever read or write an entry the caller
  // actually owns. There is deliberately no use of the service_role key
  // anywhere in this function.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: entry, error: entryErr } = await userClient
    .from('entries').select('id, title, summary, body').eq('id', entryId).single();
  if (entryErr || !entry) return json({ error: 'Entry not found, or not yours' }, 404);

  const { data: tagRows } = await userClient.from('tags').select('tag').eq('entry_id', entryId);
  const tagText = (tagRows ?? []).map((t: { tag: string }) => t.tag).join(', ');

  // Title and tags first — they carry the most concentrated meaning per
  // token, which matters more once entries get long.
  const text = [entry.title, tagText, entry.summary, entry.body]
    .filter(Boolean).join('\n\n')
    .slice(0, 8000); // stay well clear of typical input-token ceilings

  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    return json({ error: 'Server has no embeddings API key configured (OPENROUTER_API_KEY secret is unset)' }, 500);
  }

  const embedRes = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Optional, per OpenRouter's docs — identifies the calling app on
      // their dashboard/leaderboards. Harmless to omit, worth keeping.
      'HTTP-Referer': 'https://synopsical.com',
      'X-Title': 'Synopsical',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!embedRes.ok) {
    const detail = await embedRes.text();
    return json({ error: 'Embedding provider request failed', status: embedRes.status, detail }, 502);
  }

  const embedJson = await embedRes.json();
  const vector = embedJson?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) {
    return json({ error: 'Unexpected response shape from embedding provider', raw: embedJson }, 502);
  }

  const { error: updateErr } = await userClient
    .from('entries').update({ embedding: vector }).eq('id', entryId);
  if (updateErr) return json({ error: updateErr.message }, 500);

  return json({ ok: true, dimensions: vector.length });
});
