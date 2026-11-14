// Synopsical — stripe-webhook Edge Function
//
// Receives signed webhook events from Stripe (configured on a Stripe
// Payment Link or Checkout / Billing setup) and updates `profiles.plan`
// (`'paid'` vs `'free'`) plus the `stripe_*` metadata columns defined in
// `supabase-schema-02-profiles.sql`.
//
// Why this is an Edge Function:
//   `profiles` intentionally has no direct UPDATE policy for the
//   `authenticated` role so a user can never promote their own account
//   to `'paid'` in the browser. Only this function — using the server-side
//   `SUPABASE_SERVICE_ROLE_KEY` after verifying Stripe's HMAC-SHA256
//   `Stripe-Signature` header — can write billing columns.
//
// Deploy:
//   supabase functions deploy stripe-webhook
//   (verify_jwt = false is set in supabase/config.toml because Stripe,
//   not a Supabase user, calls this endpoint.)
//
// Secrets:
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
//
// Stripe Dashboard setup:
//   1. Create a Subscription Product ("Synopsical Plus") and a Payment Link
//      in Stripe. Paste the Payment Link URL into `config.js` as
//      `STRIPE_PLUS_PAYMENT_LINK` (or `STRIPE_CUSTOMER_PORTAL_URL` for
//      managing an active subscription).
//   2. Under Developers -> Webhooks -> Add endpoint, point Stripe at:
//        https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook
//      and subscribe to:
//        - `checkout.session.completed`
//        - `customer.subscription.updated`
//        - `customer.subscription.deleted`

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
  toleranceSeconds = 300
): Promise<boolean> {
  const parts = sigHeader.split(',').map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!timestamp || !signatures.length) return false;

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > toleranceSeconds) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signedPayload = `${timestamp}.${rawBody}`;
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return signatures.some((sig) => timingSafeEqualHex(sig.toLowerCase(), expectedHex));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    return json({ error: 'STRIPE_WEBHOOK_SECRET is not configured on this Edge Function' }, 500);
  }

  const sigHeader = req.headers.get('stripe-signature') ?? '';
  const rawBody = await req.text();

  const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
  if (!valid) {
    return json({ error: 'Invalid Stripe signature' }, 400);
  }

  const event = JSON.parse(rawBody);
  const type = String(event?.type ?? '');
  const obj = event?.data?.object ?? {};

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  if (type === 'checkout.session.completed') {
    const userId = obj.client_reference_id || obj.metadata?.user_id || null;
    const email = obj.customer_details?.email || obj.customer_email || null;
    const customerId = typeof obj.customer === 'string' ? obj.customer : null;
    const subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : null;

    const patch = {
      plan: 'paid',
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: 'active',
    };

    if (userId) {
      const { error } = await serviceClient.from('profiles').update(patch).eq('id', userId);
      if (error) return json({ error: error.message }, 500);
    } else if (email) {
      const { error } = await serviceClient.from('profiles').update(patch).eq('email', email);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ received: true, updated: type });
  }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const subscriptionId = typeof obj.id === 'string' ? obj.id : null;
    const customerId = typeof obj.customer === 'string' ? obj.customer : null;
    const status = String(obj.status ?? (type.endsWith('.deleted') ? 'canceled' : 'unknown'));
    const isActive = status === 'active' || status === 'trialing';

    const patch = {
      plan: isActive ? 'paid' : 'free',
      subscription_status: status,
    };

    if (subscriptionId) {
      await serviceClient.from('profiles').update(patch).eq('stripe_subscription_id', subscriptionId);
    } else if (customerId) {
      await serviceClient.from('profiles').update(patch).eq('stripe_customer_id', customerId);
    }
    return json({ received: true, updated: type, status });
  }

  return json({ received: true, ignored: type });
});
