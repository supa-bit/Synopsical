// Synopsical — newsletter signup, shared by index.html/info.html/pricing.html
//
// Deliberately its own tiny file rather than folded into app.js: this
// form has to work on info.html and pricing.html too, neither of which
// loads the Supabase SDK or the rest of the app, and pulling all of that
// in for a three-field form would be a lot of weight for very little.
// Plain fetch() to the Edge Function directly — no SDK needed for that.

(function () {
  const form = document.getElementById('newsletter-form');
  if (!form) return;

  const cfg = window.SYNOPSICAL_CONFIG ?? {};
  const emailInput = document.getElementById('newsletter-email');
  const msg = document.getElementById('newsletter-msg');
  const btn = form.querySelector('button');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return; // config.js not filled in yet

    msg.hidden = true;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Sending…';

    try {
      const res = await fetch(cfg.SUPABASE_URL + '/functions/v1/subscribe-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.SUPABASE_ANON_KEY },
        body: JSON.stringify({ email: emailInput.value.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not subscribe');
      msg.textContent = data.alreadySubscribed ? 'You’re already on the list.' : 'You’re on the list.';
      msg.hidden = false;
      emailInput.value = '';
    } catch (err) {
      msg.textContent = err.message || 'Something went wrong — try again.';
      msg.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
})();
