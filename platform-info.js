// Veloci Global Markets — Platform Info dynamic loader
(async function () {
  const db = window.SV_DB;
  if (!db) return;

  try {
    const { data } = await db.from('system_settings')
      .select('key,value')
      .in('key', ['platform_name', 'support_email', 'support_phone']);

    const map = {};
    (data || []).forEach(r => { map[r.key] = r.value; });

    const name  = (map.platform_name || '').trim();
    const email = (map.support_email || '').trim();
    const phone = (map.support_phone || '').trim();

    // Document title
    if (name) {
      document.title = document.title.replace(/Veloci Global Markets/g, name);
    }

    // Platform name elements
    if (name) {
      document.querySelectorAll('[data-sv="platform_name"]').forEach(el => {
        el.textContent = name;
      });
    }

    // Support email elements
    if (email) {
      document.querySelectorAll('[data-sv="support_email"]').forEach(el => {
        el.textContent = email;
        if (el.tagName === 'A') el.href = 'mailto:' + email;
      });
      document.querySelectorAll('[data-sv-href="support_email"]').forEach(el => {
        el.href = 'mailto:' + email;
      });
    }

    // Support phone elements
    if (phone) {
      document.querySelectorAll('[data-sv="support_phone"]').forEach(el => {
        el.textContent = phone;
        if (el.tagName === 'A') el.href = 'tel:' + phone.replace(/[\s\-()+]/g, '');
      });
      document.querySelectorAll('[data-sv-href="support_phone"]').forEach(el => {
        el.href = 'tel:' + phone.replace(/[\s\-()+]/g, '');
      });
    }
  } catch (_) {}
})();
