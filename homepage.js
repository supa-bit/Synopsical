// Synopsical — homepage motion, shared by index.html/info.html/pricing.html/
// privacy.html. Public marketing pages only; never loaded by (and has no
// effect on) the signed-in app.
//
// Scroll-triggered reveal for .mkt-reveal elements (feature cards, the
// closing line). The actual "start hidden" CSS only applies once .mkt-js
// is present on <html> -- added by a tiny synchronous inline script in
// each page's <head>, not by this file, specifically so there's no flash
// of visible-then-hidden content while the page loads (this file runs at
// the bottom of the page, well after first paint). If this script never
// runs at all -- JS disabled, blocked, an error -- .mkt-js never gets
// added either way, so .mkt-reveal content just stays visible. No motion,
// nothing lost.
//
// Also why this does nothing at all under prefers-reduced-motion: the
// CSS media query in style.css already makes everything visible
// unconditionally in that case, so there's nothing for an observer to do.

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const targets = document.querySelectorAll('.mkt-reveal');
  if (!targets.length || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('mkt-visible');
      io.unobserve(entry.target);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  targets.forEach((el) => io.observe(el));
})();
