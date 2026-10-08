/* ==========================================================================
   MUHAMMED HANAN — hanan.in — main.js
   Lenis smooth scroll · loading screen · scroll reveals · char-split headline
   magnetic cursor (touch-adapted) · hand choreography · scrollspy · nav
   ========================================================================== */

(function () {
  'use strict';

  if (!window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  // scroll-choreographed page: always start at the top on reload —
  // restored mid-pin positions break the globe/hand trigger math
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TOUCH = 'ontouchstart' in window;
  var HEADER_OFFSET = 96;

  document.addEventListener('DOMContentLoaded', function () {

    /* ---------- Lenis smooth scroll ---------- */
    var lenis = null;
    if (window.Lenis && !REDUCED) {
      lenis = new Lenis({ autoRaf: false });
      window.__lenis = lenis; // exposed for debugging/QA
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) {
        lenis.raf(time * 1000);
      });
      gsap.ticker.lagSmoothing(0);
    }

    function scrollToTarget(target) {
      if (lenis) {
        lenis.scrollTo(target, { offset: -HEADER_OFFSET });
      } else {
        var el = typeof target === 'string' ? document.querySelector(target) : target;
        if (el) el.scrollIntoView(REDUCED ? {} : { behavior: 'smooth' });
      }
    }

    // Route all in-page anchors through Lenis
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var id = link.getAttribute('href');
        if (id.length < 2) return;
        var el = document.querySelector(id);
        if (!el) return;
        e.preventDefault();
        closeMobileNav();
        scrollToTarget(id);
      });
    });

    /* ---------- Character-split hero headline (no SplitText — vanilla) ---------- */
    var headline = document.getElementById('hero-headline');
    var chars = [];
    if (headline) {
      var text = headline.textContent;
      headline.setAttribute('aria-label', text);
      headline.textContent = '';
      text.split(' ').forEach(function (word, wi, arr) {
        var wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        wordSpan.setAttribute('aria-hidden', 'true');
        word.split('').forEach(function (ch) {
          var charSpan = document.createElement('span');
          charSpan.className = 'char';
          charSpan.textContent = ch;
          wordSpan.appendChild(charSpan);
          chars.push(charSpan);
        });
        headline.appendChild(wordSpan);
        if (wi < arr.length - 1) headline.appendChild(document.createTextNode(' '));
      });
    }

    function playHeadline() {
      if (REDUCED || !chars.length) return;
      gsap.fromTo(chars,
        { yPercent: 110, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.028 }
      );
    }

    /* ---------- Loading screen ---------- */
    var loader = document.getElementById('loading-screen');
    var counter = document.getElementById('loading-count');
    var ringFill = document.querySelector('.ring-fill');
    var RING_LEN = 339.292;

    function finishLoader() {
      if (!loader) { playHeadline(); return; }
      if (REDUCED) {
        loader.classList.add('is-done');
        return; // static fallback: no headline stagger either
      }
      gsap.to(loader, {
        opacity: 0,
        duration: 0.5,
        ease: 'power2.out',
        onComplete: function () {
          loader.classList.add('is-done');
          loader.style.opacity = '';
        }
      });
      playHeadline();
    }

    if (loader && counter && ringFill && !REDUCED) {
      var progress = { value: 0 };
      ringFill.style.strokeDashoffset = RING_LEN; // start empty (HTML default is full)
      counter.textContent = '0%';
      gsap.to(progress, {
        value: 100,
        duration: 1.7,
        ease: 'power2.inOut',
        onUpdate: function () {
          var v = Math.round(progress.value);
          counter.textContent = v + '%';
          ringFill.style.strokeDashoffset = RING_LEN * (1 - v / 100);
        },
        onComplete: finishLoader
      });
    } else {
      finishLoader();
    }

    /* ---------- Header: glass on scroll + scrollspy ---------- */
    var header = document.getElementById('site-header');

    ScrollTrigger.create({
      start: 80,
      end: 'max',
      onToggle: function (self) {
        header.classList.toggle('scrolled', self.isActive);
      }
    });

    // scroll cue fades out the moment the user scrolls, back in at the top
    var scrollCue = document.getElementById('scroll-cue');
    if (scrollCue) {
      var updateCue = function () {
        scrollCue.classList.toggle('is-hidden', window.scrollY > 40);
      };
      window.addEventListener('scroll', updateCue, { passive: true });
      updateCue();
    }

    ['work', 'services', 'about', 'contact'].forEach(function (id) {
      var section = document.getElementById(id);
      var link = document.querySelector('.nav-link[href="#' + id + '"]');
      if (!section || !link) return;
      ScrollTrigger.create({
        trigger: section,
        start: 'top 55%',
        end: 'bottom 45%',
        onToggle: function (self) {
          if (self.isActive) {
            document.querySelectorAll('.nav-link.active').forEach(function (a) {
              a.classList.remove('active');
            });
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        }
      });
    });

    /* ---------- Mobile nav ---------- */
    var toggle = document.getElementById('nav-toggle');

    function closeMobileNav() {
      if (!header.classList.contains('nav-open')) return;
      header.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      if (lenis) lenis.start();
    }

    toggle.addEventListener('click', function () {
      var open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
      if (lenis) { open ? lenis.stop() : lenis.start(); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMobileNav();
    });

    /* ---------- Scroll reveals (from-tweens: content is visible without JS) ---------- */
    if (!REDUCED) {
      var revealSelectors = [
        '.section-label', '.section-heading', '.contact-sub',
        '.project-card', '.work-note',
        '.service-card',
        '.about-body p', '.about-tagline', '.about-cta',
        '.quote-card',
        '.contact-card', '.contact-message p'
      ];
      gsap.utils.toArray(revealSelectors.join(',')).forEach(function (el, i) {
        gsap.from(el, {
          y: 36,
          opacity: 0,
          filter: 'blur(12px)',
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            once: true
          }
        });
      });
    }

    /* ---------- Hand choreography (sections 1–5 → meet at contact) ---------- */
    var handA = document.querySelector('.hand-left');   // sits right of centre
    var handB = document.querySelector('.hand-right');  // mirrored, enters at contact
    var hero = document.getElementById('hero');
    var contact = document.getElementById('contact');

    if (handA && handB && hero && contact && !REDUCED) {
      // Hidden over the globe section; fades in as the hero enters.
      // Scrubbed (not onEnter) so it stays correct after pin-spacing refreshes.
      gsap.fromTo(handA, { opacity: 0 }, {
        opacity: 0.1,
        ease: 'none',
        scrollTrigger: {
          trigger: hero,
          start: 'top 80%',
          end: 'top 25%',
          scrub: true
        }
      });

      // Gentle drift while travelling sections 1–5.
      // Targets the inner SVG so it can never fight the meet tween below,
      // which rotates the outer wrapper (transforms compose instead).
      var handASvg = handA.querySelector('.hand-svg');
      gsap.to(handASvg, {
        rotation: 8,
        yPercent: -6,
        ease: 'none',
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          endTrigger: '#testimonial',
          end: 'bottom center',
          scrub: 1.2
        }
      });

      // At contact: rotate horizontal, second hand mirrors in, fingertips
      // converge so the primary contact cards sit between them
      var meet = gsap.timeline({
        scrollTrigger: {
          trigger: contact,
          start: 'top 75%',
          end: 'center center',
          scrub: 1
        }
      });
      meet.to(handA, { rotation: -90, left: '60%', top: '50%', ease: 'power1.inOut' }, 0)
          .to(handASvg, { rotation: 0, yPercent: 0, ease: 'power1.inOut' }, 0)
          .fromTo(handB,
            { opacity: 0, rotation: 0 },
            { opacity: 0.1, rotation: 90, right: '105%', top: '50%', ease: 'power1.inOut' }, 0);
    }

    /* ---------- Cursor: magnetic on pointer, tap ripple on touch ---------- */
    if (TOUCH) {
      if (!REDUCED) {
        document.addEventListener('touchstart', function (e) {
          var t = e.touches[0];
          if (!t) return;
          var ripple = document.createElement('span');
          ripple.className = 'tap-ripple';
          ripple.style.left = t.clientX + 'px';
          ripple.style.top = t.clientY + 'px';
          document.body.appendChild(ripple);
          ripple.addEventListener('animationend', function () { ripple.remove(); });
        }, { passive: true });
      }
    } else {
      var dot = document.createElement('div');
      dot.className = 'cursor-dot';
      dot.setAttribute('aria-hidden', 'true');
      document.body.appendChild(dot);
      document.documentElement.classList.add('cursor-active');

      var mouse = { x: -100, y: -100 };
      var pos = { x: -100, y: -100 };
      var magnetTarget = null;

      document.addEventListener('mousemove', function (e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        dot.classList.add('is-visible');
      }, { passive: true });

      document.addEventListener('mouseleave', function () {
        dot.classList.remove('is-visible');
      }, { passive: true });

      var INTERACTIVE = 'a, button, .btn, .nav-link, .contact-card';
      document.querySelectorAll(INTERACTIVE).forEach(function (el) {
        el.addEventListener('mouseenter', function () {
          magnetTarget = el;
          dot.classList.add('is-hovering');
        });
        el.addEventListener('mouseleave', function () {
          magnetTarget = null;
          dot.classList.remove('is-hovering');
        });
      });

      gsap.ticker.add(function () {
        var tx = mouse.x;
        var ty = mouse.y;
        if (magnetTarget) {
          var r = magnetTarget.getBoundingClientRect();
          // Blend cursor toward the element's centre — the "magnetic" pull
          tx = mouse.x * 0.55 + (r.left + r.width / 2) * 0.45;
          ty = mouse.y * 0.55 + (r.top + r.height / 2) * 0.45;
        }
        var ease = REDUCED ? 1 : 0.18;
        pos.x += (tx - pos.x) * ease;
        pos.y += (ty - pos.y) * ease;
        dot.style.transform = 'translate(' + pos.x + 'px, ' + pos.y + 'px) translate(-50%, -50%)';
      });
    }

    ScrollTrigger.refresh();
  });

  /* ---------- Cleanup ---------- */
  window.addEventListener('pagehide', function () {
    ScrollTrigger.getAll().forEach(function (st) { st.kill(); });
  });
})();
