/* Veloci Global Markets — homepage choreography.
 *
 * Scroll-scrubbed pieces use GSAP + ScrollTrigger (vendor/) and only run when
 * they loaded and the visitor has not asked for reduced motion; everything
 * else here is plain DOM work that always runs. Loaded with `defer` after
 * site-fx.js, so VelociFX helpers and the smooth scroller already exist.
 */
(function () {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine   = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* Spread table: meters scaled to the widest market spread, plus how much tighter Veloci is. */
  function spreadMeters() {
    const rows = Array.from(document.querySelectorAll('.cmp-table tbody tr')).map(tr => {
      const usEl = tr.querySelector('.cmp-td-us .cmp-val'), mktEl = tr.querySelector('.cmp-td-mkt .cmp-val');
      if (!usEl || !mktEl) return null;
      const us = parseFloat(usEl.dataset.countText || usEl.textContent), mkt = parseFloat(mktEl.textContent);
      return isFinite(us) && isFinite(mkt) && mkt > 0 ? { tr, us, mkt } : null;
    }).filter(Boolean);
    const max = Math.max(...rows.map(r => Math.max(r.us, r.mkt)));
    rows.forEach(({ tr, us, mkt }) => {
      const meter = w => `<span class="cmp-meter" aria-hidden="true"><i style="--w:${(w / max).toFixed(3)}"></i></span>`;
      const saving = Math.round((1 - us / mkt) * 100);
      tr.querySelector('.cmp-td-us').insertAdjacentHTML('beforeend', meter(us) + (saving > 0 ? `<span class="cmp-save">${saving}% tighter</span>` : ''));
      tr.querySelector('.cmp-td-mkt').insertAdjacentHTML('beforeend', meter(mkt));
    });
  }

  /* Footer wordmark lights up under the cursor. */
  function footerSpotlight() {
    const el = document.querySelector('.ft-mega');
    if (!el || !fine) return;
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--fx', (e.clientX - r.left).toFixed(0) + 'px');
      el.style.setProperty('--fy', (e.clientY - r.top).toFixed(0) + 'px');
    });
  }

  /* Markets showcase without pinning (touch, narrow screens, no GSAP): swipe + live counter. */
  function marketsSwipe() {
    const section = document.querySelector('.mx');
    if (!section) return;
    const vp = section.querySelector('.mx-viewport');
    const cards = Array.from(section.querySelectorAll('.mx-card'));
    const hint = section.querySelector('.mx-hint');
    if (!fine && hint) hint.textContent = 'Swipe to explore';
    // Mouse users can drag the strip when it is not pinned (short desktop windows).
    let drag = null;
    vp.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || section.classList.contains('mx-pinned') || e.target.closest('a')) return;
      drag = { x: e.clientX, left: vp.scrollLeft };
      vp.style.scrollSnapType = 'none';
    });
    window.addEventListener('pointermove', e => {
      if (!drag) return;
      vp.scrollLeft = drag.left - (e.clientX - drag.x);
    });
    window.addEventListener('pointerup', () => {
      if (!drag) return;
      drag = null;
      vp.style.scrollSnapType = '';
    });

    let queued = false;
    vp.addEventListener('scroll', () => {
      if (queued || section.classList.contains('mx-pinned')) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const max = vp.scrollWidth - vp.clientWidth;
        const p = max > 0 ? vp.scrollLeft / max : 0;
        setMarketsProgress(section, p, cards.length);
      });
    }, { passive: true });
  }
  function setMarketsProgress(section, p, n) {
    section.style.setProperty('--mx-p', p.toFixed(4));
    const b = section.querySelector('.mx-count b');
    const i = Math.min(n, Math.round(p * (n - 1)) + 1);
    if (b && b.textContent !== String(i).padStart(2, '0')) b.textContent = String(i).padStart(2, '0');
  }

  /* ── GSAP scenes ── */
  function statementFill(gsap) {
    const el = document.querySelector('.statement-text[data-fill]');
    if (!el || !window.VelociFX || !window.VelociFX.splitWords) return;
    const words = window.VelociFX.splitWords(el);
    gsap.fromTo(words, { opacity: 0.12, y: 10 }, {
      opacity: 1, y: 0, ease: 'none', stagger: 0.1,
      scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 42%', scrub: 0.6 },
    });
  }

  function marketsShowcase(gsap) {
    const section = document.querySelector('.mx');
    if (!section) return;
    const track = section.querySelector('.mx-track');
    const vp = section.querySelector('.mx-viewport');
    const cards = Array.from(section.querySelectorAll('.mx-card'));
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1025px) and (min-height: 620px)', () => {
      section.classList.add('mx-pinned');
      vp.scrollLeft = 0;
      const dist = () => Math.max(0, track.scrollWidth - vp.clientWidth);
      const tween = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: {
          trigger: section, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.7,
          invalidateOnRefresh: true, anticipatePin: 1,
          onUpdate: self => setMarketsProgress(section, self.progress, cards.length),
        },
      });
      cards.forEach(card => {
        const img = card.querySelector('.mx-img img');
        if (!img) return;
        gsap.fromTo(img, { rotate: -10, scale: 0.82, yPercent: 10 }, {
          rotate: 8, scale: 1.04, yPercent: -10, ease: 'none',
          scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
        });
      });
      return () => { section.classList.remove('mx-pinned'); gsap.set(track, { clearProps: 'transform' }); };
    });
  }

  function parallax(gsap) {
    const scrub = (targets, from, to, trigger, extra) => {
      if (!document.querySelector(targets)) return;
      gsap.fromTo(targets, from, Object.assign({ ease: 'none', scrollTrigger: Object.assign({ trigger, start: 'top bottom', end: 'bottom top', scrub: true }, extra) }, to));
    };
    scrub('.trade-man', { yPercent: 10 }, { yPercent: -4 }, '.trade');
    scrub('.trade-earnings-card', { y: 10 }, { y: -70 }, '.trade');
    scrub('.trade-support', { y: 90 }, { y: -70 }, '.trade');
    scrub('.trade-bg-oval', { y: -30, scale: 0.92 }, { y: 30, scale: 1.04 }, '.trade');
    scrub('.trade-bg-orange1, .trade-bg-orange2', { y: 80 }, { y: -80 }, '.trade');
    scrub('.trade-bg-teal', { y: -40 }, { y: 60 }, '.trade');
    scrub('.awards-features', { y: 40 }, { y: -20 }, '.awards');
    scrub('.ft-mega', { yPercent: 35, opacity: 0.2 }, { yPercent: 0, opacity: 1 }, 'footer', { start: 'top bottom', end: 'bottom bottom' });
    scrub('.startnow .sn-title', { scale: 0.9, y: 40 }, { scale: 1, y: 0 }, '.startnow', { end: 'center center' });
  }

  function init() {
    spreadMeters();
    footerSpotlight();
    marketsSwipe();
    const gsap = window.gsap, ST = window.ScrollTrigger;
    if (!gsap || !ST || reduce) return;
    gsap.registerPlugin(ST);
    statementFill(gsap);
    marketsShowcase(gsap);
    // Parallax only where there is room for it; phones keep the layouts static.
    gsap.matchMedia().add('(min-width: 769px)', () => parallax(gsap));
    // Layout settles as images and fonts arrive; re-measure pinned distances then.
    window.addEventListener('load', () => ST.refresh());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ST.refresh());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
