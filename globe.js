/* ==========================================================================
   MUHAMMED HANAN — hanan.in — globe.js
   Premium dot-matrix Earth on graphite. Cursor-interactive. Scroll (pinned):
   short rotation to India → zoom → accurate Kerala outline draws → camera
   flies through the coastline → fade into the hero. No labels, no text.
   Dot/outline data: globe-data.js (generated from real geo data).
   ========================================================================== */

(function () {
  'use strict';

  if (!window.THREE || !window.gsap || !window.ScrollTrigger || !window.GLOBE_DATA) return;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TOUCH = 'ontouchstart' in window;
  var DEG = Math.PI / 180;
  var DATA = window.GLOBE_DATA;

  var KC_LAT = DATA.keralaCenter[0] * DEG;   // ~10.67°N
  var KC_LON = DATA.keralaCenter[1] * DEG;   // ~76.27°E
  var VIEW = { x: KC_LAT, y: -KC_LON };      // rotation that faces Kerala to camera
  var GRAPHITE = 0x000000; // occluder must match the pure-black scene bg to stay invisible

  function latLon(lat, lon, r) {
    var phi = lat * DEG, lam = lon * DEG;
    return [
      r * Math.cos(phi) * Math.sin(lam),
      r * Math.sin(phi),
      r * Math.cos(phi) * Math.cos(lam)
    ];
  }

  function dotTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    var tex = new THREE.CanvasTexture(c);
    return tex;
  }

  function pointsFrom(list, step, color, size, opacity, tex) {
    var pos = [];
    for (var i = 0; i < list.length; i += step) {
      var p = latLon(list[i][0], list[i][1], 1);
      pos.push(p[0], p[1], p[2]);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({
      color: color,
      size: size,
      map: tex,
      transparent: true,
      opacity: opacity,
      alphaTest: 0.05,
      depthWrite: false,
      sizeAttenuation: true
    });
    return new THREE.Points(geo, mat);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var holder = document.getElementById('globe-canvas');
    var section = document.getElementById('globe');
    var fade = document.querySelector('.globe-fade');
    var header = document.getElementById('site-header');
    if (!holder || !section) return;

    /* ---------- Scene ---------- */
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, 1, 0.005, 12);
    camera.position.z = 3.2;

    // antialias on + DPR up to 2: crisp on high-density phones. Geometry is
    // still reduced on touch (CIRCLE_SEGS below), so we buy sharpness without
    // more points. Cap at 2 so 3x phones don't render 9x the pixels.
    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    holder.appendChild(renderer.domElement);

    var rootGroup = new THREE.Group();  // scroll choreography
    var innerGroup = new THREE.Group(); // cursor / drag
    rootGroup.add(innerGroup);
    scene.add(rootGroup);

    // Occluder hides far-side dots; FrontSide so it vanishes once the camera dives inside
    var occluder = new THREE.Mesh(
      new THREE.SphereGeometry(0.992, 48, 32),
      new THREE.MeshBasicMaterial({ color: GRAPHITE, side: THREE.FrontSide })
    );
    innerGroup.add(occluder);

    var tex = dotTexture();
    var worldDots = pointsFrom(DATA.dots, TOUCH ? 2 : 1, 0xc2c8d2, 0.014, 0.85, tex);
    var indiaDots = pointsFrom(DATA.india, 1, 0xf0f2f5, 0.016, 0.9, tex);
    innerGroup.add(worldDots);
    innerGroup.add(indiaDots);

    // Kerala outline — accurate boundary, drawn in with the zoom
    var kPos = [];
    DATA.kerala.forEach(function (p) {
      var v = latLon(p[0], p[1], 1.003);
      kPos.push(v[0], v[1], v[2]);
    });
    // close the loop
    kPos.push(kPos[0], kPos[1], kPos[2]);
    var kGeo = new THREE.BufferGeometry();
    kGeo.setAttribute('position', new THREE.Float32BufferAttribute(kPos, 3));
    var kMat = new THREE.LineBasicMaterial({ color: 0xf0f2f5, transparent: true, opacity: 0 });
    var keralaLine = new THREE.Line(kGeo, kMat);
    var K_TOTAL = kPos.length / 3;
    kGeo.setDrawRange(0, 0);
    innerGroup.add(keralaLine);

    /* ---------- Size ---------- */
    function resize() {
      var w = holder.clientWidth || 1;
      var h = holder.clientHeight || 1;
      var dpr = Math.min(window.devicePixelRatio, 2);
      if (dpr !== renderer.getPixelRatio()) renderer.setPixelRatio(dpr);
      camera.aspect = w / h;
      // Portrait phones are taller than wide, so the globe (sized by the fixed
      // vertical FOV) overflows the width. Zoom out on portrait so the whole
      // sphere fits and the Kerala zoom stays centered. Landscape = zoom 1
      // (desktop animation unchanged). Independent of the scroll z-animation.
      camera.zoom = Math.min(1, camera.aspect);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (REDUCED) renderer.render(scene, camera);
    }
    resize();
    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(holder);
    } else {
      window.addEventListener('resize', resize);
    }

    /* ---------- Reduced motion: static India view, everything visible ---------- */
    if (REDUCED) {
      rootGroup.rotation.x = VIEW.x;
      rootGroup.rotation.y = VIEW.y;
      camera.position.z = 2.2;
      kMat.opacity = 0.9;
      kGeo.setDrawRange(0, Infinity);
      renderer.render(scene, camera);
      return;
    }

    /* ---------- Header hidden while the globe owns the screen ---------- */
    gsap.set(header, { autoAlpha: 0 });

    /* ---------- Cursor / drag interaction (damped, influence fades with scrub) ---------- */
    var targetX = 0, targetY = 0, dragging = false, lastPX = 0, lastPY = 0;
    var scrollProgress = 0;

    section.addEventListener('pointerdown', function (e) {
      dragging = true; lastPX = e.clientX; lastPY = e.clientY;
    }, { passive: true });
    window.addEventListener('pointerup', function () { dragging = false; }, { passive: true });
    window.addEventListener('pointermove', function (e) {
      if (dragging) {
        targetY += (e.clientX - lastPX) * 0.005;
        targetX += (e.clientY - lastPY) * 0.005;
        targetX = Math.max(-0.6, Math.min(0.6, targetX));
        lastPX = e.clientX; lastPY = e.clientY;
      } else if (!TOUCH) {
        targetY = (e.clientX / window.innerWidth - 0.5) * 0.28;
        targetX = (e.clientY / window.innerHeight - 0.5) * 0.22;
      }
    }, { passive: true });

    var idle = 0;
    var pinST = null; // set once the timeline exists
    function renderFrame(time, deltaMS) {
      // perf: once the pin is done and the globe has scrolled fully out of
      // view (covered by the hero), skip rendering — zero visual change
      if (pinST && pinST.progress >= 1 && window.scrollY > pinST.end + window.innerHeight) return;
      // idle/cursor influence must be fully gone BEFORE the Kerala zoom
      // (~progress 0.42), or residual drift slides Kerala off the tight frame.
      // Ramp to 0 by progress ~0.36 instead of lingering to the very end.
      var inf = Math.max(0, 1 - scrollProgress * 2.8);
      var inf2 = inf * inf;
      idle += (deltaMS || 16.7) * 0.000018 * inf2; // accrues only near rest
      idle *= 1 - 0.05 * (1 - inf2);               // decays away while scrolling
      innerGroup.rotation.y += ((targetY * inf2 + idle) - innerGroup.rotation.y) * 0.06;
      innerGroup.rotation.x += (targetX * inf2 - innerGroup.rotation.x) * 0.06;
      renderer.render(scene, camera);
    }
    gsap.ticker.add(renderFrame);

    /* ---------- Scroll choreography ---------- */
    // Start ~110° west of Kerala with a slight tilt — short travel, no long spin
    var Y0 = VIEW.y + 1.9;
    var X0 = -0.12;
    rootGroup.rotation.y = Y0;
    rootGroup.rotation.x = X0;

    var draw = { k: 0 };
    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: '+=380%',
        pin: true,
        scrub: 1,
        onUpdate: function (self) { scrollProgress = self.progress; }
      }
    });

    tl
      // 1) settle onto India — ~110° of rotation, gentle zoom
      .to(rootGroup.rotation, { x: VIEW.x, y: VIEW.y, ease: 'power1.inOut', duration: 0.3 }, 0)
      .to(camera.position, { z: 2.35, ease: 'power1.inOut', duration: 0.3 }, 0)
      // 2) approach South India; India dots brighten, world recedes
      .to(camera.position, { z: 1.55, ease: 'power1.inOut', duration: 0.18 }, 0.3)
      .to(indiaDots.material, { opacity: 1, ease: 'none', duration: 0.15 }, 0.32)
      .to(worldDots.material, { opacity: 0.4, ease: 'none', duration: 0.18 }, 0.32)
      // 3) Kerala outline draws while the camera closes in
      .to(kMat, { opacity: 0.95, ease: 'none', duration: 0.08 }, 0.42)
      .to(draw, {
        k: 1, ease: 'power1.inOut', duration: 0.16,
        onUpdate: function () { kGeo.setDrawRange(0, Math.floor(K_TOTAL * draw.k)); }
      }, 0.43)
      .to(camera.position, { z: 1.12, ease: 'power1.inOut', duration: 0.16 }, 0.44)
      // 4) fly through the coastline; dots streak past; full blackout
      .to(camera.position, { z: 0.988, ease: 'power2.in', duration: 0.16 }, 0.6)
      .to(worldDots.material, { size: 0.03, ease: 'power2.in', duration: 0.16 }, 0.6)
      .to(indiaDots.material, { size: 0.036, ease: 'power2.in', duration: 0.16 }, 0.6)
      .to(kMat, { opacity: 0, ease: 'none', duration: 0.06 }, 0.68)
      .to(fade, { opacity: 1, ease: 'power1.in', duration: 0.1 }, 0.66)
      // 0.76–0.80: held blackout — a breath between chapters
      // 5) hero introduction — its own scroll chapter, staggered
      .fromTo('.hero-dots', { autoAlpha: 0 }, { autoAlpha: 1, ease: 'none', duration: 0.12 }, 0.8)
      .fromTo('.hero-copy .tag-line',
        { autoAlpha: 0, y: 30, filter: 'blur(14px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', ease: 'power2.out', duration: 0.08 }, 0.82)
      .fromTo('.hero-headline',
        { autoAlpha: 0, y: 44, filter: 'blur(16px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', ease: 'power2.out', duration: 0.1 }, 0.85)
      .fromTo('.hero-sub',
        { autoAlpha: 0, y: 40, filter: 'blur(14px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', ease: 'power2.out', duration: 0.1 }, 0.89)
      .fromTo('.hero-ctas',
        { autoAlpha: 0, y: 30, filter: 'blur(12px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', ease: 'power2.out', duration: 0.08 }, 0.93)
      .fromTo('.hero-copy .trust-line',
        { autoAlpha: 0, y: 20, filter: 'blur(10px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', ease: 'power2.out', duration: 0.07 }, 0.96)
      .to(header, { autoAlpha: 1, ease: 'none', duration: 0.05 }, 0.95);

    pinST = tl.scrollTrigger; // enables the render-skip gate above

    // main.js creates its triggers first; keep refresh order = document order
    ScrollTrigger.sort();
    ScrollTrigger.refresh();

    /* ---------- Dispose ---------- */
    window.addEventListener('pagehide', function () {
      gsap.ticker.remove(renderFrame);
      tex.dispose();
      scene.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(function (m) {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      renderer.dispose();
    });

    // QA/debug handle
    window.__globe = {
      rootGroup: rootGroup, innerGroup: innerGroup, camera: camera,
      mats: { world: worldDots.material, india: indiaDots.material, kerala: kMat },
      keralaGeo: kGeo, keralaTotal: K_TOTAL
    };
  });
})();
