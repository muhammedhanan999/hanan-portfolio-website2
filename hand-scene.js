/* ==========================================================================
   MUHAMMED HANAN — hanan.in — hand-scene.js
   Frosted-glass 3D hand, Lenis-smooth scroll choreography.
   Contact: both hands go horizontal around the connect button (second hand
   upside down); they draw together as the cursor nears the button and drift
   apart as it leaves. Loads assets/hand.glb — SVG hands remain the fallback.
   ========================================================================== */

(function () {
  'use strict';

  if (!window.THREE || !window.gsap || !window.ScrollTrigger) return;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TOUCH = 'ontouchstart' in window;

  // canonical correction applied to the raw GLB so the index finger points +Y
  // (tune after inspecting the exported model)
  var MODEL_ADJUST = { x: 0, y: 0, z: 0 }; // Meshy exports upright Y-up; verified empirically below

  var HAND_LEN = 3.4;   // normalised model height (world units)
  var TIP = HAND_LEN / 2; // fingertip offset from model centre along +Y

  /* ==========================================================================
     LOOK SWITCH — 'particles' (Meshy-style generating point cloud) | 'glass'
     (the original frosted fresnel hand).

     TO REVERT PERMANENTLY: change the line below to 'glass' and bump
     hand-scene.js?v= in index.html. Nothing else needs touching.
     TO COMPARE LIVE: append ?hand=glass or ?hand=particles to the URL.

     Only the surface look differs — scroll choreography, the contact two-hand
     meet, cursor magnetics and the forearm dissolve are shared by both modes.
     ========================================================================== */
  var HAND_MODE = 'particles';
  (function () {
    var m = /[?&]hand=(particles|glass)/.exec(window.location.search);
    if (m) HAND_MODE = m[1];
  })();

  // point budget — halved on phones/touch to keep the fill rate sane.
  // Resolved at init (not parse) time: innerWidth can still be 0 while the
  // document is parsing, which would silently hand desktops the phone budget.
  function pointBudget() {
    var w = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    return (w && w < 768) || TOUCH ? 14000 : 28000;
  }

  /* ---------- Flatten every mesh under `root` into a triangle soup ----------
     Returns positions/normals in root-local space so the result drops straight
     into the existing normalise → centre → scale pipeline. */
  function collectTris(root) {
    root.updateWorldMatrix(true, true);
    var invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    var recs = [], total = 0;
    root.traverse(function (o) {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      var g = o.geometry;
      var n = Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3) * 3;
      if (!n) return;
      recs.push({ o: o, n: n });
      total += n;
    });
    if (!total) return null;

    var V = new Float32Array(total * 3);
    var N = new Float32Array(total * 3);
    var w = 0;
    var v3 = new THREE.Vector3(), n3 = new THREE.Vector3();
    recs.forEach(function (rec) {
      var g = rec.o.geometry;
      var posA = g.attributes.position, nrmA = g.attributes.normal, idx = g.index;
      var m4 = new THREE.Matrix4().multiplyMatrices(invRoot, rec.o.matrixWorld);
      var m3 = new THREE.Matrix3().getNormalMatrix(m4);
      for (var i = 0; i < rec.n; i++) {
        var vi = idx ? idx.getX(i) : i;
        v3.fromBufferAttribute(posA, vi).applyMatrix4(m4);
        n3.fromBufferAttribute(nrmA, vi).applyMatrix3(m3).normalize();
        V[w] = v3.x; V[w + 1] = v3.y; V[w + 2] = v3.z;
        N[w] = n3.x; N[w + 1] = n3.y; N[w + 2] = n3.z;
        w += 3;
      }
    });
    return { V: V, N: N, triCount: total / 3 };
  }

  /* ---------- Area-weighted surface sampling ----------
     Picking triangles by area (not by index) keeps the cloud evenly dense —
     sampling raw mesh vertices instead would clump wherever the model happens
     to be finely tessellated. */
  function sampleCloud(soup, count) {
    var V = soup.V, N = soup.N, triCount = soup.triCount;
    var cum = new Float32Array(triCount);
    var total = 0;
    var ab = new THREE.Vector3(), ac = new THREE.Vector3(), cr = new THREE.Vector3();
    var t, o;
    for (t = 0; t < triCount; t++) {
      o = t * 9;
      ab.set(V[o + 3] - V[o], V[o + 4] - V[o + 1], V[o + 5] - V[o + 2]);
      ac.set(V[o + 6] - V[o], V[o + 7] - V[o + 1], V[o + 8] - V[o + 2]);
      total += cr.crossVectors(ab, ac).length() * 0.5;
      cum[t] = total;
    }
    if (!(total > 0)) return null;

    var pos = new Float32Array(count * 3);
    var nrm = new Float32Array(count * 3);
    var rnd = new Float32Array(count * 2);
    var sct = new Float32Array(count * 3); // per-point hover-burst direction
    for (var i = 0; i < count; i++) {
      var r = Math.random() * total;
      var lo = 0, hi = triCount - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
      o = lo * 9;
      // uniform barycentric point in the triangle
      var u = Math.random(), v = Math.random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      var a = 1 - u - v, k = i * 3;
      pos[k]     = V[o] * a + V[o + 3] * u + V[o + 6] * v;
      pos[k + 1] = V[o + 1] * a + V[o + 4] * u + V[o + 7] * v;
      pos[k + 2] = V[o + 2] * a + V[o + 5] * u + V[o + 8] * v;
      nrm[k]     = N[o] * a + N[o + 3] * u + N[o + 6] * v;
      nrm[k + 1] = N[o + 1] * a + N[o + 4] * u + N[o + 7] * v;
      nrm[k + 2] = N[o + 2] * a + N[o + 5] * u + N[o + 8] * v;
      rnd[i * 2] = Math.random();      // twinkle phase
      rnd[i * 2 + 1] = Math.random();  // size / brightness variation

      // burst direction: random sphere biased outward along the surface normal,
      // so a hover blows the cloud apart rather than sliding it sideways
      var sx = Math.random() * 2 - 1, sy = Math.random() * 2 - 1, sz = Math.random() * 2 - 1;
      var sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      sx = sx / sl * 0.75 + nrm[k] * 0.65;
      sy = sy / sl * 0.75 + nrm[k + 1] * 0.65;
      sz = sz / sl * 0.75 + nrm[k + 2] * 0.65;
      // spread the throw distance so the cloud frays instead of moving as a shell
      var mag = 0.35 + Math.random() * Math.random() * 1.5;
      sct[k] = sx * mag; sct[k + 1] = sy * mag; sct[k + 2] = sz * mag;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aNormal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 2));
    g.setAttribute('aScatter', new THREE.BufferAttribute(sct, 3));
    g.computeBoundingBox();
    return g;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var layer = document.querySelector('.hands-layer');
    var hero = document.getElementById('hero');
    var contact = document.getElementById('contact');
    var connectBtn = document.getElementById('connect-btn');
    if (!layer || !hero || !contact || !THREE.GLTFLoader) return;

    new THREE.GLTFLoader().load('assets/hand.glb', init, undefined, function () {
      // model not shipped yet — SVG fallback stays active
    });

    function init(gltf) {
      document.documentElement.classList.add('hand3d');

      /* ---------- Renderer / scene ---------- */
      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
      camera.position.z = 7;

      // antialias on + DPR up to 2 for crisp silhouette edges on phones
      var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;
      layer.appendChild(renderer.domElement);

      /* ---------- Ghost glass material: fresnel smoke-outline ----------
         Transparent body, silhouette edges glow — reads as a hand of smoke/
         glass on the graphite background. No lights or env map needed. */
      var ghost = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(0xdfe5ee) },
          uPower: { value: 2.4 },
          uEdge: { value: 0.9 },
          uBody: { value: 0.035 },
          uFadeMin: { value: 0 },  // set from geometry bbox below
          uFadeSpan: { value: 1 }, // forearm end dissolves over this span
          uOpacity: { value: 0.3 } // global fade — low over the hero, up by Work
        },
        vertexShader: [
          'varying vec3 vNormal;',
          'varying vec3 vView;',
          'varying float vLocalY;',
          'void main() {',
          '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
          '  vNormal = normalize(normalMatrix * normal);',
          '  vView = normalize(-mv.xyz);',
          '  vLocalY = position.y;',
          '  gl_Position = projectionMatrix * mv;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uColor;',
          'uniform float uPower;',
          'uniform float uEdge;',
          'uniform float uBody;',
          'uniform float uFadeMin;',
          'uniform float uFadeSpan;',
          'uniform float uOpacity;',
          'varying vec3 vNormal;',
          'varying vec3 vView;',
          'varying float vLocalY;',
          'void main() {',
          '  float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uPower);',
          '  float fade = smoothstep(uFadeMin, uFadeMin + uFadeSpan, vLocalY);',
          '  float a = (uBody + fres * uEdge) * fade * uOpacity;',
          '  gl_FragColor = vec4(uColor, a);',
          '}'
        ].join('\n'),
        transparent: true,
        depthWrite: false,
        // FrontSide (not Double): DoubleSide rendered each finger's near AND
        // far wall, doubling brightness through any "tube" shape. NormalBlending
        // (not Additive): additive SUMS overlapping layers, blowing joints
        // where fingers cross the palm out to solid white — normal composes
        // them instead, which is what actually reads as translucent glass.
        side: THREE.FrontSide,
        blending: THREE.NormalBlending
      });

      /* ---------- Particle material: shimmering "generating" point cloud ----------
         Each sampled point breathes along its surface normal and twinkles on its
         own random phase, so the silhouette holds while the surface stays alive.
         Additive over pure black: overlapping points build density into glow,
         which is what gives the cloud its volume. */
      var dots = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(0xe8edf5) },
          uTime: { value: 0 },
          uSize: { value: 6.8 },
          uDpr: { value: Math.min(window.devicePixelRatio, 2) },
          uJitter: { value: 0 },    // set from geometry span below
          uBurst: { value: 0 },     // hover-scatter travel, also from span
          uScatter: { value: 0 },   // 0..1 hover amount, driven per frame
          uBright: { value: 0.42 }, // master brightness — lower = softer glow
          uFadeMin: { value: 0 },
          uFadeSpan: { value: 1 },
          uOpacity: { value: 0.3 }
        },
        vertexShader: [
          'attribute vec3 aNormal;',
          'attribute vec2 aRand;',
          'attribute vec3 aScatter;',
          'uniform float uTime;',
          'uniform float uSize;',
          'uniform float uDpr;',
          'uniform float uJitter;',
          'uniform float uBurst;',
          'uniform float uScatter;',
          'uniform float uFadeMin;',
          'uniform float uFadeSpan;',
          'varying float vTwinkle;',
          'varying float vFade;',
          'varying float vScat;',
          'void main() {',
          '  float ph = aRand.x * 6.2831853;',
          // two detuned sines = wandering drift that never visibly loops
          '  float n = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 0.71 + ph * 2.1) * 0.4;',
          '  vec3 p = position + aNormal * n * uJitter;',
          // hover burst: throw each point along its own direction, with a slow
          // swirl layered on so the loose cloud keeps churning while held open
          '  float s = uScatter;',
          '  vec3 swirl = vec3(sin(uTime * 1.1 + ph * 1.7), cos(uTime * 0.9 + ph * 2.3), sin(uTime * 1.4 + ph));',
          '  p += aScatter * s * uBurst + swirl * s * uBurst * 0.22;',
          '  vScat = s;',
          '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
          '  vFade = smoothstep(uFadeMin, uFadeMin + uFadeSpan, position.y);',
          '  vTwinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 2.0 + ph * 3.0), 2.0);',
          '  gl_PointSize = uSize * uDpr * (0.55 + aRand.y * 0.9) * (3.0 / -mv.z);',
          '  gl_Position = projectionMatrix * mv;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uColor;',
          'uniform float uOpacity;',
          'uniform float uBright;',
          'varying float vTwinkle;',
          'varying float vFade;',
          'varying float vScat;',
          'void main() {',
          '  vec2 c = gl_PointCoord - 0.5;',
          '  float d = length(c);',
          '  if (d > 0.5) discard;',           // keep dots round, not square
          '  float soft = smoothstep(0.5, 0.05, d);',
          // spreading drops local density, so lift each point a touch while
          // scattered — otherwise the burst reads as fading out, not flying apart
          '  float a = soft * vTwinkle * vFade * uOpacity * uBright * (1.0 + vScat * 0.35);',
          '  gl_FragColor = vec4(uColor, a);',
          '}'
        ].join('\n'),
        transparent: true,
        depthWrite: false,   // points never occlude each other → volumetric density
        blending: THREE.AdditiveBlending
      });

      /* ---------- Normalise model: finger +Y, centred, height 3.4 ---------- */
      var model = gltf.scene;
      var mat = HAND_MODE === 'particles' ? dots : ghost;

      var P_COUNT = pointBudget();
      if (HAND_MODE === 'particles') {
        var soup = collectTris(model);
        var cloudGeo = soup && sampleCloud(soup, P_COUNT);
        if (cloudGeo) {
          var gb = cloudGeo.boundingBox;
          var span = gb.max.y - gb.min.y || 1;
          dots.uniforms.uFadeMin.value = gb.min.y;
          dots.uniforms.uFadeSpan.value = span * 0.3;
          dots.uniforms.uJitter.value = span * 0.008; // drift scales with the model
          dots.uniforms.uBurst.value = span * 0.20;   // how far a hover throws them
          // swap the mesh tree for the cloud — everything downstream is identical
          model = new THREE.Points(cloudGeo, dots);
        } else {
          HAND_MODE = 'glass'; // sampling failed → fall back rather than show nothing
          mat = ghost;
        }
      }

      if (HAND_MODE === 'glass') {
        model.traverse(function (o) {
          if (o.isMesh) {
            o.material = ghost;
            o.geometry.computeVertexNormals();
            o.geometry.computeBoundingBox();
            // forearm end (geometry min-Y) dissolves over the bottom 30%
            var gbx = o.geometry.boundingBox;
            ghost.uniforms.uFadeMin.value = gbx.min.y;
            ghost.uniforms.uFadeSpan.value = (gbx.max.y - gbx.min.y) * 0.3;
          }
        });
      }
      var wrap = new THREE.Group(); // canonical-orientation wrapper
      wrap.add(model);
      // scale + centre in UNROTATED wrap space first, then orient
      wrap.updateWorldMatrix(true, true);
      var box = new THREE.Box3().setFromObject(wrap);
      var size = box.getSize(new THREE.Vector3());
      var longest = Math.max(size.x, size.y, size.z) || 1;
      model.scale.setScalar(HAND_LEN / longest);
      wrap.updateWorldMatrix(true, true);
      box.setFromObject(wrap);
      var center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      wrap.rotation.set(MODEL_ADJUST.x, MODEL_ADJUST.y, MODEL_ADJUST.z);

      // hierarchy: prox (cursor magnetics, world space) > pose (scroll) > inner (idle) > wrap
      function chain(node) {
        var inner = new THREE.Group();
        inner.add(node);
        var pose = new THREE.Group();
        pose.add(inner);
        var prox = new THREE.Group();
        prox.add(pose);
        scene.add(prox);
        return { prox: prox, pose: pose, inner: inner };
      }
      var A = chain(wrap);

      var wrapB = wrap.clone(); // Points/Mesh clones share geometry + material
      wrapB.traverse(function (o) {
        if (o.isMesh || o.isPoints) o.material = mat;
      });
      var B = chain(wrapB);
      B.prox.visible = false;

      /* ---------- Size ---------- */
      function resize() {
        var w = layer.clientWidth || 1;
        var h = layer.clientHeight || 1;
        var dpr = Math.min(window.devicePixelRatio, 2);
        if (dpr !== renderer.getPixelRatio()) renderer.setPixelRatio(dpr);
        dots.uniforms.uDpr.value = dpr; // keep dot size constant in CSS pixels
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        if (REDUCED) renderer.render(scene, camera);
      }
      resize();
      if (window.ResizeObserver) {
        new ResizeObserver(resize).observe(layer);
      } else {
        window.addEventListener('resize', resize);
      }

      if (REDUCED) {
        A.pose.position.set(1.6, -0.3, 0);
        A.pose.rotation.set(0.05, 0.35, -0.08);
        // no ticker runs here, so lift the cloud to full presence for the one
        // static frame (the glass hand keeps its original 0.3 whisper)
        if (HAND_MODE === 'particles') dots.uniforms.uOpacity.value = 1;
        renderer.render(scene, camera);
        return;
      }

      /* ---------- Scroll choreography: hero → testimonial ---------- */
      A.pose.position.set(1.7, -0.5, 0);
      A.pose.rotation.set(0.04, 0.25, -0.06);

      var chor = gsap.timeline({
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          endTrigger: '#testimonial',
          end: 'bottom 60%',
          scrub: 1.2
        }
      });

      // Lenis-style: continuous Y spin across the page, drift + tilt layered on
      chor
        .to(A.pose.position, { x: 0.9, y: -0.35, duration: 0.2, ease: 'none' }, 0)
        .to(A.pose.rotation, { y: 1.75, x: 0.18, z: 0.1, duration: 0.2, ease: 'none' }, 0)
        .to(A.pose.position, { x: -1.1, y: -0.2, duration: 0.2, ease: 'none' }, 0.2)
        .to(A.pose.rotation, { y: 3.3, x: -0.06, z: 0.28, duration: 0.2, ease: 'none' }, 0.2)
        .to(A.pose.position, { x: 1.5, y: -0.45, duration: 0.2, ease: 'none' }, 0.4)
        .to(A.pose.rotation, { y: 4.9, x: 0.05, z: -0.1, duration: 0.2, ease: 'none' }, 0.4)
        .to(A.pose.position, { x: 0.6, y: -0.55, duration: 0.2, ease: 'none' }, 0.6)
        .to(A.pose.rotation, { y: Math.PI * 2, x: 0.02, z: -0.04, duration: 0.2, ease: 'none' }, 0.6);

      // pose the timeline hands over to the procedural contact blend
      // (ry ends at exactly 2π so the meet lerp holds orientation, no unwind)
      var SETTLE = { px: 0.6, py: -0.55, rx: 0.02, ry: Math.PI * 2, rz: -0.04 };

      /* ---------- Contact leg: procedural (tracks the moving button) ---------- */
      var meetP = 0;
      ScrollTrigger.create({
        trigger: contact,
        start: 'top 75%',
        end: 'center 45%',
        onUpdate: function (self) { meetP = self.progress; }
      });

      /* ---------- Cursor proximity + light parallax ---------- */
      var mouse = { x: -9999, y: -9999 };
      var targetRX = 0, targetRY = 0;
      window.addEventListener('pointermove', function (e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        targetRY = (e.clientX / window.innerWidth - 0.5) * 0.14;
        targetRX = (e.clientY / window.innerHeight - 0.5) * 0.1;
      }, { passive: true });
      var proxN = 0;  // smoothed 0..1 (1 = cursor on the button)
      var hoverN = 0; // smoothed 0..1 (1 = cursor over the hand → cloud bursts)
      var HOVER_NEAR = 0.9; // world units: full scatter inside this
      var HOVER_FAR = 1.9;  // ...easing to nothing out here (tight enough that
                            // crossing the hero copy doesn't stir the cloud)
      // the hand is ~3.4 tall but only ~1.2 wide, so squash the vertical axis of
      // the hit test — otherwise the fingertips sit outside their own hover zone
      var HOVER_YSQ = 0.55;

      function screenToWorld(px, py) {
        var w = layer.clientWidth || 1;
        var h = layer.clientHeight || 1;
        var halfH = Math.tan(camera.fov * Math.PI / 360) * camera.position.z;
        return {
          x: ((px / w) * 2 - 1) * halfH * camera.aspect,
          y: -((py / h) * 2 - 1) * halfH
        };
      }

      var ease = function (t) { return t * t * (3 - 2 * t); }; // smoothstep
      var lerp = function (a, b, t) { return a + (b - a) * t; };

      /* ---------- Render gate ---------- */
      var active = false;
      ScrollTrigger.create({
        trigger: hero,
        start: 'top bottom',
        endTrigger: 'body',
        end: 'bottom bottom',
        onToggle: function (self) { active = self.isActive; }
      });

      var t = 0;
      function renderFrame(time, deltaMS) {
        if (!active) return;
        // self-heal: if the canvas was sized before first layout, fix it
        if (renderer.domElement.width < 4 && layer.clientWidth > 4) resize();
        t += (deltaMS || 16.7) / 1000;

        var mp = ease(Math.min(1, Math.max(0, meetP)));
        var calm = 1 - mp; // float/parallax die off as the hands meet

        // global opacity: a faint whisper over the clean hero, up to full
        // presence by the time Work arrives (first ~12% of the choreography).
        // Keeps the hand from reading as a dark mass behind the hero text.
        mat.uniforms.uOpacity.value = 0.3 + 0.7 * Math.min(1, chor.progress() / 0.12);
        dots.uniforms.uTime.value = t;

        // hover scatter: cursor near the hand blows the cloud apart, and it
        // reassembles when the pointer leaves. Measured against the hand's own
        // world position so it tracks through the whole scroll choreography.
        // Dies off as the hands meet (calm) so the contact pose stays intact.
        if (HAND_MODE === 'particles') {
          var hTarget = 0;
          if (!TOUCH && mouse.x > -9998) {
            var mw = screenToWorld(mouse.x, mouse.y);
            var hdx = mw.x - A.pose.position.x;
            var hdy = (mw.y - A.pose.position.y) * HOVER_YSQ;
            var hd = Math.sqrt(hdx * hdx + hdy * hdy);
            hTarget = 1 - Math.min(1, Math.max(0, (hd - HOVER_NEAR) / (HOVER_FAR - HOVER_NEAR)));
          }
          // snap apart quickly, drift back together slowly — feels reactive
          hoverN += (hTarget - hoverN) * (hTarget > hoverN ? 0.16 : 0.055);
          dots.uniforms.uScatter.value = ease(hoverN) * calm;
        }

        // idle float: gentle bob + slow rotating drift (Lenis-style rest motion)
        var bobY = Math.sin(t * 0.7) * 0.05;
        var bobR = Math.sin(t * 0.45) * 0.02;
        var floatY = Math.sin(t * 0.35) * 0.16 * calm;
        var floatX = Math.sin(t * 0.22) * 0.06 * calm;
        [A.inner, B.inner].forEach(function (inner) {
          inner.position.y += (bobY - inner.position.y) * 0.05;
          inner.rotation.z += (bobR * calm - inner.rotation.z) * 0.05;
          inner.rotation.y += ((targetRY * calm + floatY) - inner.rotation.y) * 0.04;
          inner.rotation.x += ((targetRX * calm + floatX) - inner.rotation.x) * 0.04;
        });

        if (mp > 0.001 && connectBtn) {
          var r = connectBtn.getBoundingClientRect();
          var btn = screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
          var btnHalfW = screenToWorld(r.right, 0).x - screenToWorld(r.left + r.width / 2, 0).x;

          // cursor proximity → 0..1
          var targetN;
          if (TOUCH) {
            targetN = 0.35;
          } else {
            var dx = mouse.x - (r.left + r.width / 2);
            var dy = mouse.y - (r.top + r.height / 2);
            var d = Math.sqrt(dx * dx + dy * dy);
            var range = Math.max(window.innerWidth, window.innerHeight) * 0.42;
            targetN = 1 - Math.min(1, Math.max(0, (d - r.width * 0.5) / range));
          }
          proxN += (targetN - proxN) * 0.07;

          var gap = lerp(0.85, 0.22, ease(proxN)); // fingertip → button-edge gap
          var reach = TIP + btnHalfW + gap;

          // hand A: right side, horizontal, finger pointing LEFT at the button
          var ax = btn.x + reach;
          A.pose.position.x = lerp(SETTLE.px, ax, mp);
          A.pose.position.y = lerp(SETTLE.py, btn.y, mp);
          A.pose.rotation.x = lerp(SETTLE.rx, 0, mp);
          A.pose.rotation.y = lerp(SETTLE.ry, Math.PI * 2, mp);
          A.pose.rotation.z = lerp(SETTLE.rz, Math.PI / 2, mp);

          // hand B: left side, upside down (index on top), pointing RIGHT.
          // No X-flip — that only swaps front/back, invisible in silhouette.
          // Plain Rz(-90) leaves B knuckle-up while A sits knuckle-down.
          B.prox.visible = mp > 0.02;
          var bx = btn.x - reach;
          B.pose.position.x = lerp(btn.x - 7, bx, mp);
          B.pose.position.y = btn.y;
          B.pose.rotation.set(0, 0, -Math.PI / 2);
        } else {
          B.prox.visible = false;
          proxN += (0 - proxN) * 0.07;
        }

        renderer.render(scene, camera);
      }
      gsap.ticker.add(renderFrame);

      /* ---------- Dispose ---------- */
      window.addEventListener('pagehide', function () {
        gsap.ticker.remove(renderFrame);
        scene.traverse(function (obj) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(function (m) {
              m.dispose();
            });
          }
        });
        renderer.dispose();
      });

      // triggers were created async (after GLB load) — re-sort into document
      // order so pin spacing from the globe applies to their positions
      ScrollTrigger.sort();
      ScrollTrigger.refresh();

      window.__handScene = {
        A: A, B: B, camera: camera, ghost: ghost, dots: dots, mat: mat,
        mode: HAND_MODE, points: P_COUNT, chor: chor,
        state: function () { return { meetP: meetP, proxN: proxN, hoverN: hoverN }; }
      };
    }
  });
})();
