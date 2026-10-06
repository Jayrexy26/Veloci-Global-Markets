/* Veloci Global Markets — shared motion layer (pairs with site-fx.css).
 *
 * Load with `defer`. Everything is opt-in through data attributes (documented
 * at the top of site-fx.css). Optional upgrades are picked up when present:
 *   - vendor/lenis.min.js         smooth scrolling (body[data-fx-smooth])
 *   - vendor/gsap.min.js +
 *     vendor/ScrollTrigger.min.js scroll-scrubbed choreography (page scripts)
 *   - fx-webgl.js                 WebGL hero transitions / shader backgrounds
 *
 * Design rules:
 *   - No build step, plain browser JS like the rest of the site.
 *   - Respect prefers-reduced-motion: content shows immediately and nothing
 *     moves on its own (no autoplay, smooth scroll, parallax or cursor).
 *   - Only animate what is on screen: loops pause off-screen and in hidden tabs.
 *   - Touch devices get touch-native behaviour (no cursor, tilt or hijacked scroll).
 */
(function () {
  'use strict';

  const root = document.documentElement;
  root.classList.add('fx-js');

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine   = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp  = (v, a, b) => Math.min(b, Math.max(a, v));
  const FX = window.VelociFX = window.VelociFX || {};

  /* ── Tiny spring loop: lerps registered values toward their targets ── */
  const springs = new Set();
  let springRaf = 0;
  function spring(state) {
    springs.add(state);
    if (!springRaf) springRaf = requestAnimationFrame(stepSprings);
  }
  function stepSprings() {
    springRaf = 0;
    springs.forEach(s => {
      let settled = true;
      for (const k in s.target) {
        const d = s.target[k] - s.cur[k];
        if (Math.abs(d) > 0.01) { s.cur[k] += d * (s.k || 0.14); settled = false; }
        else s.cur[k] = s.target[k];
      }
      s.apply(s.cur);
      if (settled) springs.delete(s);
    });
    if (springs.size) springRaf = requestAnimationFrame(stepSprings);
  }

  /* ── Split text into masked words, keeping inline markup ── */
  function splitWords(el) {
    if (el.dataset.fxSplitDone) return el.querySelectorAll('.fx-w > span');
    el.dataset.fxSplitDone = '1';
    let i = 0;
    (function walk(node) {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === 3) {
          const parts = child.textContent.split(/(\s+)/);
          if (parts.every(p => !p.trim())) return;
          const frag = document.createDocumentFragment();
          parts.forEach(p => {
            if (!p) return;
            if (!p.trim()) { frag.appendChild(document.createTextNode(p)); return; }
            const w = document.createElement('span');
            w.className = 'fx-w';
            const inner = document.createElement('span');
            inner.style.setProperty('--i', i++);
            inner.textContent = p;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== 'BR' && !child.classList.contains('fx-w')) {
          walk(child);
        }
      });
    })(el);
    return el.querySelectorAll('.fx-w > span');
  }

  /* ── Count a number up, keeping its prefix, suffix, commas and decimals ── */
  function countUp(el) {
    const text = el.dataset.countText || (el.dataset.countText = el.textContent);
    const m = text.match(/\d[\d,]*(?:\.\d+)?/);
    if (!m) return;
    const raw = m[0];
    const target = parseFloat(raw.replace(/,/g, ''));
    if (!target) return;
    const decimals = (raw.split('.')[1] || '').length;
    const commas = raw.includes(',');
    const pre = text.slice(0, m.index), post = text.slice(m.index + raw.length);
    const fmt = v => {
      let s = v.toFixed(decimals);
      if (commas) {
        const [a, b] = s.split('.');
        s = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? '.' + b : '');
      }
      return pre + s + post;
    };
    const dur = +el.dataset.countDuration || 2000;
    const t0 = performance.now();
    el.style.fontVariantNumeric = 'tabular-nums';
    (function tick(now) {
      const p = clamp((now - t0) / dur, 0, 1);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = fmt(target * eased);
      if (p < 1) requestAnimationFrame(tick); else el.textContent = text;
    })(t0);
  }

  /* ── Decode text like a ticker board ── */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$%#/+';
  function scramble(el) {
    const text = el.dataset.scrambleText || (el.dataset.scrambleText = el.textContent);
    const dur = +el.dataset.scramble || 900, t0 = performance.now();
    (function tick(now) {
      const p = clamp((now - t0) / dur, 0, 1);
      const fixed = Math.floor(p * text.length);
      let out = text.slice(0, fixed);
      for (let i = fixed; i < text.length; i++) out += /\s/.test(text[i]) ? text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      el.textContent = out;
      if (p < 1) requestAnimationFrame(tick); else el.textContent = text;
    })(t0);
  }

  /* ── Smooth scrolling (Lenis), wired into GSAP's ticker when available ── */
  let lenis = null;
  function initSmooth() {
    if (!window.Lenis || reduce || !fine || !document.body.hasAttribute('data-fx-smooth')) return;
    const gsap = window.gsap, ST = window.ScrollTrigger;
    lenis = new window.Lenis({ lerp: 0.095, wheelMultiplier: 1, smoothWheel: true, allowNestedScroll: true, autoRaf: !gsap });
    if (gsap) {
      if (ST) lenis.on('scroll', ST.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }
    FX.lenis = lenis;
    // In-page anchors glide instead of jumping (bare "#" links are left alone).
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || a.getAttribute('href').length < 2) return;
      const target = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -72, duration: 1.4 });
    });
  }

  /* ── Scroll progress bar, glass nav that tucks away on scroll down ── */
  function initChrome() {
    const bar = document.createElement('div');
    bar.className = 'fx-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    const nav = document.querySelector('body > nav');
    if (nav) nav.classList.add('fx-nav');
    let queued = false, lastY = window.scrollY;
    const update = () => {
      queued = false;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty('--fx-scroll', max > 0 ? (y / max).toFixed(4) : 0);
      if (nav) {
        nav.classList.toggle('fx-scrolled', y > 24);
        const busy = nav.querySelector('.dd-open') || document.querySelector('[data-fx-drawer].open');
        if (y > 520 && y > lastY + 4 && !busy) nav.classList.add('fx-tucked');
        else if (y < lastY - 4 || y <= 520) nav.classList.remove('fx-tucked');
      }
      lastY = y;
    };
    window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    update();

    // Mobile drawer: stagger its items and freeze smooth scroll while it is open.
    document.querySelectorAll('[data-fx-drawer]').forEach(d => {
      Array.from(d.children).forEach((c, i) => c.style.setProperty('--i', i));
      new MutationObserver(() => {
        if (!lenis) return;
        if (d.classList.contains('open')) lenis.stop(); else lenis.start();
      }).observe(d, { attributes: true, attributeFilter: ['class'] });
    });
  }

  /* ── Cursor follower: a ring that trails the pointer and morphs over targets ── */
  function initCursor() {
    if (reduce || !fine || !document.body.hasAttribute('data-fx-cursor')) return;
    const ring = document.createElement('div');
    ring.className = 'fx-cursor-ring';
    ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = '<span class="fx-cursor-label"></span>';
    document.body.appendChild(ring);
    const label = ring.firstChild;
    const s = { cur: { x: -100, y: -100 }, target: { x: -100, y: -100 }, k: 0.2,
      apply: c => { ring.style.transform = `translate3d(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px,0)`; } };
    let mode = '';
    document.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      s.target.x = e.clientX; s.target.y = e.clientY;
      if (!ring.classList.contains('is-on')) { s.cur.x = e.clientX; s.cur.y = e.clientY; ring.classList.add('is-on'); }
      spring(s);
      const t = e.target.closest ? e.target.closest('[data-cursor],a,button,[role="button"],input,select,textarea,label') : null;
      const text = t && t.dataset.cursor ? t.dataset.cursor : '';
      const next = text ? 'label' : t ? 'link' : '';
      if (next !== mode || label.textContent !== text) {
        mode = next;
        ring.classList.toggle('is-link', mode === 'link');
        ring.classList.toggle('is-label', mode === 'label');
        label.textContent = text;
      }
    }, { passive: true });
    document.addEventListener('pointerdown', () => ring.classList.add('is-down'));
    document.addEventListener('pointerup', () => ring.classList.remove('is-down'));
    document.documentElement.addEventListener('pointerleave', () => ring.classList.remove('is-on'));
  }

  /* ── Auto mode (body[data-fx-auto]): word-reveal plain page headings ──
     For pages that keep their own reveal scripts; only touches headings that
     are safe to split (no media inside, no gradient-clipped text). */
  function initAuto() {
    if (!document.body.hasAttribute('data-fx-auto')) return;
    document.querySelectorAll('h1, h2').forEach(h => {
      if (h.hasAttribute('data-split') || h.closest('nav, footer, form, .mobile-nav, [data-no-fx]')) return;
      if (h.querySelector('img, svg, input, button, select, textarea')) return;
      const text = h.textContent.trim();
      if (!text || text.length > 140) return;
      // In a flex/grid heading every split word would become its own item and pick up the gap.
      if (/flex|grid/.test(getComputedStyle(h).display)) return;
      const clipped = [h, ...h.querySelectorAll('*')].some(el => {
        const cs = getComputedStyle(el);
        return (cs.webkitBackgroundClip || cs.backgroundClip) === 'text' || (cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color);
      });
      if (!clipped) h.setAttribute('data-split', '');
    });
  }

  /* ── Scroll-triggered reveals, word splits, counters, strokes, scrambles ── */
  function initReveals() {
    document.querySelectorAll('[data-stagger]').forEach(group => {
      const step = (+group.dataset.stagger || 80) / 1000;
      const base = parseFloat(group.dataset.staggerBase || 0);
      group.querySelectorAll(':scope > [data-reveal], :scope > * > [data-reveal]').forEach((el, i) => {
        el.style.setProperty('--fx-delay', (base + i * step).toFixed(3) + 's');
      });
    });
    document.querySelectorAll('[data-split]').forEach(splitWords);
    document.querySelectorAll('[data-draw]').forEach(p => {
      if (typeof p.getTotalLength === 'function') p.style.setProperty('--len', Math.ceil(p.getTotalLength()));
    });

    const targets = document.querySelectorAll('[data-reveal],[data-split],[data-count],[data-draw],[data-draw-fill],[data-scramble]');
    const show = el => {
      el.classList.add('fx-in');
      if (!reduce && el.hasAttribute('data-count')) countUp(el);
      if (!reduce && el.hasAttribute('data-scramble')) scramble(el);
      if (el.hasAttribute('data-reveal')) {
        const delay = parseFloat(getComputedStyle(el).getPropertyValue('--fx-delay')) || 0;
        setTimeout(() => el.classList.add('fx-done'), (delay + 1.15) * 1000);
      }
    };
    if (reduce || !('IntersectionObserver' in window)) { targets.forEach(show); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); show(e.target); } });
    }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(el => io.observe(el));
  }

  /* ── Pointer effects: tilt + glare, border glow, magnetic, parallax ── */
  function initPointerFx() {
    if (reduce || !fine) return;
    let active = null;
    const tiltOf = el => {
      if (el._fxTilt) return el._fxTilt;
      if (el.dataset.tiltGlare !== 'false' && !el.querySelector(':scope > .fx-glare')) {
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        const g = document.createElement('span');
        g.className = 'fx-glare' + (el.dataset.tiltGlare === 'dark' ? ' fx-glare-dark' : '');
        g.setAttribute('aria-hidden', 'true');
        el.appendChild(g);
      }
      const max = +el.dataset.tilt || 8, lift = +el.dataset.tiltLift || 0;
      return (el._fxTilt = {
        max, lift, k: 0.12,
        cur: { rx: 0, ry: 0, z: 0 }, target: { rx: 0, ry: 0, z: 0 },
        apply: c => {
          el.style.transform = (c.rx || c.ry || c.z)
            ? `perspective(1000px) translateY(${c.z.toFixed(2)}px) rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg)`
            : '';
        },
      });
    };
    const release = el => {
      const s = tiltOf(el);
      s.target.rx = s.target.ry = s.target.z = 0;
      el.classList.remove('fx-tilting');
      spring(s);
    };
    let glowEl = null;
    document.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || !e.target.closest) return;
      const g = e.target.closest('[data-glow]');
      if (g) {
        const r = g.getBoundingClientRect();
        g.style.setProperty('--gx', (e.clientX - r.left).toFixed(0) + 'px');
        g.style.setProperty('--gy', (e.clientY - r.top).toFixed(0) + 'px');
      }
      glowEl = g;
      const el = e.target.closest('[data-tilt]');
      if (active && active !== el) { release(active); active = null; }
      if (!el) return;
      active = el;
      const s = tiltOf(el);
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      s.target.ry = (px - 0.5) * 2 * s.max;
      s.target.rx = (0.5 - py) * 2 * s.max;
      s.target.z = -s.lift;
      el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      el.classList.add('fx-tilting');
      spring(s);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { if (active) { release(active); active = null; } });

    document.querySelectorAll('[data-magnetic]').forEach(el => {
      const strength = +el.dataset.magnetic || 0.35;
      const s = { cur: { x: 0, y: 0 }, target: { x: 0, y: 0 }, k: 0.16,
        apply: c => { el.style.translate = (c.x || c.y) ? `${c.x.toFixed(2)}px ${c.y.toFixed(2)}px` : ''; } };
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        s.target.x = (e.clientX - (r.left + r.width / 2)) * strength;
        s.target.y = (e.clientY - (r.top + r.height / 2)) * strength;
        spring(s);
      });
      el.addEventListener('pointerleave', () => { s.target.x = s.target.y = 0; spring(s); });
    });

    document.querySelectorAll('[data-parallax]').forEach(scope => {
      const range = +scope.dataset.parallax || 24;
      const layers = Array.from(scope.querySelectorAll('[data-depth]')).map(el => ({
        cur: { x: 0, y: 0 }, target: { x: 0, y: 0 }, k: 0.07, depth: +el.dataset.depth || 0.5,
        apply: c => { el.style.translate = (c.x || c.y) ? `${c.x.toFixed(2)}px ${c.y.toFixed(2)}px` : ''; },
      }));
      scope.addEventListener('pointermove', e => {
        const r = scope.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
        layers.forEach(l => { l.target.x = -nx * range * l.depth; l.target.y = -ny * range * l.depth; spring(l); });
      });
      scope.addEventListener('pointerleave', () => layers.forEach(l => { l.target.x = l.target.y = 0; spring(l); }));
    });
  }

  /* ── Hero slideshow: autoplay with progress tabs, keys, drag-to-scrub ──
     Emits hs:change {from,to,dir}, hs:drag {to,dir,progress} and hs:cancel so
     fx-webgl.js can render the transition; without it, CSS wipes take over. */
  function initSlider(hs) {
    const bgs     = Array.from(hs.querySelectorAll('.hs-bg'));
    const slides  = Array.from(hs.querySelectorAll('.hs-slide'));
    const tabs    = Array.from(hs.querySelectorAll('.hs-tab'));
    const countEl = hs.querySelector('.hs-count b');
    const sweep   = hs.querySelector('.hs-sweep');
    const total   = slides.length;
    const interval = +hs.dataset.interval || 7000;
    const emit = (type, detail) => hs.dispatchEvent(new CustomEvent(type, { detail }));
    let idx = Math.max(0, slides.findIndex(s => s.classList.contains('is-active')));
    let elapsed = 0, last = performance.now(), hover = false, focus = false, inView = true, raf = 0, drag = null, stopped = false;

    slides.forEach((s, i) => {
      s.setAttribute('role', 'group');
      s.setAttribute('aria-roledescription', 'slide');
      s.setAttribute('aria-label', `${i + 1} of ${total}`);
      s.querySelectorAll('.hs-title').forEach(splitWords);
      if (i !== idx) { s.setAttribute('aria-hidden', 'true'); s.inert = true; }
    });
    hs.querySelectorAll('img').forEach(img => { img.draggable = false; });

    function syncMedia() {
      bgs.forEach((bg, i) => {
        const v = bg.querySelector('video');
        if (!v) return;
        if (i === idx && inView && !stopped) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
        else v.pause();
      });
    }
    const paintTabs = progress => tabs.forEach((t, i) => t.style.setProperty('--p', i < idx ? 1 : i === idx ? progress.toFixed(4) : 0));

    function go(n, dir) {
      n = (n + total) % total;
      if (n === idx) return;
      dir = dir || (n > idx ? 'next' : 'prev');
      hs.dataset.dir = dir;
      const prev = idx;
      idx = n;
      bgs.forEach((bg, i) => {
        bg.classList.toggle('is-active', i === idx);
        bg.classList.toggle('is-leaving', i === prev);
      });
      clearTimeout(go._t);
      go._t = setTimeout(() => bgs[prev] && bgs[prev].classList.remove('is-leaving'), 1300);
      slides.forEach((s, i) => {
        const on = i === idx;
        s.classList.toggle('is-active', on);
        s.inert = !on;
        if (on) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
      });
      tabs.forEach((t, i) => {
        t.classList.toggle('is-active', i === idx);
        t.setAttribute('aria-selected', i === idx ? 'true' : 'false');
      });
      if (countEl) countEl.textContent = String(idx + 1).padStart(2, '0');
      if (sweep) { sweep.classList.remove('is-run'); void sweep.offsetWidth; sweep.classList.add('is-run'); }
      elapsed = 0;
      paintTabs(0);
      syncMedia();
      emit('hs:change', { from: prev, to: idx, dir });
    }

    function loop(now) {
      raf = 0;
      const dt = now - last; last = now;
      const held = root.classList.contains('fx-intro-on');
      if (!stopped && !hover && !focus && !drag && !held && inView && !document.hidden) {
        elapsed += dt;
        if (elapsed >= interval) go(idx + 1, 'next');
      }
      paintTabs(clamp(elapsed / interval, 0, 1));
      schedule();
    }
    function schedule() {
      if (!raf && !reduce && inView && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }

    tabs.forEach((t, i) => t.addEventListener('click', () => go(i)));
    const prevBtn = hs.querySelector('[data-hs-prev]'), nextBtn = hs.querySelector('[data-hs-next]');
    if (prevBtn) prevBtn.addEventListener('click', () => go(idx - 1, 'prev'));
    if (nextBtn) nextBtn.addEventListener('click', () => go(idx + 1, 'next'));
    const toggle = hs.querySelector('[data-hs-toggle]');
    if (toggle) {
      if (reduce) toggle.hidden = true;
      toggle.addEventListener('click', () => {
        stopped = !stopped;
        toggle.setAttribute('aria-pressed', stopped ? 'true' : 'false');
        toggle.setAttribute('aria-label', stopped ? 'Play slideshow' : 'Pause slideshow');
        const v = bgs[idx] && bgs[idx].querySelector('video');
        if (v) { if (stopped) v.pause(); else syncMedia(); }
      });
    }
    hs.addEventListener('keydown', e => {
      if (e.target.closest('input,textarea,select')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1, 'next'); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); go(idx - 1, 'prev'); }
    });
    if (fine) {
      hs.addEventListener('pointerenter', () => { hover = true; });
      hs.addEventListener('pointerleave', () => { hover = false; });
    }
    hs.addEventListener('focusin', e => { focus = e.target.matches(':focus-visible'); });
    hs.addEventListener('focusout', () => { focus = false; });

    // Drag / swipe: the WebGL layer scrubs the transition under the pointer.
    hs.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('a,button,input,select,textarea')) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false, p: 0 };
    });
    hs.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.on) {
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
        if (Math.abs(dx) < 12) return;
        drag.on = true;
        try { hs.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
        hs.classList.add('is-dragging');
      }
      drag.dir = dx < 0 ? 'next' : 'prev';
      drag.to = (idx + (dx < 0 ? 1 : -1) + total) % total;
      drag.p = clamp(Math.abs(dx) / (hs.clientWidth * 0.5), 0, 1);
      emit('hs:drag', { to: drag.to, dir: drag.dir, progress: drag.p });
    });
    const endDrag = cancel => {
      if (!drag) return;
      const d = drag; drag = null;
      hs.classList.remove('is-dragging');
      if (!d.on) return;
      if (!cancel && d.p > 0.16) go(d.to, d.dir); else emit('hs:cancel');
    };
    hs.addEventListener('pointerup', () => endDrag(false));
    hs.addEventListener('pointercancel', () => endDrag(true));

    // Scroll: media sinks, copy lifts and fades as the hero leaves.
    let queued = false;
    function onScroll() {
      queued = false;
      const r = hs.getBoundingClientRect();
      const p = clamp(-r.top / r.height, 0, 1);
      hs.style.setProperty('--hs-y', (p * r.height * 0.35).toFixed(1) + 'px');
      hs.style.setProperty('--hs-c', (p * -70).toFixed(1) + 'px');
      hs.style.setProperty('--hs-o', (1 - p * 1.4).toFixed(3));
    }
    if (!reduce) window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(onScroll); } }, { passive: true });

    new IntersectionObserver(([e]) => { inView = e.isIntersecting; syncMedia(); schedule(); }, { threshold: 0.15 }).observe(hs);
    document.addEventListener('visibilitychange', schedule);
    paintTabs(0);
    syncMedia();
    requestAnimationFrame(() => requestAnimationFrame(() => hs.classList.add('hs-ready')));
    schedule();
  }

  /* ── Marquee whose speed and skew follow scroll velocity ── */
  function initMarquee(el) {
    const track = el.querySelector('[data-fx-marquee-track]') || el.firstElementChild;
    if (!track) return;
    track.innerHTML += track.innerHTML.replace(/<img /g, '<img aria-hidden="true" alt="" ');
    const base = +el.dataset.fxMarquee || 60; // px per second
    let x = 0, v = 0, lastY = window.scrollY, lastT = performance.now(), raf = 0, inView = false, dirSign = 1, hover = false;
    el.addEventListener('pointerenter', () => { hover = true; });
    el.addEventListener('pointerleave', () => { hover = false; });
    function frame(now) {
      raf = 0;
      const dt = Math.min(64, now - lastT) / 1000; lastT = now;
      const y = window.scrollY, dy = y - lastY; lastY = y;
      if (dy) dirSign = dy > 0 ? 1 : -1;
      v += (clamp(dy / Math.max(dt, 0.001) / 1000, -6, 6) - v) * 0.1;
      const speed = reduce ? 0 : base * (hover ? 0.25 : 1) * (1 + Math.abs(v) * 1.6) * dirSign;
      const half = track.scrollWidth / 2;
      x -= speed * dt;
      if (half) { if (x <= -half) x += half; if (x > 0) x -= half; }
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0) skewX(${clamp(-v * 3, -10, 10).toFixed(2)}deg)`;
      if (inView && !document.hidden) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && inView && !document.hidden) { lastT = performance.now(); raf = requestAnimationFrame(frame); } };
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; kick(); }).observe(el);
    document.addEventListener('visibilitychange', kick);
  }

  /* ── Live market ticker (fed by /api/markets; stays hidden without data) ── */
  function initTicker(el) {
    const spec = (el.dataset.fxTicker || 'forex:6,indices:4,crypto:5').split(',').map(s => {
      const [market, n] = s.split(':');
      return { market: market.trim(), n: +n || 5 };
    });
    const track = el.querySelector('.fx-ticker-track');
    if (!track) return;
    const prev = new Map();
    const fmtSym = (name, market) => {
      const s = String(name || '').toUpperCase();
      return market === 'forex' && /^[A-Z]{6}$/.test(s) ? s.slice(0, 3) + '/' + s.slice(3) : s;
    };
    const fmtPx = v => {
      const a = Math.abs(v), d = a >= 10 ? 2 : a >= 1 ? 4 : 5;
      return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    };
    async function load() {
      const results = await Promise.all(spec.map(async ({ market, n }) => {
        try {
          const res = await fetch(`/api/markets?market=${encodeURIComponent(market)}`);
          if (!res.ok) return [];
          const json = await res.json();
          return (json.data || []).slice(0, n).map(it => {
            const d = it.d || [];
            return { key: it.s, sym: fmtSym(d[0], market), px: d[2], ch: d[3] };
          }).filter(r => r.sym && typeof r.px === 'number' && isFinite(r.px));
        } catch (e) { return []; }
      }));
      return results.flat();
    }
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function render(rows) {
      const html = rows.map(r => {
        const up = (r.ch || 0) >= 0;
        const before = prev.get(r.key);
        const flash = before != null && before !== r.px ? (r.px > before ? ' fx-flash-up' : ' fx-flash-dn') : '';
        return `<span class="fx-tick${flash}"><b>${esc(r.sym)}</b><span class="px">${fmtPx(r.px)}</span>` +
               `<span class="ch ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${Math.abs(r.ch || 0).toFixed(2)}%</span></span>`;
      }).join('');
      rows.forEach(r => prev.set(r.key, r.px));
      track.innerHTML = html + html.replace(/<span class="fx-tick/g, '<span aria-hidden="true" class="fx-tick');
      el.hidden = false;
      requestAnimationFrame(() => track.style.setProperty('--dur', Math.max(30, track.scrollWidth / 2 / 45).toFixed(1) + 's'));
    }
    let timer = 0;
    (async function refresh() {
      const rows = await load();
      if (rows.length) render(rows);
      clearTimeout(timer);
      timer = setTimeout(refresh, 30000);
    })();
  }

  /* ── Lazy scripts: [data-fx-lazy="file.js"] loads once it nears the viewport ── */
  function initLazy() {
    const els = document.querySelectorAll('[data-fx-lazy]');
    if (!els.length) return;
    const load = el => {
      const src = el.dataset.fxLazy;
      if (!src || document.querySelector(`script[src="${src}"]`)) return;
      const s = document.createElement('script');
      s.src = src; s.defer = true;
      document.body.appendChild(s);
    };
    if (!('IntersectionObserver' in window)) { els.forEach(load); return; }
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { io.unobserve(e.target); load(e.target); }
    }), { rootMargin: '900px 0px' });
    els.forEach(el => io.observe(el));
  }

  /* ── First-visit intro: counter + curtain, then the hero plays ── */
  function initIntro() {
    const intro = document.getElementById('fx-intro');
    if (!intro) return;
    if (!root.classList.contains('fx-intro-on')) { intro.remove(); return; }
    const num = intro.querySelector('[data-intro-num]');
    const t0 = performance.now(), minDur = 1300, maxDur = 2600;
    let loaded = document.readyState === 'complete';
    window.addEventListener('load', () => { loaded = true; }, { once: true });
    (function tick(now) {
      const t = now - t0;
      const goal = loaded ? 1 : 0.86;
      const p = Math.min(goal, t / minDur);
      if (num) num.textContent = Math.round(p * 100);
      intro.style.setProperty('--p', p.toFixed(3));
      if ((p >= 1 && t >= minDur) || t > maxDur) {
        if (num) num.textContent = '100';
        intro.classList.add('is-done');
        root.classList.remove('fx-intro-on');
        try { sessionStorage.setItem('vgm_intro', '1'); } catch (e) { /* private mode */ }
        setTimeout(() => intro.remove(), 1300);
        return;
      }
      requestAnimationFrame(tick);
    })(t0);
  }

  function init() {
    initIntro();
    initSmooth();
    initChrome();
    initCursor();
    initAuto();
    initReveals();
    initPointerFx();
    document.querySelectorAll('[data-fx-slider]').forEach(initSlider);
    document.querySelectorAll('[data-fx-marquee]').forEach(initMarquee);
    document.querySelectorAll('[data-fx-ticker]').forEach(initTicker);
    initLazy();
    document.dispatchEvent(new CustomEvent('fx:ready'));
  }

  Object.assign(FX, { splitWords, countUp, scramble, spring, reduce, fine, ready: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
