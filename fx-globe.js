/* Veloci Global Markets — live trading-sessions globe (raw WebGL 1).
 *
 * Lazy-loaded by site-fx.js when a [data-fx-globe] element nears the viewport.
 * Draws the continents as a dotted sphere lit by the real sun position right
 * now, links financial hubs with arcs carrying traveling pulses, and labels
 * each hub with its local time. Drag to spin; it eases back to auto-rotation.
 *
 * [data-fx-sessions] is filled with the four forex sessions (Sydney, Tokyo,
 * London, New York): live open/closed state, hours in the visitor's own time
 * zone, and a countdown. That part needs no WebGL and always runs. Clicking a
 * session turns the globe to its city.
 *
 * The land mask is a 360x180 1-bit equirectangular bitmap of Natural Earth
 * 1:50m land (via the world-atlas package), base64 encoded.
 */
(function () {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine   = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp  = (v, a, b) => Math.min(b, Math.max(a, v));
  const RAD = Math.PI / 180;
  const LAND = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAb/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///+DG////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAN////7////////AAAAAAAAAAAeAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAB////9////////4AAAAA7gAAD7/0AAAAfwAAAAAAAAAAAAAAAAAAAAAAAAAGA////A////////AAAAB//wAAAAAAACAAP9gAAAAAAAAAAAAAAAAAAAAAAAeH/v//9////////4AAAAB/+AAAAAAAAAAAAH6AAAAAAAAAAAAAAAAAAAAAAdcIh5P/A/////////AAAAAPHAAAAAAAAAABAA8AAAAAAAAAAAAAAAAAAAAAH/jH9///AP////////AAAAACAAAAAAAX4AAAB//+AAAAAAAAAAAAAAAAAAAAAf///3/+AAAf//////AAAAAAAAAAAAH+AAAD////AAAF/uAAAAAAAAAAAAAAfI8AA7/8AAAH/////+AAAAAAAAAAAAfAAAAP///+AAAAYAAAAAAAAAAAAAAAf/A4++f/gAAD/////8AAAAAAAAAAAB8ADCP/////+H4APAAAAAAAAAAAAAAA///5/8//4AAD/////wAAAAAAAAAAADwAHt////////8Af+AAAAAwAABAAAAAPf/8P4///gAD/////wAAAAAAAAAAAHwAf/////////8///wAAABAAAf/wAACAP//h8f//8AB/////4AAAAAAH/gAAA9A/v/////////////8AAAAAD////P//n//n/D//+AB/////gAAAAAB///AAwB+f//////////////////4Af//////////H/z4f/AAf///8AAAAAAf///4MP/////////////////////+AD/////////////4Z/4A///4AAAAAAAP///+M////v//////////////////8P/////////////wD/+A///wAQYAAAAf////////////////////////////4//////////////g/+4Af/+AA/+AAAA/+/+D///////////////////////BwP/////////////4//gAP/wAAf8AAAD/8//f//////////////////////+AOB////////////HMg/wAP/gAAHgAAAP///////////////////////////+AAP///////////8Ay+fwAH/AAAAABAB//H//////////////////////////AAP///////////4AA/gAAB/AAAAABAB//H//////////////////////3//AAAf///////////wAA/4QAA+AAAAAACB//n//////////////////////C/8AAAA/7AH///////gAA/44AAAAAAAAAAB//h/////////////////////+D4AAAAAv8AA///////4AB//8AAAAAAAABYA9+D///////////////////8AAPgAAAAAD8AAP//////8AAf/+AAAAAAAAD8AH+m///////////////////wAAfgAAAAAOQAAH///////wCf/+AAAAAAAAB8AO+H///////////////////AAA/wAAAAB4AAAD////////g///gAAAAAAAD+AP4H///////////////////AAB/AAAAAHAAAABf///////z///4AAAAAAAP/APz////////////////////SAB/AAAABwAAAAB////////x///8AAAAAAAPPB//////////////////////+AA8AAABAAAAAAAn///////5///+AAAAAAAPfz///////////////////////AA4ABAMAAAAAAAD///////////+AAAAAAAMf3///////////////////////AAwAABAAAAAAAAD///////////sAAAAAAAAef//////////////////////7ABgAAAAAAAAAAAB/////////+sPAAAAAAAAD///////////////////////7gAAAAAAAAAAAAAAf/////////wfgAAAAAAAf///////////////////////yAAAAAAAAAAAAAAAf/////////wfwAAAAAAAP///////////////////////iAAAAAAAAAAAAAAAP/////////9AgAAAAAAAD//////v/h//////////////jAAAAAAAAAAAAAAAP//////////AAAAAAAAAB/////H//D//////////////ECAAAAAAAAAAAAAAP/////////4AAAAAAAAAB//v/+Gf+H/////////////+HcAAAAAAAAAAAAAAf////////wgAAAAAAAAH//zz/+AH+H/////////////4HwAAAAAAAAAAAAAAf////////wAAAAAAAAAH/4P4/8AB/B////////////+APAAAAAAAAAAAAAAAP////////wAAAAAAAAAH/4M+f+fh/g////////////8AMAAAAAAAAAAAAAAAf///////+AAAAAAAAAAH/gMPf////x////////////8AMAAAAAAAAAAAAAAAP///////8AAAAAAAAAAP/MMCPP///g///////////fwAMAAAAAAAAAAAAAAAP///////4AAAAAAAQAAH/AAGPv///g//////////8B4AcAAAAAAAAAAAAAAAH///////4AAAAAAACAAH+AEcH////g///////////44A4AAAAAAAAAAAAAAAD///////wAAAAAAAAAAB8/+ICXv//////////////w8D4AAAAAAAAAAAAAAAB///////4AAAAAAAAAAAr/+ABwE//////////////A8/4AAAAAAAAAAAAAAAB///////wAAAAAAAAAAB//+AAAM//////////////Ax/gAAAAAAAAAAAAAAAAf/////+AAAAAAAAAAAH///AAAB//////////////gn8AAAAAAAAAAAAAAAAAH/////8AAAAAAAAAAAH///4PAB//////////////gHAAAAAAAAAAAAAAAAAAH/////4AAAAAAAAAAAP///8P47//////////////wDAAAAAAAAAAAAAAAAAADf////4AAAAAAAAAAAP/////////////////////wAAAAAAAAAAAAAAAAAAAD///3g4AAAAAAAAAAAP/////////v///////////wAAAAAAAAAAAAAAAAAAABv//AAcAAAAAAAAAAw//////////n///////////wEAAAAAAAAAAAAAAAAAAB3/+AAcAAAAAAAAAAD///////9//z///////////gAAAAAAAAAAAAAAAAAAAA7/+AAMgAAAAAAAAAD///////8//w///////////AAAAAAAAAAAAAAAAAAAAAJ/+AAMQAAAAAAAAAH///////+f/8b//////////AAAAAAAAAAAAAAAAAAAAAM/+AABgAAAAAAAAAH////////f/94Af///////+wAAAAAAAAAAAAAAAAAAAAGf+AAAIAAAAAAAAAP////////P//+AP///////4wAAAAAAAAAAAAAAAAAAAAAP8AB/EAAAAAAAAAf////////n///AH///////wgAAAAAAAAAAAAAAAAAAAAAP+A4DwAAAAAAAAAf////////n///AH///P//+AAAAAAAAAAAAAABAAAAAAAAP+B4A8AAAAAAAAAf////////n//+AAf/4P/+IAAAAAAAAAAAAAAAgAAAAAAAH/B4AB4AAAAAAAAf////////x//8AA//wH/8YAAAAAAAAAAAAAAAAAAAAAAAD//4Aj9gAAAAAAAP////////x//4AAf/gD/8YAwAAAAAAAAAAAAAAAAAAAAAA//wAAAAAAAAAAAP////////4//wAAf+AD/+AA4AAAAAAAAAAAAAAAAAAAAAAP/wAAACAAAAAAAf////////4//AAAf8AD//AAwAAAAAAAAAAAAAAAAAAAAAABP/gAACAAAAAAgf////////8/8AAAf4AAf/gAwAAAAAAAAAAAAAAAAAAAAAAAD/gAAAAAAAAAA/////////+fwAAAPwAAP/gA4AAAAAAAAAAAAAAAAAAAAAAAA/gAAAAAAAAAAf//////////AAAAP4AAP/wA8AAAAAAAAAAAAAAAAAAAAAAAAHgAgAAAAAAAAf/////////4BAAAHwAIN/wAfAAAAAAAAAAAAAAAAAAAAAAAADgD4AAAAAAAAP/////////w4AAAHwAAMfgBPAAAAAAAAAAAAAAAAAAAAAAAADgP/+AAAAAAAH//////////4AAADwAAMfABPAAAAAAAAAAAAAAAAAAAAAAAABzP/+AAAAAAAD//////////4AAAD4AAMGACPAAAAAAAAAAAAAAAAAAAAAAAAA////gAAAAAAD//////////4AAABcAAMAAEHgAAAAAAAAAAAAAAAAAAAAAAAAM///wAAAAAAB//////////wAAAAMAAGAAAPgAAAAAAAAAAAAAAAAAAAAAAAAA///4AAAAAAAf/////////gAAAAMAADAAMDAAAAAAAAAAAAAAAAAAAAAAAAAA////gAAAAAAP/B///////gAAAAAABjgAeAAAAAAAAAAAAAAAAAAAAAAAAAAA////4AAAAAACAB///////AAAAAAABzwA+AAAAAAAAAAAAAAAAAAAAAAAAAAA////4AAAAAAAAAP/////+AAAAAAAAdwB8AAAAAAAAAAAAAAAAAAAAAAAAAAB////8AAAAAAAAAD/////8AAAAAAAAfwH8AIAAAAAAAAAAAAAAAAAAAAAAAAB////8AAAAAAAAAH/////4AAAAAAAAf4f+SYAAAAAAAAAAAAAAAAAAAAAAAAD////8AAAAAAAAAH/////wAAAAAAAAHwf8+YAAAAAAAAAAAAAAAAAAAAAADAH/////gAAAAAAAAH/////gAAAAAAAAL4f9QT0AAAAAAAAAAAAAAAAAAAAAAAH/////4AAAAAAAAH/////AAAAAAAAAD8f5+T7AAAAAAAAAAAAAAAAAAAAAAAH//////AAAAAAAAH////+AAAAAAAAAB+P5wA74AgAAAAAAAAAAAAAAAAAAAAH//////8AAAAAAAD////8AAAAAAAAAA8C54+f/AAAAAAAAAAAAAAAAAAAAAAP//////+AAAAAAAB////8AAAAAAAAAAcAB4AH/wYAAAAAAAAAAAAAAAAAAAAH///////gAAAAAAA////8AAAAAAAAAAMABoAI//yAAAAAAAAAAAAAAAAAAAAH///////gAAAAAAA////8AAAAAAAAAAHsAAAI/9hAAAAAAAAAAAAAAAAAAAAD///////gAAAAAAAf///8AAAAAAAAAAD/AAhA/8AQAAAAAAAAAAAAAAAAAAAB///////gAAAAAAAf///8AAAAAAAAAAAH//gAvOAWAAAAAAAAAAAAAAAAAAAB///////gAAAAAAAf///8AAAAAAAAAAAABjAAAHgHAAAAAAAAAAAAAAAAAAAA///////AAAAAAAAf///+AAAAAAAAAAAAAEAACBgBAAAAAAAAAAAAAAAAAAAA//////+AAAAAAAAP///+AAAAAAAAAAAAAADyCAEAAAAAAAAAAAAAAAAAAAAAf/////8AAAAAAAAf///+AQAAAAAAAAAAAAD+HAAAAAAAQAAAAAAAAAAAAAAAf/////4AAAAAAAA////+AwAAAAAAAAAAAAD+HAAAAAAAAAAAAAAAAAAAAAAAP/////4AAAAAAAA////+BwAAAAAAAAAAAB38HgAAAAAAAAAAAAAAAAAAAAAAH/////4AAAAAAAA////+D4AAAAAAAAAAAD/+HwAADAAAAAAAAAAAAAAAAAAAD/////4AAAAAAAA////8PwAAAAAAAAAAAH//XwAABgDAAAAAgAAAAAAAAAAAA/////4AAAAAAAB////wPwAAAAAAAAAAAP///wAAAAGAAAAAAAAAAAAAAAAAAf////4AAAAAAAA////gPwAAAAAAAAAAAP///4AAAAAAAAAAAAAAAAAAAAAAAf////wAAAAAAAA////APgAAAAAAAAAAAf///8AAAAAAAAAAAAAAAAAAAAAAAP////wAAAAAAAAf//+APgEAAAAAAAAAH////+AAIAAAAAAAAAAAAAAAAAAAAP////gAAAAAAAAP///AfgQAAAAAAAAAf/////AAGAAAAAAAAAAAAAAAAAAAAf////gAAAAAAAAP///AfAAAAAAAAAAA//////gACAAAAAAAAAAAAAAAAAAAAf///8AAAAAAAAAP///AfAAAAAAAAAAB//////gAAAAAAAAAAAAAAAAAAAAAAf///gAAAAAAAAAP//+AfAAAAAAAAAAB//////4AAAAAAAAAAAAAAAAAAAAAAf///AAAAAAAAAAH//8AMAAAAAAAAAAB//////4AAAAAAAAAAAAAAAAAAAAAAf///AAAAAAAAAAH//4AAAAAAAAAAAAB//////4AAAAAAAAAAAAAAAAAAAAAAf///AAAAAAAAAAH//4AAAAAAAAAAAAA//////8AAAAAAAAAAAAAAAAAAAAAA///+AAAAAAAAAAD//4AAAAAAAAAAAAA//////8AAAAAAAAAAAAAAAAAAAAAA///+AAAAAAAAAAB//wAAAAAAAAAAAAAf/////8AAAAAAAAAAAAAAAAAAAAAA///8AAAAAAAAAAB//gAAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAAAAAAAAA///4AAAAAAAAAAA//AAAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAAAAAAAAA///wAAAAAAAAAAA/+AAAAAAAAAAAAAAf/wP//4AAAAAAAAAAAAAAAAAAAAAA///gAAAAAAAAAAA/8AAAAAAAAAAAAAAf8AP//wAAAAAAAAAAAAAAAAAAAAAA///AAAAAAAAAAAAcAAAAAAAAAAAAAAAeAAF//gAAAAAAAAAAAAAAAAAAAAAB//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//gAABgAAAAAAAAAAAAAAAAAB//8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/AAAAwAAAAAAAAAAAAAAAAAD//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/AAAA+AAAAAAAAAAAAAAAAAD//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4AAAA+AAAAAAAAAAAAAAAAAD/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AAAAAAAAAAAAAAAAAD/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiAAACYAAAAAAAAAAAAAAAAAD/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAAADwAAAAAAAAAAAAAAAAAD/4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAAHAEAAAAAAAAAAAAAAAAH/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAeAAAAAAAAAAAAAAAAAAH/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8AAAAAAAAAAAAAAAAAAH+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAP+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAH/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH8AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/wAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAAAAAAAAAAAAAAAAAAAAAAAAAADQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+AAAAAAAAAAAAAAAAAAv4AAAAY///PwHn/wAAAAAAAAAAAAAAAAAAAAAAAAHgAAAAAAAAAAAAAAAAAH///AAD//////////wAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAAAAAAAAAED////8A////////////+AAAAAAAAAAAAAAAAAAAAAJ/8AAAAAAAAAAAACAAP3////8D/////////////8AAAAAAAAAAAAAAAAAAAAM/+AAAAAAAABMH//3r//////5///////////////+AAAAAAAAAAAAAAAAAAAP/+AAAAAAAA/////////////5////////////////4AAAAAAAAAAAAAB/iQAF7/AAAAAAAB//////////////////////////////wAAAAAAAAABmAAB///v///AAAAAAAf//////////////////////////////QAAAAAAAAJz//sA//////+AAAAAAA//////////////////////////////4AAAAAAAC/////////////4AAAAAAf//////////////////////////////gAAAAAAB/////////////4AAAAAA////////////////////////////////gAAAAAH/////////////+AAAAAAf////////////////////////////////zgAAADB/////////////gOAAD8A/////////////////////////////////+AAAAD4T////////////w/AAH+B3///////////////////////////////+AAAAAAAB////////////4x/g/wA////////////////////////////////+AAAAAAB///////////////wAAA//////////////////////////////////AAAAAAAP//////////////+H////////////////////////////////////+AAAH////////////////////////////////////////////////////////+AAP//////////////////////////////////////////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  const HUBS = [
    { id: 'sydney',       name: 'Sydney',       lat: -33.87, lon: 151.21, tz: 'Australia/Sydney' },
    { id: 'tokyo',        name: 'Tokyo',        lat:  35.68, lon: 139.69, tz: 'Asia/Tokyo' },
    { id: 'hongkong',     name: 'Hong Kong',    lat:  22.32, lon: 114.17, tz: 'Asia/Hong_Kong' },
    { id: 'singapore',    name: 'Singapore',    lat:   1.35, lon: 103.82, tz: 'Asia/Singapore' },
    { id: 'dubai',        name: 'Dubai',        lat:  25.20, lon:  55.27, tz: 'Asia/Dubai' },
    { id: 'nairobi',      name: 'Nairobi',      lat:  -1.29, lon:  36.82, tz: 'Africa/Nairobi' },
    { id: 'johannesburg', name: 'Johannesburg', lat: -26.20, lon:  28.05, tz: 'Africa/Johannesburg' },
    { id: 'lagos',        name: 'Lagos',        lat:   6.52, lon:   3.38, tz: 'Africa/Lagos' },
    { id: 'frankfurt',    name: 'Frankfurt',    lat:  50.11, lon:   8.68, tz: 'Europe/Berlin', label: false },
    { id: 'london',       name: 'London',       lat:  51.51, lon:  -0.13, tz: 'Europe/London' },
    { id: 'newyork',      name: 'New York',     lat:  40.71, lon: -74.01, tz: 'America/New_York' },
    { id: 'saopaulo',     name: 'São Paulo',    lat: -23.55, lon: -46.63, tz: 'America/Sao_Paulo' },
  ];
  const ROUTES = [
    ['london', 'newyork'], ['london', 'frankfurt'], ['london', 'johannesburg'], ['london', 'lagos'],
    ['london', 'dubai'], ['frankfurt', 'hongkong'], ['dubai', 'singapore'], ['singapore', 'hongkong'],
    ['hongkong', 'tokyo'], ['tokyo', 'sydney'], ['singapore', 'sydney'], ['newyork', 'saopaulo'],
    ['johannesburg', 'nairobi'], ['nairobi', 'dubai'], ['newyork', 'tokyo'], ['lagos', 'saopaulo'],
  ];
  /* Conventional forex session hours, in each centre's own local time. */
  const SESSIONS = [
    { id: 'sydney',  name: 'Sydney',   tz: 'Australia/Sydney', open: 7, close: 16 },
    { id: 'tokyo',   name: 'Tokyo',    tz: 'Asia/Tokyo',       open: 9, close: 18 },
    { id: 'london',  name: 'London',   tz: 'Europe/London',    open: 8, close: 17 },
    { id: 'newyork', name: 'New York', tz: 'America/New_York', open: 8, close: 17 },
  ];
  const hubById = Object.fromEntries(HUBS.map(h => [h.id, h]));

  /* ── Time-zone helpers (Intl only, DST-correct) ── */
  const partsCache = {};
  function zoned(tz, date) {
    const f = partsCache[tz] || (partsCache[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }));
    const o = {};
    f.formatToParts(date).forEach(p => { o[p.type] = p.value; });
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: o.weekday };
  }
  /* UTC instant of a wall-clock time in `tz` on the zoned date `z`, plus `dayShift` days. */
  function instantAt(tz, z, hour, dayShift) {
    const guess = Date.UTC(z.y, z.mo - 1, z.d + (dayShift || 0), hour, 0, 0);
    const back = zoned(tz, new Date(guess));
    const asUTC = Date.UTC(back.y, back.mo - 1, back.d, back.h, back.mi, back.s);
    return new Date(guess - (asUTC - guess));
  }
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const fmtLocal = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtSpan = ms => {
    const m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60), mm = m % 60;
    if (h >= 24) { const dd = Math.floor(h / 24); return `${dd}d ${h % 24}h`; }
    return h ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm}m`;
  };

  function sessionState(s, now) {
    const z = zoned(s.tz, now);
    const weekday = WEEKDAYS.includes(z.wd);
    const openAt = instantAt(s.tz, z, s.open), closeAt = instantAt(s.tz, z, s.close);
    const isOpen = weekday && now >= openAt && now < closeAt;
    let next = null;
    if (!isOpen) {
      for (let k = now < openAt ? 0 : 1; k < 8; k++) {
        const cand = instantAt(s.tz, z, s.open, k);
        if (WEEKDAYS.includes(zoned(s.tz, cand).wd) && cand > now) { next = cand; break; }
      }
    }
    return { isOpen, openAt, closeAt, next, progress: isOpen ? (now - openAt) / (closeAt - openAt) : 0, local: z };
  }
  /* The forex week runs Sunday 17:00 to Friday 17:00, New York time. */
  function forexOpen(now) {
    const z = zoned('America/New_York', now);
    if (z.wd === 'Sat') return false;
    if (z.wd === 'Sun') return z.h >= 17;
    if (z.wd === 'Fri') return z.h < 17;
    return true;
  }

  /* ── Sessions panel ── */
  function initSessions(panel, onPick) {
    panel.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'ses-head';
    panel.appendChild(head);
    const rows = SESSIONS.map(s => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ses-row';
      b.dataset.hub = s.id;
      b.innerHTML = `<span class="ses-dot"></span><span class="ses-name">${s.name}</span>` +
        `<span class="ses-hours"></span><span class="ses-status"></span><span class="ses-bar"><i></i></span>`;
      b.addEventListener('click', () => onPick && onPick(s.id));
      panel.appendChild(b);
      return { s, el: b };
    });
    const note = document.createElement('p');
    note.className = 'ses-note';
    note.textContent = 'Hours shown in your local time. Sessions follow each centre’s business hours; spreads are usually tightest when two sessions overlap.';
    panel.appendChild(note);

    function update() {
      const now = new Date();
      const fx = forexOpen(now);
      let open = 0;
      rows.forEach(({ s, el }) => {
        const st = sessionState(s, now);
        if (st.isOpen) open++;
        el.classList.toggle('is-open', st.isOpen);
        el.querySelector('.ses-hours').textContent = `${fmtLocal(st.openAt)} – ${fmtLocal(st.closeAt)}`;
        el.querySelector('.ses-status').textContent = st.isOpen
          ? `Open · closes in ${fmtSpan(st.closeAt - now)}`
          : st.next ? `Closed · opens in ${fmtSpan(st.next - now)}` : 'Closed';
        el.querySelector('.ses-bar i').style.transform = `scaleX(${st.progress.toFixed(3)})`;
      });
      head.innerHTML = `<span class="ses-live ${fx ? 'on' : ''}"></span>` +
        `<b>Forex market ${fx ? 'open' : 'closed'}</b>` +
        `<span>${fx ? (open > 1 ? `${open} sessions overlapping now` : open === 1 ? '1 session active now' : 'Between sessions') : 'Reopens Sunday 17:00 New York time'}</span>`;
    }
    update();
    setInterval(update, 15000);
  }

  /* ── Geometry ── */
  function landMask() {
    const bin = atob(LAND), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return (lat, lon) => {
      const y = clamp(Math.floor(90 - lat), 0, 179), x = clamp(Math.floor(lon + 180), 0, 359);
      const idx = y * 360 + x;
      return (bytes[idx >> 3] >> (7 - (idx & 7))) & 1;
    };
  }
  const toVec = (lat, lon, r) => {
    const la = lat * RAD, lo = lon * RAD, c = Math.cos(la);
    return [c * Math.sin(lo) * r, Math.sin(la) * r, c * Math.cos(lo) * r];
  };
  function landDots(n) {
    const isLand = landMask(), out = [], ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), t = i * ga;
      const x = Math.cos(t) * r, z = Math.sin(t) * r;
      const lat = Math.asin(y) / RAD, lon = Math.atan2(x, z) / RAD;
      if (isLand(lat, lon)) out.push(x, y, z);
    }
    return new Float32Array(out);
  }
  function slerpArc(a, b, steps) {
    const va = toVec(a.lat, a.lon, 1), vb = toVec(b.lat, b.lon, 1);
    const dot = clamp(va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2], -1, 1);
    const ang = Math.acos(dot), s = Math.sin(ang);
    const lift = 0.06 + 0.32 * (ang / Math.PI);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const k1 = Math.sin((1 - t) * ang) / s, k2 = Math.sin(t * ang) / s;
      const h = 1 + lift * Math.sin(Math.PI * t);
      pts.push((va[0] * k1 + vb[0] * k2) * h, (va[1] * k1 + vb[1] * k2) * h, (va[2] * k1 + vb[2] * k2) * h, t);
    }
    return pts;
  }
  function sunVector(now) {
    const start = Date.UTC(now.getUTCFullYear(), 0, 0);
    const day = (now - start) / 86400000;
    const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (day + 10));
    const hours = now.getUTCHours() + now.getUTCMinutes() / 60;
    return toVec(decl, (12 - hours) * 15, 1);
  }
  function rotation(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // R = Rx(pitch) * Ry(yaw), row-major
    return [
      cy, 0, sy,
      sp * sy, cp, -sp * cy,
      -cp * sy, sp, cp * cy,
    ];
  }
  const colMajor = m => new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);

  /* ── Shaders ── */
  const CAM = 3.2, RADIUS_FRAC = 0.84;
  const SCALE = RADIUS_FRAC * Math.sqrt(CAM * CAM - 1);
  const PROJECT = `
    uniform mat3 uRot; uniform float uScale, uAspect;
    vec4 project(vec3 w, out float persp){
      vec3 p = uRot * w;
      persp = 1. / (${CAM.toFixed(2)} - p.z);
      vec2 sp = p.xy * persp * uScale;
      sp.x /= uAspect;
      return vec4(sp, 0., 1.);
    }`;
  const DOT_VS = PROJECT + `
    attribute vec3 aPos;
    uniform float uSize, uSide;
    uniform vec3 uSun;
    varying float vAlpha; varying float vDay;
    void main(){
      float persp;
      gl_Position = project(aPos, persp);
      float z = (uRot * aPos).z;
      float front = step(0., z);
      if ((uSide > 0. && front < .5) || (uSide < 0. && front > .5)) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; return; }
      vDay = dot(normalize(aPos), uSun);
      vAlpha = uSide > 0. ? mix(.35, 1., smoothstep(0., .45, z)) : .12;
      gl_PointSize = uSize * persp * ${CAM.toFixed(2)} * (uSide > 0. ? 1. : .8);
    }`;
  const DOT_FS = `precision mediump float;
    varying float vAlpha; varying float vDay;
    void main(){
      vec2 c = gl_PointCoord - .5;
      float d = length(c);
      if (d > .5) discard;
      float a = smoothstep(.5, .32, d) * vAlpha;
      vec3 night = vec3(.42, .52, .78), day = vec3(.95, .97, 1.), dusk = vec3(1., .52, .22);
      vec3 col = mix(night, day, smoothstep(-.08, .25, vDay));
      col = mix(col, dusk, smoothstep(.2, 0., abs(vDay)) * .8);
      float lit = mix(.8, 1., smoothstep(-.1, .2, vDay));
      gl_FragColor = vec4(col * a * lit, a * lit);
    }`;
  const ARC_VS = PROJECT + `
    attribute vec4 aPos; attribute float aArc;
    uniform float uTime, uSize;
    varying float vA; varying float vHead;
    void main(){
      float persp;
      gl_Position = project(aPos.xyz, persp);
      vec3 p = uRot * aPos.xyz;
      float hidden = step(p.z, 0.) * step(length(p.xy), 1.);
      float t = aPos.w;
      float head = fract(uTime * (.11 + mod(aArc, 3.) * .025) + aArc * .37) * 1.4 - .2;
      float g = head - t;
      float trail = g >= 0. ? smoothstep(.28, 0., g) : 0.;
      vHead = g >= 0. ? smoothstep(.035, 0., g) : 0.;
      float ends = smoothstep(0., .03, t) * smoothstep(1., .97, t);
      vA = (.2 + trail * .85 + vHead * .6) * ends * (1. - hidden) * mix(.45, 1., smoothstep(-.2, .4, p.z));
      gl_PointSize = uSize * persp * ${CAM.toFixed(2)} * (.75 + trail * .9 + vHead * 1.4);
    }`;
  const ARC_FS = `precision mediump float;
    varying float vA; varying float vHead;
    void main(){
      float d = length(gl_PointCoord - .5);
      if (d > .5) discard;
      float a = smoothstep(.5, .1, d) * vA;
      vec3 col = mix(vec3(.94, .35, .1), vec3(1., .88, .7), vHead);
      gl_FragColor = vec4(col * a, a);
    }`;
  const HUB_VS = PROJECT + `
    attribute vec3 aPos; attribute float aOpen; attribute float aPhase;
    uniform float uSize;
    varying float vOpen; varying float vPhase; varying float vVis;
    void main(){
      float persp;
      gl_Position = project(aPos, persp);
      vec3 p = uRot * aPos;
      vVis = smoothstep(-.05, .2, p.z);
      vOpen = aOpen; vPhase = aPhase;
      gl_PointSize = uSize * persp * ${CAM.toFixed(2)};
    }`;
  const HUB_FS = `precision mediump float;
    uniform float uTime;
    varying float vOpen; varying float vPhase; varying float vVis;
    void main(){
      vec2 c = gl_PointCoord - .5;
      float d = length(c) * 2.;
      if (d > 1. || vVis <= 0.) discard;
      vec3 col = mix(vec3(.75, .8, .9), vec3(.13, .87, .45), vOpen);
      float core = smoothstep(.22, .12, d);
      float r = fract(uTime * .55 + vPhase);
      float ring = smoothstep(.07, 0., abs(d - r * .95)) * (1. - r) * (.35 + vOpen * .65);
      float a = (core + ring) * vVis;
      vec3 c2 = mix(col, vec3(1.), core * .5);
      gl_FragColor = vec4(c2 * a, a);
    }`;
  const BODY_VS = 'attribute vec2 aPos;varying vec2 vP;void main(){vP=aPos;gl_Position=vec4(aPos,0.,1.);}';
  const BODY_FS = `precision mediump float;
    varying vec2 vP; uniform float uAspect, uR; uniform vec3 uLight;
    void main(){
      vec2 p = vec2(vP.x * uAspect, vP.y) / uR;
      float d = length(p);
      if (d > 1.22) discard;
      vec4 col;
      if (d <= 1.) {
        float rim = pow(d, 6.);
        float lit = clamp(dot(normalize(vec3(p, sqrt(max(0., 1. - d * d)))), normalize(uLight)), 0., 1.);
        vec3 c = mix(vec3(.025, .035, .065), vec3(.075, .095, .15), lit) + mix(vec3(.3, .45, .9), vec3(.95, .45, .15), lit) * rim * .22;
        col = vec4(c * .8, .8);
      } else {
        float g = smoothstep(1.22, 1., d);
        g = g * g * g * .42;
        vec3 halo = mix(vec3(.35, .5, 1.), vec3(.95, .45, .16), .55);
        col = vec4(halo * g, g);
      }
      gl_FragColor = col;
    }`;

  /* ── Globe ── */
  function initGlobe(host, panel) {
    const VG = window.VelociGL;
    const canvas = document.createElement('canvas');
    canvas.className = 'globe-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Interactive globe of global financial centres with live daylight and trading routes');
    const gl = VG && VG.getGL(canvas, { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) return null;
    const P = {
      dot: VG.program(gl, DOT_VS, DOT_FS), arc: VG.program(gl, ARC_VS, ARC_FS),
      hub: VG.program(gl, HUB_VS, HUB_FS), body: VG.program(gl, BODY_VS, BODY_FS),
    };
    if (!P.dot || !P.arc || !P.hub || !P.body) return null;
    host.appendChild(canvas);
    host.classList.add('globe-on');
    const labels = document.createElement('div');
    labels.className = 'globe-labels';
    host.appendChild(labels);

    const buf = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
    const attr = (prog, name, b, size, stride, offset) => {
      const loc = gl.getAttribLocation(prog.p, name);
      if (loc < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride || 0, offset || 0);
    };

    const dots = landDots(fine ? 26000 : 15000);
    const dotBuf = buf(dots);
    const arcData = [];
    ROUTES.forEach(([a, b], i) => {
      slerpArc(hubById[a], hubById[b], 90).forEach((v, k) => { arcData.push(v); if (k % 4 === 3) arcData.push(i); });
    });
    const arcBuf = buf(new Float32Array(arcData));
    const arcCount = arcData.length / 5;
    const hubData = new Float32Array(HUBS.length * 5);
    const hubBuf = gl.createBuffer();
    const quadBuf = buf(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));

    const hubEls = HUBS.map(h => {
      if (h.label === false) return null;
      const el = document.createElement('div');
      el.className = 'globe-label';
      el.innerHTML = `<b>${h.name}</b><span></span>`;
      labels.appendChild(el);
      return el;
    });

    // Open facing the visitor's own part of the world, estimated from their UTC offset.
    const homeLon = clamp(-new Date().getTimezoneOffset() / 4, -180, 180);
    const view = { yaw: -(homeLon + 12) * RAD, pitch: 0.42, vYaw: 0, vPitch: 0, auto: 1, idleAt: 0, tween: null };
    function pick(id) {
      const h = hubById[id];
      if (!h) return;
      let target = -h.lon * RAD;
      while (target - view.yaw > Math.PI) target -= 2 * Math.PI;
      while (target - view.yaw < -Math.PI) target += 2 * Math.PI;
      view.tween = { y0: view.yaw, p0: view.pitch, y1: target, p1: clamp(h.lat * RAD * 0.75, -0.5, 0.85), t0: performance.now(), dur: 1400 };
      view.idleAt = performance.now() + 5000;
      view.vYaw = view.vPitch = 0;
      hubEls.forEach((el, i) => el && el.classList.toggle('is-picked', HUBS[i].id === id));
      loop.kick();
    }

    // Drag to rotate, with inertia
    let drag = null;
    canvas.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
      canvas.setPointerCapture(e.pointerId);
      view.tween = null; view.vYaw = view.vPitch = 0;
      host.classList.add('is-dragging');
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const now = performance.now(), dt = Math.max(1, now - drag.t);
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      const k = 3.2 / canvas.clientWidth;
      view.yaw += dx * k; view.pitch = clamp(view.pitch + dy * k, -0.9, 1.1);
      view.vYaw = dx * k / dt * 16; view.vPitch = dy * k / dt * 16;
      drag = { x: e.clientX, y: e.clientY, t: now };
      view.idleAt = now + 2500;
    });
    const end = () => { drag = null; host.classList.remove('is-dragging'); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    let size = { w: 1, h: 1 }, cssW = 1, cssH = 1;
    const resize = () => {
      size = VG.fitCanvas(gl, canvas, host, 2);
      cssW = host.clientWidth; cssH = host.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const t0 = performance.now();
    let last = t0, sun = sunVector(new Date()), sunAt = t0, hubAt = -Infinity;
    const maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    const use = prog => {
      for (let i = 0; i < Math.min(8, maxAttribs); i++) gl.disableVertexAttribArray(i);
      gl.useProgram(prog.p);
    };

    function common(prog, rot, aspect) {
      use(prog);
      if (prog.u.uRot) gl.uniformMatrix3fv(prog.u.uRot, false, rot);
      if (prog.u.uScale) gl.uniform1f(prog.u.uScale, SCALE);
      if (prog.u.uAspect) gl.uniform1f(prog.u.uAspect, aspect);
    }

    const loop = VG.visibleLoop(host, now => {
      const dt = Math.min(64, now - last); last = now;
      if (now - sunAt > 60000) { sun = sunVector(new Date()); sunAt = now; }
      if (now - hubAt > 15000) {
        const d = new Date();
        HUBS.forEach((h, i) => {
          const z = zoned(h.tz, d);
          const open = WEEKDAYS.includes(z.wd) && z.h >= 9 && z.h < 17;
          const v = toVec(h.lat, h.lon, 1.005);
          hubData.set([v[0], v[1], v[2], open ? 1 : 0, i * 0.17], i * 5);
          if (hubEls[i]) {
            hubEls[i].classList.toggle('is-open', open);
            hubEls[i].querySelector('span').textContent = `${String(z.h).padStart(2, '0')}:${String(z.mi).padStart(2, '0')}`;
          }
        });
        gl.bindBuffer(gl.ARRAY_BUFFER, hubBuf);
        gl.bufferData(gl.ARRAY_BUFFER, hubData, gl.DYNAMIC_DRAW);
        hubAt = now;
      }

      if (view.tween) {
        const tw = view.tween, k = clamp((now - tw.t0) / tw.dur, 0, 1), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        view.yaw = tw.y0 + (tw.y1 - tw.y0) * e; view.pitch = tw.p0 + (tw.p1 - tw.p0) * e;
        if (k >= 1) view.tween = null;
      } else if (!drag) {
        view.yaw += view.vYaw; view.pitch = clamp(view.pitch + view.vPitch, -0.9, 1.1);
        view.vYaw *= 0.94; view.vPitch *= 0.9;
        const idle = now > view.idleAt;
        view.auto += ((idle && !reduce ? 1 : 0) - view.auto) * 0.02;
        view.yaw += 0.00011 * dt * view.auto;
        if (idle) view.pitch += (0.42 - view.pitch) * 0.01;
      }

      const rotRow = rotation(view.yaw, view.pitch), rot = colMajor(rotRow);
      const aspect = size.w / size.h;
      const time = (now - t0) / 1000;
      const dpr = size.w / Math.max(1, cssW);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // back dots
      common(P.dot, rot, aspect);
      attr(P.dot, 'aPos', dotBuf, 3);
      gl.uniform3f(P.dot.u.uSun, sun[0], sun[1], sun[2]);
      gl.uniform1f(P.dot.u.uSize, 2.3 * dpr);
      gl.uniform1f(P.dot.u.uSide, -1);
      gl.drawArrays(gl.POINTS, 0, dots.length / 3);

      // sphere body + atmosphere
      use(P.body);
      attr(P.body, 'aPos', quadBuf, 2);
      gl.uniform1f(P.body.u.uAspect, aspect);
      gl.uniform1f(P.body.u.uR, RADIUS_FRAC);
      const sx = rotRow[0] * sun[0] + rotRow[1] * sun[1] + rotRow[2] * sun[2];
      const sy = rotRow[3] * sun[0] + rotRow[4] * sun[1] + rotRow[5] * sun[2];
      const sz = rotRow[6] * sun[0] + rotRow[7] * sun[1] + rotRow[8] * sun[2];
      gl.uniform3f(P.body.u.uLight, sx, sy, sz);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // front dots
      common(P.dot, rot, aspect);
      attr(P.dot, 'aPos', dotBuf, 3);
      gl.uniform1f(P.dot.u.uSide, 1);
      gl.drawArrays(gl.POINTS, 0, dots.length / 3);

      // arcs (additive)
      gl.blendFunc(gl.ONE, gl.ONE);
      common(P.arc, rot, aspect);
      attr(P.arc, 'aPos', arcBuf, 4, 20, 0);
      attr(P.arc, 'aArc', arcBuf, 1, 20, 16);
      gl.uniform1f(P.arc.u.uTime, reduce ? 0 : time);
      gl.uniform1f(P.arc.u.uSize, 2.2 * dpr);
      gl.drawArrays(gl.POINTS, 0, arcCount);

      // hubs
      common(P.hub, rot, aspect);
      attr(P.hub, 'aPos', hubBuf, 3, 20, 0);
      attr(P.hub, 'aOpen', hubBuf, 1, 20, 12);
      attr(P.hub, 'aPhase', hubBuf, 1, 20, 16);
      gl.uniform1f(P.hub.u.uTime, reduce ? 0 : time);
      gl.uniform1f(P.hub.u.uSize, 26 * dpr);
      gl.drawArrays(gl.POINTS, 0, HUBS.length);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      // HTML labels follow their hubs
      HUBS.forEach((h, i) => {
        const el = hubEls[i];
        if (!el) return;
        const v = toVec(h.lat, h.lon, 1.02);
        const x = rotRow[0] * v[0] + rotRow[1] * v[1] + rotRow[2] * v[2];
        const y = rotRow[3] * v[0] + rotRow[4] * v[1] + rotRow[5] * v[2];
        const z = rotRow[6] * v[0] + rotRow[7] * v[1] + rotRow[8] * v[2];
        const persp = 1 / (CAM - z);
        const px = (x * persp * SCALE / aspect * 0.5 + 0.5) * cssW;
        const py = (0.5 - y * persp * SCALE * 0.5) * cssH;
        const vis = clamp((z - 0.12) / 0.25, 0, 1);
        el.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)`;
        el.classList.toggle('flip', px > cssW * 0.64);
        el.style.opacity = vis.toFixed(2);
        el.style.visibility = vis > 0.02 ? 'visible' : 'hidden';
      });
    });

    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault(); loop.stop(); host.classList.remove('globe-on'); canvas.remove(); labels.remove();
    });
    return { pick };
  }

  function init() {
    document.querySelectorAll('[data-fx-globe]').forEach(host => {
      const panel = document.querySelector(host.dataset.fxGlobe || '[data-fx-sessions]');
      let globe = null;
      if (panel) initSessions(panel, id => globe && globe.pick(id));
      try { globe = initGlobe(host, panel); } catch (e) { console.warn('[fx] globe:', e); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
