/* Veloci Global Markets — in-house support chat widget (phase 1).
 *
 * Bottom-LEFT bubble, deliberately opposite Smartsupp on the right so the two
 * can run side by side during the transition.
 *
 * Logged-in users only: the conversation is keyed to auth.uid() and Postgres
 * RLS enforces that a user can only ever read or write their own thread.
 * Signed-out visitors get nothing rendered at all.
 */
(function () {
  const ACCENT = '#f05a1a';
  const Z      = 99990;          // below the PWA install banner (99999)

  const el = (tag, css, text) => {
    const n = document.createElement(tag);
    if (css)  n.style.cssText = css;
    if (text != null) n.textContent = text;      // textContent, never innerHTML
    return n;
  };

  const fmtTime = ts => {
    try {
      return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ''; }
  };

  (async function init() {
    const db = window.SV_DB;
    if (!db) return;

    /* ── gate: must be signed in, and the feature must be on ── */
    let session = null;
    try {
      const { data } = await db.auth.getSession();
      session = data && data.session;
    } catch (_) { return; }
    if (!session || !session.user) return;

    try {
      const { data } = await db.from('system_settings')
        .select('value').eq('key', 'support_chat_enabled').maybeSingle();
      if (data && data.value === 'false') return;
    } catch (_) { /* absent or unreadable -> stay enabled */ }

    /* ── conversation ── */
    let convId = null;
    try {
      const { data, error } = await db.rpc('chat_my_conversation');
      if (error) throw error;
      convId = data;
    } catch (_) { return; }
    if (!convId) return;

    /* ── shell ── */
    const wrap = el('div', `position:fixed;left:20px;bottom:20px;z-index:${Z};font-family:'Inter',system-ui,sans-serif;`);

    const badge = el('span', `position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 6px;
      border-radius:10px;background:#e0245e;color:#fff;font-size:11px;font-weight:700;display:none;
      align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4);`);

    const bubble = el('button', `position:relative;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;
      background:${ACCENT};box-shadow:0 6px 20px rgba(240,90,26,.45);display:flex;align-items:center;
      justify-content:center;transition:transform .15s;padding:0;`);
    bubble.setAttribute('aria-label', 'Support chat');
    bubble.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 ' +
      '8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 ' +
      '8.48 0 0 1 8 8v.5z"/></svg>';
    bubble.appendChild(badge);
    bubble.onmouseenter = () => { bubble.style.transform = 'scale(1.06)'; };
    bubble.onmouseleave = () => { bubble.style.transform = 'none'; };

    const panel = el('div', `position:absolute;left:0;bottom:70px;width:min(360px,calc(100vw - 40px));
      height:min(520px,calc(100vh - 120px));background:#12141a;border:1px solid rgba(255,255,255,.09);
      border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.55);display:none;flex-direction:column;overflow:hidden;`);

    /* header */
    const head = el('div', `padding:14px 16px;background:linear-gradient(135deg,${ACCENT},#ff8c42);
      display:flex;align-items:center;gap:10px;flex-shrink:0;`);
    const dot = el('span', 'width:8px;height:8px;border-radius:50%;background:#0ecb81;flex-shrink:0;');
    const headText = el('div', 'flex:1;min-width:0;');
    headText.appendChild(el('div', 'font-size:14px;font-weight:700;color:#fff;line-height:1.2;', 'Veloci Support'));
    headText.appendChild(el('div', 'font-size:11px;color:rgba(255,255,255,.85);', 'We typically reply in a few minutes'));
    const closeBtn = el('button', `background:none;border:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;
      padding:0 2px;opacity:.9;`, '×');
    closeBtn.setAttribute('aria-label', 'Close chat');
    head.append(dot, headText, closeBtn);

    /* messages */
    const list = el('div', `flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;
      background:#0d0f14;`);
    const empty = el('div', `margin:auto;text-align:center;color:rgba(234,236,239,.4);font-size:13px;line-height:1.6;padding:0 10px;`,
      'Send us a message and our support team will reply here.');
    list.appendChild(empty);

    /* composer */
    const foot = el('div', `padding:10px;border-top:1px solid rgba(255,255,255,.08);display:flex;gap:8px;
      align-items:flex-end;background:#12141a;flex-shrink:0;`);
    const input = el('textarea', `flex:1;min-width:0;resize:none;max-height:96px;height:40px;padding:10px 12px;
      border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0d0f14;color:#eaecef;font-size:13px;
      font-family:inherit;outline:none;line-height:1.4;`);
    input.placeholder = 'Type a message…';
    const send = el('button', `flex-shrink:0;width:40px;height:40px;border-radius:10px;border:none;background:${ACCENT};
      cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;`);
    send.setAttribute('aria-label', 'Send message');
    send.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/>' +
      '<polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    foot.append(input, send);

    panel.append(head, list, foot);
    wrap.append(panel, bubble);
    document.body.appendChild(wrap);

    /* ── rendering ── */
    const seen = new Set();
    let unread = 0;
    let isOpen = false;

    function setBadge(n) {
      unread = Math.max(0, n);
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.style.display = unread > 0 ? 'flex' : 'none';
    }

    function addMessage(m) {
      if (seen.has(m.id)) return;
      seen.add(m.id);
      if (empty.parentNode) empty.remove();

      const mine = m.sender === 'user';
      const row = el('div', `display:flex;flex-direction:column;align-items:${mine ? 'flex-end' : 'flex-start'};gap:2px;`);
      const b = el('div', `max-width:82%;padding:9px 12px;border-radius:14px;font-size:13px;line-height:1.5;
        word-break:break-word;white-space:pre-wrap;` + (mine
          ? `background:${ACCENT};color:#fff;border-bottom-right-radius:4px;`
          : 'background:#1c1f27;color:#eaecef;border-bottom-left-radius:4px;'),
        m.body);
      const meta = el('div', 'font-size:10px;color:rgba(234,236,239,.35);padding:0 4px;',
        (mine ? '' : (m.sender_name || 'Support') + ' · ') + fmtTime(m.created_at));
      row.append(b, meta);
      list.appendChild(row);
    }

    const scrollDown = () => { list.scrollTop = list.scrollHeight; };

    async function markRead() {
      try { await db.rpc('chat_mark_read', { p_conversation: convId }); } catch (_) {}
      setBadge(0);
    }

    /* ── history ── */
    try {
      const { data } = await db.from('chat_messages')
        .select('id,sender,sender_name,body,created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(200);
      (data || []).forEach(addMessage);
      scrollDown();
    } catch (_) {}

    try {
      const { data } = await db.from('chat_conversations')
        .select('unread_user').eq('id', convId).maybeSingle();
      if (data) setBadge(data.unread_user || 0);
    } catch (_) {}

    /* ── realtime ── */
    db.channel('sv-support-chat-' + convId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: 'conversation_id=eq.' + convId,
      }, payload => {
        const m = payload.new;
        if (!m || seen.has(m.id)) return;
        addMessage(m);
        scrollDown();
        if (m.sender === 'admin') {
          if (isOpen) markRead();
          else setBadge(unread + 1);
        }
      })
      .subscribe();

    /* ── interactions ── */
    function open() {
      isOpen = true;
      panel.style.display = 'flex';
      bubble.style.transform = 'none';
      scrollDown();
      input.focus();
      if (unread > 0) markRead();
    }
    function close() { isOpen = false; panel.style.display = 'none'; }

    bubble.onclick   = () => (isOpen ? close() : open());
    closeBtn.onclick = e => { e.stopPropagation(); close(); };

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 96) + 'px';
    });

    let sending = false;
    async function submit() {
      const body = input.value.trim();
      if (!body || sending) return;
      sending = true;
      send.style.opacity = '.6';
      try {
        const { error } = await db.from('chat_messages').insert({
          conversation_id: convId,
          sender: 'user',
          sender_id: session.user.id,
          body: body.slice(0, 4000),
        });
        if (!error) {
          input.value = '';
          input.style.height = '40px';
        }
      } catch (_) {}
      sending = false;
      send.style.opacity = '1';
      input.focus();
    }

    send.onclick = submit;
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
  })();
})();
