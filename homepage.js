// Synopsical — homepage motion, shared by index.html/info.html/pricing.html/
// privacy.html. Public marketing pages only; never loaded by (and has no
// effect on) the signed-in app.
//
// Three independent, all-progressive-enhancement pieces:
//   1. Scroll-triggered reveal for .mkt-reveal elements (feature cards,
//      the closing line).
//   2. The connecting line drawn between the three example-entry cards
//      on the homepage specifically — the one piece of motion here that
//      can't be done in plain CSS, since the cards are a wrapping flex
//      row and their real positions aren't known until layout runs (and
//      change on resize/font-load).
//   3. A soft glow that follows the cursor in the hero, desktop only.
//
// The "start hidden" CSS for #1 only applies once .mkt-js is present on
// <html> — added by a tiny synchronous inline script in each page's
// <head>, not by this file, specifically so there's no flash of
// visible-then-hidden content while the page loads (this file runs at
// the bottom of the page, well after first paint). If this script never
// runs at all — JS disabled, blocked, an error — .mkt-js never gets
// added either way, so .mkt-reveal content just stays visible, and the
// connector/glow simply don't exist. Nothing is ever lost.

(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 1. Scroll reveal ────────────────────────────────────────────
  if (!reduceMotion) {
    const targets = document.querySelectorAll('.mkt-reveal');
    if (targets.length && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('mkt-visible');
          io.unobserve(entry.target);
        }
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
      targets.forEach((el) => io.observe(el));
    }
  }

  // ── 2. Proof-card connector line ────────────────────────────────
  const proof = document.querySelector('.home-proof');
  const connector = document.querySelector('.home-proof-connector');
  if (proof && connector) {
    const NS = 'http://www.w3.org/2000/svg';
    let path = null;
    let dots = [];

    function pathFor(points) {
      const [a, b, c] = points;
      return `M${a.x},${a.y} C${a.x + 70},${a.y} ${b.x - 70},${b.y} ${b.x},${b.y} `
        + `S${c.x - 70},${c.y} ${c.x},${c.y}`;
    }

    function update() {
      if (window.innerWidth <= 900) { connector.replaceChildren(); path = null; dots = []; return; }

      const nodes = [...proof.querySelectorAll('.home-proof-node')];
      if (nodes.length < 3) return;
      const box = proof.getBoundingClientRect();
      const points = nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
      });

      // The three cards are a wrapping flex row -- if an in-between
      // width has stacked them (before the 900px cutoff above catches
      // it), the nodes won't be roughly level. Don't draw a weird
      // diagonal in that case; just wait for the next resize.
      const spread = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
      if (spread > 60) { connector.replaceChildren(); path = null; dots = []; return; }

      const d = pathFor(points);

      if (!path) {
        connector.replaceChildren();
        path = document.createElementNS(NS, 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--mkt-accent-light)');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('pathLength', '100');
        path.setAttribute('stroke-dasharray', '100');
        path.setAttribute('d', d);
        connector.appendChild(path);

        if (!reduceMotion) {
          path.setAttribute('stroke-dashoffset', '100');
          // rAF so the browser registers the starting dashoffset before
          // the class (and its transition) applies -- applying both in
          // the same tick can skip straight to the end state.
          requestAnimationFrame(() => requestAnimationFrame(() => path.classList.add('home-proof-connector-path')));

          dots = [0, '1.6s'].map((begin, i) => {
            const dot = document.createElementNS(NS, 'circle');
            dot.setAttribute('r', '3');
            dot.setAttribute('fill', 'var(--mkt-accent)');
            dot.setAttribute('opacity', '0.9');
            const anim = document.createElementNS(NS, 'animateMotion');
            anim.setAttribute('dur', '3.4s');
            anim.setAttribute('repeatCount', 'indefinite');
            anim.setAttribute('begin', i === 0 ? '3.3s' : `${3.3 + 1.7}s`);
            anim.setAttribute('path', d);
            dot.appendChild(anim);
            connector.appendChild(dot);
            return dot;
          });
        }
      } else {
        path.setAttribute('d', d);
        for (const dot of dots) {
          const anim = dot.querySelector('animateMotion');
          if (anim) anim.setAttribute('path', d);
        }
      }
    }

    // Fonts loading late can shift card heights/positions after the
    // first layout pass -- redraw once fonts settle, not just on load.
    update();
    if (document.fonts?.ready) document.fonts.ready.then(update);
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(update, 150);
    });
  }

  // ── 3. Cursor-follow glow in the hero (desktop pointer only) ────
  if (!reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const hero = document.querySelector('.home-hero');
    if (hero) {
      const glow = document.createElement('div');
      glow.className = 'home-hero-glow';
      glow.setAttribute('aria-hidden', 'true');
      hero.appendChild(glow);
      hero.addEventListener('mousemove', (ev) => {
        const rect = hero.getBoundingClientRect();
        glow.style.left = `${ev.clientX - rect.left}px`;
        glow.style.top = `${ev.clientY - rect.top}px`;
      });
    }
  }
})();
