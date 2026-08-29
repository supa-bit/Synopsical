// Synopsical — homepage motion, shared by index.html/info.html/pricing.html/
// privacy.html. Public marketing pages only; never loaded by (and has no
// effect on) the signed-in app.
//
// Three independent, all-progressive-enhancement pieces:
//   1. Scroll-triggered reveal for .mkt-reveal elements (feature cards,
//      the closing line).
//   2. A soft glow that follows the cursor in the hero, desktop only.
//   3. The live background: same dot grid as style.css's static one,
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
// glow/live-background simply don't exist. Nothing is ever lost --
// style.css's plain CSS dot grid is what's left in that case.

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

  // ── 2. Cursor-follow glow in the hero (desktop pointer only) ────
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

  // ── 3. Live background: the same dot grid, on <canvas> ──────────
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
      const paperColor = style.getPropertyValue('--mkt-paper').trim() || '#f3f5f7';
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
        // Fill, not clear -- the canvas owns the paper-color background
        // now that #homepage's own is set to transparent once .home-bg-
        // live is added (see that class's comment in style.css). A plain
        // clearRect here would leave the canvas transparent and let
        // body's own (dark, app-colored) background show through instead.
        ctx2d.fillStyle = paperColor;
        ctx2d.fillRect(0, 0, w, h);

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
