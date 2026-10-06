/* Veloci Global Markets — WebGL effects (raw WebGL 1, no dependencies).
 *
 *   .hs[data-fx-slider]   hero slides are re-rendered on a canvas so slide
 *                         changes become a liquid noise transition with an
 *                         ember edge, RGB split and a cursor lens. Listens to
 *                         the hs:change / hs:drag / hs:cancel events that
 *                         site-fx.js dispatches.
 *   [data-fx-ember]       animated domain-warped "ember flow" background.
 *
 * If WebGL is missing, the context is lost, or the visitor prefers reduced
 * motion, nothing here runs and the CSS fallbacks in site-fx.css stay in charge.
 * Load with `defer` after site-fx.js.
 */
(function () {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine   = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp  = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut   = t => 1 - Math.pow(1 - t, 3);

  /* ── Minimal GL helpers (also used by fx-globe.js) ── */
  const PRECISION = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
  const QUAD_VS = 'attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*.5+.5;gl_Position=vec4(aPos,0.,1.);}';
  const NOISE = `
    float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
  `;

  function getGL(canvas, opts) {
    const o = Object.assign({ antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' }, opts);
    return canvas.getContext('webgl', o) || canvas.getContext('experimental-webgl', o);
  }
  function shader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[fx] shader:', gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  function program(gl, vs, fs) {
    const v = shader(gl, gl.VERTEX_SHADER, vs), f = shader(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[fx] link:', gl.getProgramInfoLog(p)); return null; }
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  function quad(gl, prog) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog.p, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  /* Run `frame` every animation frame, but only while `el` is on screen and the tab is visible. */
  function visibleLoop(el, frame) {
    let raf = 0, inView = false;
    const tick = t => { raf = 0; frame(t); kick(); };
    const kick = () => { if (!raf && inView && !document.hidden) raf = requestAnimationFrame(tick); };
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; kick(); }, { rootMargin: '100px' }).observe(el);
    document.addEventListener('visibilitychange', kick);
    return { kick, stop: () => { inView = false; cancelAnimationFrame(raf); raf = 0; } };
  }
  /* Layout size (clientWidth/Height), so a host mid scale-in still gets full resolution. */
  function fitCanvas(gl, canvas, host, dprCap) {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = Math.max(1, Math.round(host.clientWidth * dpr)), h = Math.max(1, Math.round(host.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    return { w, h };
  }

  window.VelociGL = { PRECISION, NOISE, QUAD_VS, getGL, shader, program, quad, visibleLoop, fitCanvas };

  /* ── Hero: liquid slide transitions ── */
  const HERO_FS = PRECISION + NOISE + `
    varying vec2 vUv;
    uniform sampler2D uFrom, uTo;
    uniform vec2 uFromSize, uToSize, uRes, uMouse;
    uniform float uProgress, uDir, uTime, uZoomFrom, uZoomTo, uHover;

    vec2 cover(vec2 uv, vec2 tex, float zoom){
      float rs = uRes.x / uRes.y, rt = tex.x / tex.y;
      vec2 s = rs < rt ? vec2(rs / rt, 1.) : vec2(1., rt / rs);
      return (uv - .5) * s / zoom + .5;
    }
    vec3 rgb(sampler2D t, vec2 uv, vec2 off){
      return vec3(texture2D(t, uv + off).r, texture2D(t, uv).g, texture2D(t, uv - off).b);
    }
    void main(){
      vec2 uv = vUv;
      float aspect = uRes.x / uRes.y;
      float md = length((uv - uMouse) * vec2(aspect, 1.));
      float lens = smoothstep(.42, 0., md) * uHover;
      vec2 luv = uv - (uv - uMouse) * lens * .08 + (uMouse - .5) * -.025 * uHover;

      float p = uProgress, mask = 1., front = 0., n = .5;
      if (p > 0.) {
        n = fbm(luv * vec2(2.6, 1.7) + vec2(uTime * .12, -uTime * .05));
        float x = uDir > 0. ? 1. - luv.x : luv.x;
        float field = x + (n - .5) * .6;
        float edge = mix(-.4, 1.4, p);
        mask = smoothstep(edge - .09, edge + .09, field);
        front = 1. - abs(mask * 2. - 1.);
      }
      vec2 push = vec2(-uDir, 0.) * front * .1 + vec2(0., n - .5) * front * .14;
      vec2 off = vec2(front * .02 + lens * .007, 0.);
      vec3 col = rgb(uFrom, cover(luv + push, uFromSize, uZoomFrom), off);
      if (p > 0.) {
        vec3 b = rgb(uTo, cover(luv - push * .7, uToSize, uZoomTo), off);
        col = mix(b, col, mask);
        col += vec3(1., .36, .07) * pow(front, 3.5) * 1.15 + vec3(1., .8, .55) * pow(front, 20.) * .9;
      }
      col += vec3(1., .45, .15) * lens * .05;
      col += (hash(uv * uRes + fract(uTime * 7.) * 91.) - .5) * .045;
      gl_FragColor = vec4(col, 1.);
    }`;

  function initHero(hs) {
    const media = hs.querySelector('.hs-media');
    const bgs = Array.from(hs.querySelectorAll('.hs-bg'));
    if (!media || !bgs.length) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'hs-gl-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = getGL(canvas);
    if (!gl) return;
    const prog = program(gl, QUAD_VS, HERO_FS);
    if (!prog) return;
    media.appendChild(canvas);
    gl.useProgram(prog.p);
    quad(gl, prog);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const blank = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([6, 8, 15, 255]));

    function makeTex() {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function upload(slot, src) {
      gl.bindTexture(gl.TEXTURE_2D, slot.tex);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); return true; }
      catch (e) { return false; }
    }

    const slots = bgs.map(bg => {
      const video = bg.querySelector('video'), img = bg.querySelector('img');
      const slot = { tex: makeTex(), w: 1, h: 1, ready: false, video, zoomStart: performance.now() };
      const fromImage = el => {
        const go = () => { if (upload(slot, el)) { slot.w = el.naturalWidth; slot.h = el.naturalHeight; slot.ready = true; } };
        if (el.complete && el.naturalWidth) go(); else el.addEventListener('load', go, { once: true });
      };
      if (img) fromImage(img);
      if (video) {
        // Show the poster until the first decoded frame arrives.
        if (video.poster) {
          const p = new Image();
          p.addEventListener('load', () => { if (!slot.fromVideo && upload(slot, p)) { slot.w = p.naturalWidth; slot.h = p.naturalHeight; slot.ready = true; } }, { once: true });
          p.src = video.poster;
        }
        // Re-upload only when the decoder has produced a new frame, where the browser can tell us.
        const rvfc = 'requestVideoFrameCallback' in video;
        let fresh = true;
        if (rvfc) { const onFrame = () => { fresh = true; video.requestVideoFrameCallback(onFrame); }; video.requestVideoFrameCallback(onFrame); }
        slot.pullVideo = () => {
          if (!fresh || video.readyState < 2 || !video.videoWidth) return;
          if (upload(slot, video)) {
            slot.w = video.videoWidth; slot.h = video.videoHeight; slot.ready = slot.fromVideo = true;
            if (rvfc) fresh = false;
          }
        };
      }
      return slot;
    });

    let cur = Math.max(0, bgs.findIndex(b => b.classList.contains('is-active')));
    let from = cur, to = cur, progress = 0, anim = null, dir = 1, dragging = false;
    const mouse = { x: .5, y: .5, tx: .5, ty: .5, h: 0, th: 0 };
    hs.classList.add('hs-gl');

    function animateTo(target, dur, done) {
      const start = progress, t0 = performance.now();
      anim = now => {
        const k = clamp((now - t0) / dur, 0, 1);
        progress = start + (target - start) * easeInOut(k);
        if (k >= 1) { anim = null; done && done(); }
      };
      loop.kick();
    }

    hs.addEventListener('hs:change', e => {
      const d = e.detail;
      const wasDragging = dragging && to === d.to;
      dragging = false;
      if (!wasDragging) { from = cur; progress = 0; }
      to = d.to; dir = d.dir === 'prev' ? -1 : 1;
      slots[to].zoomStart = performance.now();
      animateTo(1, wasDragging ? 900 * (1 - progress) + 350 : 1500, () => { cur = from = to; progress = 0; });
    });
    hs.addEventListener('hs:drag', e => {
      const d = e.detail;
      if (!dragging || to !== d.to) { from = cur; to = d.to; slots[to].zoomStart = performance.now(); }
      dragging = true; anim = null;
      dir = d.dir === 'prev' ? -1 : 1;
      progress = clamp(d.progress, 0, 1) * 0.85;
      loop.kick();
    });
    hs.addEventListener('hs:cancel', () => {
      if (!dragging) return;
      dragging = false;
      animateTo(0, 500, () => { to = from = cur; });
    });

    if (fine) {
      hs.addEventListener('pointermove', e => {
        const r = hs.getBoundingClientRect();
        mouse.tx = (e.clientX - r.left) / r.width;
        mouse.ty = 1 - (e.clientY - r.top) / r.height;
        mouse.th = 1;
      });
      hs.addEventListener('pointerleave', () => { mouse.th = 0; });
    }

    const zoomOf = slot => 1.13 - 0.11 * easeOut(clamp((performance.now() - slot.zoomStart) / 9000, 0, 1));
    const t0 = performance.now();
    let size = { w: 1, h: 1 };
    const resize = () => { size = fitCanvas(gl, canvas, hs, fine ? 1.5 : 1); };
    resize();
    window.addEventListener('resize', resize);

    const loop = visibleLoop(hs, now => {
      if (anim) anim(now);
      mouse.x += (mouse.tx - mouse.x) * 0.08; mouse.y += (mouse.ty - mouse.y) * 0.08; mouse.h += (mouse.th - mouse.h) * 0.06;
      const a = slots[from], b = slots[to];
      [a, b].forEach(s => s.pullVideo && s.pullVideo());

      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.ready ? a.tex : blank);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b.ready ? b.tex : blank);
      gl.uniform1i(prog.u.uFrom, 0); gl.uniform1i(prog.u.uTo, 1);
      gl.uniform2f(prog.u.uFromSize, a.w, a.h); gl.uniform2f(prog.u.uToSize, b.w, b.h);
      gl.uniform2f(prog.u.uRes, size.w, size.h);
      gl.uniform2f(prog.u.uMouse, mouse.x, mouse.y);
      gl.uniform1f(prog.u.uHover, mouse.h);
      gl.uniform1f(prog.u.uProgress, from === to ? 0 : progress);
      gl.uniform1f(prog.u.uDir, dir);
      gl.uniform1f(prog.u.uTime, (now - t0) / 1000);
      gl.uniform1f(prog.u.uZoomFrom, zoomOf(a));
      gl.uniform1f(prog.u.uZoomTo, zoomOf(b));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });

    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      loop.stop();
      hs.classList.remove('hs-gl');
      canvas.remove();
    });
  }

  /* ── Ember flow background ── */
  const EMBER_FS = PRECISION + NOISE + `
    varying vec2 vUv;
    uniform vec2 uRes, uMouse;
    uniform float uTime, uHover;
    void main(){
      vec2 uv = vUv;
      float aspect = uRes.x / uRes.y;
      vec2 p = (uv - .5) * vec2(aspect, 1.);
      float t = uTime * .06;
      vec2 q = vec2(fbm(p * 1.5 + t), fbm(p * 1.5 + vec2(5.2, 1.3) - t));
      vec2 r = vec2(fbm(p * 1.9 + 3.6 * q + vec2(1.7, 9.2) + t * 1.4), fbm(p * 1.9 + 3.6 * q + vec2(8.3, 2.8) - t * 1.1));
      float f = fbm(p * 1.7 + 3.8 * r);
      float m = smoothstep(.55, 0., length((uv - uMouse) * vec2(aspect, 1.))) * uHover;
      float diag = smoothstep(-.2, 1.1, uv.x * .8 + uv.y * .25);
      vec3 col = mix(vec3(.016, .05, .035), vec3(.05, .16, .1), clamp(f * f * 2.2, 0., 1.));
      col = mix(col, vec3(.95, .34, .08), clamp((length(q) * f * 1.55 - .22) * diag + m * .45, 0., 1.));
      col = mix(col, vec3(1., .72, .42), clamp(pow(r.x * f, 3.) * 2.6 * diag + m * .2, 0., 1.) * .7);
      col *= .55 + .55 * smoothstep(1.25, .2, length((uv - .5) * vec2(1.1, 1.4)));
      col += (hash(uv * uRes + fract(uTime) * 50.) - .5) * .03;
      gl_FragColor = vec4(col, 1.);
    }`;

  function initEmber(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-ember-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = getGL(canvas);
    if (!gl) return;
    const prog = program(gl, QUAD_VS, EMBER_FS);
    if (!prog) return;
    host.prepend(canvas);
    host.classList.add('fx-ember-on');
    gl.useProgram(prog.p);
    quad(gl, prog);
    const mouse = { x: .7, y: .5, tx: .7, ty: .5, h: 0, th: 0 };
    if (fine) {
      host.addEventListener('pointermove', e => {
        const r = host.getBoundingClientRect();
        mouse.tx = (e.clientX - r.left) / r.width; mouse.ty = 1 - (e.clientY - r.top) / r.height; mouse.th = 1;
      });
      host.addEventListener('pointerleave', () => { mouse.th = 0; });
    }
    let size = { w: 1, h: 1 };
    const resize = () => { size = fitCanvas(gl, canvas, host, 0.75); };
    resize();
    window.addEventListener('resize', resize);
    const t0 = performance.now();
    const loop = visibleLoop(host, now => {
      mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05; mouse.h += (mouse.th - mouse.h) * 0.05;
      gl.uniform2f(prog.u.uRes, size.w, size.h);
      gl.uniform2f(prog.u.uMouse, mouse.x, mouse.y);
      gl.uniform1f(prog.u.uHover, mouse.h);
      gl.uniform1f(prog.u.uTime, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault(); loop.stop(); host.classList.remove('fx-ember-on'); canvas.remove();
    });
  }

  function init() {
    if (reduce) return;
    document.querySelectorAll('[data-fx-slider]').forEach(initHero);
    document.querySelectorAll('[data-fx-ember]').forEach(initEmber);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
