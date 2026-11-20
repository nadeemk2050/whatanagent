/* ============================================================================
 * ☁️ Sidebar entry for the GDrive API Service Centre
 * ============================================================================
 * Loaded by /admin.html. It only ADDS one menu item — it never touches the
 * existing ones. If the sidebar is not present (another page), it does nothing.
 * ==========================================================================*/
(function () {
  'use strict';

  if (window.__GDRIVE_MENU_LOADED__) return;
  window.__GDRIVE_MENU_LOADED__ = true;

  const ITEM_ID = 'gdriveServiceMenuItem';

  function build() {
    const div = document.createElement('div');
    div.className = 'menu-item';
    div.id = ITEM_ID;
    div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;' +
      'background:rgba(59,130,246,0.08);border-left:4px solid #3b82f6;cursor:pointer;';
    div.innerHTML = '<span>☁️ GDrive API Service Centre</span>' +
      '<span style="font-size:8px;padding:1px 7px;border-radius:12px;background:#3b82f6;color:#fff;font-weight:bold;">API</span>';
    div.addEventListener('click', function () { window.location.href = '/gdrive-service'; });
    return div;
  }

  function inject() {
    if (document.getElementById(ITEM_ID)) return true;
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return false;

    const menuItems = sidebar.querySelectorAll('.menu-item');
    const item = build();

    // Place it after "WhatsApp Web" when that exists, otherwise at the top.
    let anchor = null;
    for (const el of menuItems) {
      if (/WhatsApp Web/i.test(el.textContent || '')) { anchor = el; break; }
    }
    if (anchor && anchor.nextSibling) sidebar.insertBefore(item, anchor.nextSibling);
    else if (anchor) sidebar.appendChild(item);
    else {
      const close = sidebar.querySelector('.sidebar-close');
      if (close && close.nextSibling) sidebar.insertBefore(item, close.nextSibling);
      else sidebar.appendChild(item);
    }
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  // The admin page rebuilds parts of the DOM occasionally; keep the entry alive
  // for the first half minute, then stop polling.
  let tries = 0;
  const timer = setInterval(function () {
    tries += 1;
    inject();
    if (tries > 30) clearInterval(timer);
  }, 1000);
})();
