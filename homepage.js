// Synopsical — homepage motion, shared by index.html/info.html/pricing.html/
// privacy.html. Public marketing pages only; never loaded by (and has no
// effect on) the signed-in app.
//
// Four independent, all-progressive-enhancement pieces:
//   1. Scroll-triggered reveal for .mkt-reveal elements (feature cards,
//      the closing line).
//   2. The connecting line drawn between the three example-entry cards
//      on the homepage specifically — the one piece of motion here that
//      can't be done in plain CSS, since the cards are a wrapping flex
//      row and their real positions aren't known until layout runs (and
//      change on resize/font-load).
//   3. A soft glow that follows the cursor in the hero, desktop only.
//   4. The live background: same dot grid as style.css's static one,
//      redrawn on <canvas> so it can drift on scroll and light up near
//      the cursor -- see its own comment below for why it's structured
//      the way it is.
//
// The "start hidden" CSS for #1 only applies once .mkt-js is present on
// <html> — added by a tiny synchronous inline script in each page's
// <head>, not by this file, specifically so there's no flash of
// visible-then-hidden content while the page loads (this file runs at
// the bottom of the page, well after first paint). If this script never
// runs at all — JS disabled, blocked, an error — .mkt-js never gets
// added either way, so .mkt-reveal content just stays visible, and the
// connector/glow/live-background simply don't exist. Nothing is ever
// lost -- style.css's plain CSS dot grid is what's left in that case.

(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

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
  if (!reduceMotion && finePointer) {
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

  // ── 4. Live background: the same dot grid, on <canvas> ──────────
  // Fixed to the viewport (not the document -- redrawing a canvas the
  // height of a long page, every frame, for a grid that repeats every
  // 30px is pure waste) and repositioned each frame using the current
  // scroll offset, so the *pattern* scrolls with the page even though
  // the <canvas> element itself never moves.
  //
  // Deliberately NOT built on top of the dot grid's exact pixel grid --
  // it draws its own copy at the same spacing/color read from the CSS
  // custom properties, so it's a faithful redraw of "the same
  // background", not a literal reuse of the CSS one (canvas can't read
  // a background-image). style.css's #homepage.home-bg-live rule only
  // removes the static CSS version once this canvas is confirmed up and
  // drawing -- see that rule's comment.
  if (!reduceMotion && finePointer) {
    const home = document.getElementById('homepage');
    const ctx2d = home && (() => {
      const c = document.createElement('canvas');
      c.className = 'home-bg-canvas';
      c.setAttribute('aria-hidden', 'true');
      home.prepend(c);
      return c.getContext('2d');
    })();

    if (ctx2d) {
      const canvas = ctx2d.canvas;
      const style = getComputedStyle(home);
      const dotColor = style.getPropertyValue('--mkt-rule').trim() || '#dde2e8';
      const accentColor = style.getPropertyValue('--mkt-accent-light').trim() || '#73a4f0';

      const SPACING = 30;       // matches style.css's background-size
      const DOT_R = 1.2;        // matches style.css's dot radius
      const REACT_RADIUS = 130; // px around the cursor where dots light up
      const LINK_DIST = 70;     // max px between two lit dots to draw a line between them
      const PARALLAX = 0.35;    // fraction of scroll speed the grid drifts at

      let mouseX = -9999, mouseY = -9999;
      let dpr = Math.min(window.devicePixelRatio || 1, 2);
      let needsDraw = true;
      const requestDraw = () => { needsDraw = true; };

      function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(window.innerWidth * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        requestDraw();
      }

      function draw() {
        const w = window.innerWidth, h = window.innerHeight;
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx2d.clearRect(0, 0, w, h);

        const offsetY = (window.scrollY * PARALLAX) % SPACING;
        const lit = [];

        for (let gy = -SPACING; gy < h + SPACING; gy += SPACING) {
          const y = gy - offsetY;
          for (let gx = -SPACING; gx < w + SPACING; gx += SPACING) {
            const dist = Math.hypot(gx - mouseX, y - mouseY);
            const near = dist < REACT_RADIUS;
            if (near) lit.push({ x: gx, y, t: 1 - dist / REACT_RADIUS });
            ctx2d.beginPath();
            ctx2d.arc(gx, y, near ? DOT_R + (1 - dist / REACT_RADIUS) * 2.2 : DOT_R, 0, Math.PI * 2);
            ctx2d.fillStyle = near ? accentColor : dotColor;
            ctx2d.fill();
          }
        }

        // A faint constellation only among dots already lit near the
        // cursor -- keeps the rest of the page calm instead of drawing
        // hundreds of lines across the whole grid.
        for (let i = 0; i < lit.length; i++) {
          for (let j = i + 1; j < lit.length; j++) {
            const a = lit[i], b = lit[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d >= LINK_DIST) continue;
            ctx2d.beginPath();
            ctx2d.moveTo(a.x, a.y);
            ctx2d.lineTo(b.x, b.y);
            ctx2d.strokeStyle = accentColor;
            ctx2d.globalAlpha = (1 - d / LINK_DIST) * Math.min(a.t, b.t) * 0.6;
            ctx2d.lineWidth = 1;
            ctx2d.stroke();
          }
        }
        ctx2d.globalAlpha = 1;
      }

      function tick() {
        if (needsDraw) { draw(); needsDraw = false; }
        requestAnimationFrame(tick);
      }

      resize();
      home.classList.add('home-bg-live'); // only now -- canvas confirmed up, safe to drop the CSS fallback
      requestAnimationFrame(tick);

      window.addEventListener('mousemove', (ev) => { mouseX = ev.clientX; mouseY = ev.clientY; requestDraw(); }, { passive: true });
      window.addEventListener('mouseleave', () => { mouseX = mouseY = -9999; requestDraw(); });
      window.addEventListener('scroll', requestDraw, { passive: true });
      window.addEventListener('resize', resize);
    }
  }
})();
