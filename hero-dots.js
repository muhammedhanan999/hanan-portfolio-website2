/* ==========================================================================
   MUHAMMED HANAN — hanan.in — hero-dots.js
   Cursor-reactive dot field behind the hero glass panel. 2D canvas — light.
   Dots repel and brighten near the pointer, drift gently otherwise.
   ========================================================================== */

(function () {
  'use strict';

  if (!window.gsap) return;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SPACING = 44;
  var REPEL_R = 150;
  var BASE_ALPHA = 0.13;
  var DOT = 'rgba(240,242,245,';

  document.addEventListener('DOMContentLoaded', function () {
    var holder = document.getElementById('hero-dots');
    var hero = document.getElementById('hero');
    if (!holder || !hero) return;

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    holder.appendChild(canvas);

    // DPR up to 2 keeps the dots crisp on high-density phones; capped at 2
    // so 3x screens don't over-render this decorative field. Recomputed in
    // build() so a DPR change (rotation, monitor move) re-sharpens correctly.
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, dots = [];

    function build() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = holder.clientWidth || 1;
      H = holder.clientHeight || 1;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      dots = [];
      var row = 0;
      for (var y = SPACING / 2; y < H; y += SPACING, row++) {
        var off = (row % 2) * (SPACING / 2);
        for (var x = SPACING / 2 + off; x < W; x += SPACING) {
          dots.push({ bx: x, by: y, x: x, y: y });
        }
      }
      if (REDUCED) drawStatic();
    }

    function drawStatic() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = DOT + BASE_ALPHA + ')';
      dots.forEach(function (d) {
        ctx.beginPath();
        ctx.arc(d.bx, d.by, 1.1, 0, 6.2832);
        ctx.fill();
      });
    }

    build();
    if (window.ResizeObserver) {
      new ResizeObserver(build).observe(holder);
    } else {
      window.addEventListener('resize', build);
    }

    if (REDUCED) return; // static field, no motion, no pointer tracking

    // store raw client coords; convert to canvas space once per frame using a
    // rect refreshed in the loop (holder scrolls, so a cached rect would drift)
    var pcx = -1e9, pcy = -1e9, mx = -9999, my = -9999;
    hero.addEventListener('pointermove', function (e) {
      pcx = e.clientX; pcy = e.clientY;
    }, { passive: true });
    hero.addEventListener('pointerleave', function () {
      pcx = -1e9; pcy = -1e9;
    }, { passive: true });

    // render only while the hero is on screen
    var visible = true;
    if (window.ScrollTrigger) {
      ScrollTrigger.create({
        trigger: hero,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: function (self) { visible = self.isActive; }
      });
    }

    var t = 0;
    function frame(time, deltaMS) {
      if (!visible) return;
      // self-heal: rebuild if the holder size changed and the observer
      // callback hasn't landed yet (rotation, viewport switch)
      if (Math.abs((holder.clientWidth || 1) - W) > 2) build();
      t += (deltaMS || 16.7) / 1000;
      // one layout read per frame (bounded), not per pointer event
      if (pcx > -1e8) {
        var r = holder.getBoundingClientRect();
        mx = pcx - r.left; my = pcy - r.top;
      } else { mx = -9999; my = -9999; }
      ctx.clearRect(0, 0, W, H);
      var R2 = REPEL_R * REPEL_R;
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        var tx = d.bx + Math.sin(t * 0.5 + d.by * 0.02) * 2.4;
        var ty = d.by + Math.cos(t * 0.4 + d.bx * 0.018) * 2.4;
        var dx = tx - mx, dy = ty - my;
        var dist2 = dx * dx + dy * dy;
        var size = 1.1, alpha = BASE_ALPHA;
        if (dist2 < R2) {
          var dist = Math.sqrt(dist2) || 1;
          var f = 1 - dist / REPEL_R;
          tx += (dx / dist) * f * 24;
          ty += (dy / dist) * f * 24;
          size = 1.1 + f * 1.7;
          alpha = BASE_ALPHA + f * 0.5;
        }
        d.x += (tx - d.x) * 0.12;
        d.y += (ty - d.y) * 0.12;
        ctx.beginPath();
        ctx.arc(d.x, d.y, size, 0, 6.2832);
        ctx.fillStyle = DOT + alpha + ')';
        ctx.fill();
      }
    }
    gsap.ticker.add(frame);

    window.addEventListener('pagehide', function () {
      gsap.ticker.remove(frame);
    });

    // QA/debug handle
    window.__heroDots = { count: function () { return dots.length; }, canvas: canvas };
  });
})();
