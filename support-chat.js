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
  const SUPPORT_AVATAR = '/assets/support-avatar.png';

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

  const fmtSize = b => {
    if (!b && b !== 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  };

  const MAX_BYTES = 10 * 1024 * 1024;
  const ALLOWED = ['image/png','image/jpeg','image/jpg','image/gif','image/webp',
                   'application/pdf','text/plain'];

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
    /* Geometry lives in a stylesheet rather than inline styles so the panel can
       go fullscreen on phones the way Smartsupp does, while staying a corner
       panel on desktop. */
    const style = document.createElement('style');
    style.textContent = `
      #sv-chat-panel{
        position:absolute;left:0;bottom:70px;
        width:min(360px,calc(100vw - 40px));
        height:min(520px,calc(100vh - 120px));
        border:1px solid rgba(255,255,255,.09);
        border-radius:16px;
        box-shadow:0 18px 50px rgba(0,0,0,.55);
      }
      @media (max-width:640px){
        #sv-chat-wrap.sv-open{left:0;right:0;top:0;bottom:0;}
        /* the bubble carries an inline display, which would otherwise win */
        #sv-chat-wrap.sv-open #sv-chat-bubble{display:none !important;}
        #sv-chat-panel.sv-open{
          position:fixed;
          left:0;right:0;top:0;bottom:0;
          width:100%;
          height:100vh;
          height:100dvh;          /* keeps the composer above mobile browser chrome */
          max-height:none;
          border:none;
          border-radius:0;
          box-shadow:none;
        }
        #sv-chat-panel.sv-open .sv-chat-head{
          padding-top:max(14px, env(safe-area-inset-top));
        }
        /* the brand bar is the bottom-most element, so it carries the inset */
        #sv-chat-panel.sv-open .sv-chat-brand{
          padding-bottom:max(7px, env(safe-area-inset-bottom));
        }
      }
    `;
    document.head.appendChild(style);

    const wrap = el('div', `position:fixed;left:20px;bottom:20px;z-index:${Z};font-family:'Inter',system-ui,sans-serif;`);
    wrap.id = 'sv-chat-wrap';

    const badge = el('span', `position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 6px;
      border-radius:10px;background:#e0245e;color:#fff;font-size:11px;font-weight:700;display:none;
      align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4);`);

    const bubble = el('button', `position:relative;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;
      background:${ACCENT};box-shadow:0 6px 20px rgba(240,90,26,.45);display:flex;align-items:center;
      justify-content:center;transition:transform .15s;padding:0;`);
    bubble.id = 'sv-chat-bubble';
    bubble.setAttribute('aria-label', 'Support chat');
    bubble.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 ' +
      '8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 ' +
      '8.48 0 0 1 8 8v.5z"/></svg>';
    bubble.appendChild(badge);
    bubble.onmouseenter = () => { bubble.style.transform = 'scale(1.06)'; };
    bubble.onmouseleave = () => { bubble.style.transform = 'none'; };

    const panel = el('div', 'background:#12141a;display:none;flex-direction:column;overflow:hidden;');
    panel.id = 'sv-chat-panel';

    /* header */
    const head = el('div', `padding:14px 16px;background:linear-gradient(135deg,${ACCENT},#ff8c42);
      display:flex;align-items:center;gap:10px;flex-shrink:0;`);
    head.className = 'sv-chat-head';
    /* avatar with an online dot tucked into its corner */
    const avatarWrap = el('div', 'position:relative;flex-shrink:0;width:36px;height:36px;');
    const avatar = el('img', `width:36px;height:36px;border-radius:50%;display:block;object-fit:cover;
      background:rgba(255,255,255,.9);border:1.5px solid rgba(255,255,255,.65);`);
    avatar.src = SUPPORT_AVATAR;
    avatar.alt = 'Veloci Support';
    avatar.onerror = () => { avatarWrap.style.display = 'none'; };
    const dot = el('span', `position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;
      background:#0ecb81;border:2px solid #f2701f;`);
    avatarWrap.append(avatar, dot);
    const headText = el('div', 'flex:1;min-width:0;');
    headText.appendChild(el('div', 'font-size:14px;font-weight:700;color:#fff;line-height:1.2;', 'Veloci Support'));
    headText.appendChild(el('div', 'font-size:11px;color:rgba(255,255,255,.85);', 'We typically reply in a few minutes'));
    const closeBtn = el('button', `background:none;border:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;
      padding:0 2px;opacity:.9;`, '×');
    closeBtn.setAttribute('aria-label', 'Close chat');
    head.append(avatarWrap, headText, closeBtn);

    /* messages */
    const list = el('div', `flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;
      background:#0d0f14;`);
    const empty = el('div', `margin:auto;text-align:center;color:rgba(234,236,239,.4);font-size:13px;line-height:1.6;padding:0 10px;`,
      'Send us a message and our support team will reply here.');
    list.appendChild(empty);

    /* composer */
    const foot = el('div', `padding:10px;border-top:1px solid rgba(255,255,255,.08);display:flex;gap:8px;
      align-items:flex-end;background:#12141a;flex-shrink:0;`);
    foot.className = 'sv-chat-foot';
    const fileInput = el('input', 'display:none;');
    fileInput.type = 'file';
    fileInput.accept = ALLOWED.join(',');

    const clip = el('button', `flex-shrink:0;width:40px;height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.12);
      background:#0d0f14;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;`);
    clip.setAttribute('aria-label', 'Attach a file');
    clip.title = 'Attach a file (max 10 MB)';
    clip.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(234,236,239,.75)" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l' +
      '9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';

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
    foot.append(clip, input, send, fileInput);

    const brand = el('div', `padding:7px 10px;background:#0d0f14;border-top:1px solid rgba(255,255,255,.05);
      text-align:center;font-size:10px;letter-spacing:.03em;color:rgba(234,236,239,.3);flex-shrink:0;`);
    brand.className = 'sv-chat-brand';
    brand.appendChild(el('span', '', 'Powered by '));
    brand.appendChild(el('span', `color:${ACCENT};font-weight:600;`, 'Veloci Engine'));

    panel.append(head, list, foot, brand);
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

    /* The bucket is private, so every attachment needs a short-lived signed URL.
       Cached per path so re-renders don't re-sign the same file. */
    const urlCache = new Map();
    async function signedUrl(path) {
      if (urlCache.has(path)) return urlCache.get(path);
      try {
        const { data } = await db.storage.from('chat-attachments').createSignedUrl(path, 3600);
        const u = data && data.signedUrl;
        if (u) urlCache.set(path, u);
        return u || null;
      } catch (_) { return null; }
    }

    function attachmentNode(m, mine) {
      const isImg = String(m.attachment_type || '').startsWith('image/');
      if (isImg) {
        const img = el('img', `max-width:200px;max-height:200px;border-radius:8px;display:block;cursor:pointer;
          background:rgba(255,255,255,.06);min-height:60px;`);
        img.alt = m.attachment_name || 'attachment';
        signedUrl(m.attachment_path).then(u => {
          if (!u) return;
          img.src = u;
          img.onclick = () => window.open(u, '_blank', 'noopener');
        });
        return img;
      }
      const card = el('div', `display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer;
        background:${mine ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.07)'};`);
      card.appendChild(el('span', 'font-size:15px;flex-shrink:0;', '📎'));
      const info = el('div', 'min-width:0;');
      info.appendChild(el('div', `font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;
        text-overflow:ellipsis;max-width:150px;`, m.attachment_name || 'file'));
      info.appendChild(el('div', 'font-size:10px;opacity:.7;', fmtSize(m.attachment_size)));
      card.appendChild(info);
      card.onclick = async () => {
        const u = await signedUrl(m.attachment_path);
        if (u) window.open(u, '_blank', 'noopener');
      };
      return card;
    }

    function addMessage(m) {
      if (seen.has(m.id)) return;
      seen.add(m.id);
      if (empty.parentNode) empty.remove();

      const mine = m.sender === 'user';
      const row = el('div', `display:flex;flex-direction:column;align-items:${mine ? 'flex-end' : 'flex-start'};gap:2px;`);
      const b = el('div', `max-width:82%;padding:9px 12px;border-radius:14px;font-size:13px;line-height:1.5;
        word-break:break-word;white-space:pre-wrap;display:flex;flex-direction:column;gap:6px;` + (mine
          ? `background:${ACCENT};color:#fff;border-bottom-right-radius:4px;`
          : 'background:#1c1f27;color:#eaecef;border-bottom-left-radius:4px;'));

      if (m.attachment_path) b.appendChild(attachmentNode(m, mine));
      if (m.body && m.body.trim()) b.appendChild(el('span', 'white-space:pre-wrap;', m.body));

      /* Always brand support replies. Never surface whichever admin account
         actually sent it, even if an older row still carries a name. */
      const meta = el('div', 'font-size:10px;color:rgba(234,236,239,.35);padding:0 4px;',
        (mine ? '' : 'Veloci Support · ') + fmtTime(m.created_at));

      if (mine) {
        row.append(b, meta);
      } else {
        /* support messages sit next to the avatar, like Smartsupp */
        const line = el('div', 'display:flex;align-items:flex-end;gap:7px;max-width:100%;');
        const av = el('img', `width:24px;height:24px;border-radius:50%;flex-shrink:0;object-fit:cover;
          background:rgba(255,255,255,.9);margin-bottom:2px;`);
        av.src = SUPPORT_AVATAR;
        av.alt = '';
        av.onerror = () => { av.style.display = 'none'; };
        line.append(av, b);
        meta.style.paddingLeft = '35px';       // line the timestamp up with the bubble
        row.append(line, meta);
      }
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
        .select('id,sender,sender_name,body,created_at,attachment_path,attachment_name,attachment_type,attachment_size')
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
    const isPhone = () => window.matchMedia('(max-width:640px)').matches;
    let scrollLocked = false;

    function open() {
      isOpen = true;
      panel.style.display = 'flex';
      panel.classList.add('sv-open');
      wrap.classList.add('sv-open');
      bubble.style.transform = 'none';
      /* fullscreen on phones: stop the page behind from scrolling underneath,
         and take the bubble out of the way of the panel header */
      if (isPhone()) {
        bubble.style.display = 'none';
        scrollLocked = true;
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
      }
      scrollDown();
      /* don't autofocus on phones — the keyboard would cover the conversation */
      if (!isPhone()) input.focus();
      if (unread > 0) markRead();
    }

    function close() {
      isOpen = false;
      panel.style.display = 'none';
      panel.classList.remove('sv-open');
      wrap.classList.remove('sv-open');
      bubble.style.display = 'flex';
      if (scrollLocked) {
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        scrollLocked = false;
      }
    }

    /* rotating or resizing out of phone width must not leave the page locked */
    window.addEventListener('resize', () => {
      if (!isOpen) return;
      if (!isPhone()) {
        bubble.style.display = 'flex';       // corner layout again, bubble is the toggle
        if (scrollLocked) {
          document.documentElement.style.overflow = '';
          document.body.style.overflow = '';
          scrollLocked = false;
        }
      } else {
        bubble.style.display = 'none';
        if (!scrollLocked) {
          scrollLocked = true;
          document.documentElement.style.overflow = 'hidden';
          document.body.style.overflow = 'hidden';
        }
      }
    });

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

    /* ── attachments ── */
    function toast(msg) {
      const t = el('div', `position:absolute;left:10px;right:10px;bottom:56px;padding:8px 10px;border-radius:8px;
        background:#2a1410;border:1px solid rgba(240,90,26,.4);color:#ffb492;font-size:12px;text-align:center;z-index:2;`, msg);
      panel.appendChild(t);
      setTimeout(() => t.remove(), 3200);
    }

    clip.onclick = () => { if (!sending) fileInput.click(); };

    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';                       // allow re-picking the same file
      if (!file || sending) return;

      if (file.size > MAX_BYTES) { toast('File is too large (max 10 MB)'); return; }
      if (file.type && ALLOWED.indexOf(file.type) === -1) {
        toast('Only images, PDF or text files'); return;
      }

      sending = true;
      clip.style.opacity = '.5';
      const safe = (file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
      const path = convId + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;

      try {
        const up = await db.storage.from('chat-attachments')
          .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (up.error) throw up.error;

        const { error } = await db.from('chat_messages').insert({
          conversation_id: convId,
          sender: 'user',
          sender_id: session.user.id,
          body: '',
          attachment_path: path,
          attachment_name: (file.name || 'file').slice(0, 120),
          attachment_type: file.type || null,
          attachment_size: file.size,
        });
        if (error) throw error;
      } catch (err) {
        toast('Upload failed. Please try again.');
      }

      sending = false;
      clip.style.opacity = '1';
    };
  })();
})();
