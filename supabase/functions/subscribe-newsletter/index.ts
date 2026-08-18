// Synopsical — subscribe-newsletter Edge Function
//
// Adds an email address to the Resend Audience used for product-update
// emails (weekly/monthly-ish announcements). This is a DIFFERENT system
// from the confirm-signup/reset-password emails, which go through
// Supabase Auth's own SMTP settings — that's transactional (one person,
// one action), this is a broadcast list, and Resend treats them as
// separate features for a reason: broadcasts need the unsubscribe
// handling and suppression list that transactional mail doesn't.
//
// No Synopsical account needed to call this — see verify_jwt = false for
// this function in supabase/config.toml. Someone should be able to sign
// up for updates without creating an account first; that's the whole
// point of picking the "simple" option over wiring this to Settings.
//
// Deploy:  supabase functions deploy subscribe-newsletter
//          (verify_jwt = false already set in config.toml, so no CLI
//          flag needed for that part on a current CLI — if your version
//          doesn't pick that up, the older equivalent is
//          `supabase functions deploy subscribe-newsletter --no-verify-jwt`)
// Secrets: supabase secrets set RESEND_API_KEY=re_xxxxxxxx
//          supabase secrets set RESEND_AUDIENCE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
// (Create the Audience in Resend's dashboard first — Audiences → New
// Audience — its ID is shown on that audience's own page.)
//
// The request shape below (POST /audiences/{id}/contacts) matches
// Resend's own "Create Contact" API docs as of writing, but this is
// unverified against a real Resend account — if the first real signup
// fails, the error text in the response is Resend's own message, not a
// guess, and is the place to look first.

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

// Deliberately simple — not trying to fully validate email syntax
// (that's a losing game), just reject obvious non-emails so a typo gets
// a clear "check that" instead of vanishing into an audience nobody can
// reach.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await req.json().catch(() => null);
  const email = (body?.email ?? '').trim();
  if (!email || !EMAIL_RE.test(email)) return json({ error: 'That doesn’t look like a valid email' }, 400);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const audienceId = Deno.env.get('RESEND_AUDIENCE_ID');
  if (!apiKey || !audienceId) {
    return json({ error: 'Server has no Resend audience configured yet (RESEND_API_KEY / RESEND_AUDIENCE_ID secrets are unset)' }, 500);
  }

  const resendRes = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, unsubscribed: false }),
  });

  // Resend returns an error if the contact already exists — that's not a
  // real failure from the person subscribing's point of view, they just
  // successfully confirmed they're already on the list. Anything else
  // genuinely failed and should say so.
  if (!resendRes.ok) {
    const detail = await resendRes.text();
    if (resendRes.status === 409 || /already exists/i.test(detail)) {
      return json({ ok: true, alreadySubscribed: true });
    }
    return json({ error: 'Could not subscribe', status: resendRes.status, detail }, 502);
  }

  return json({ ok: true });
});
