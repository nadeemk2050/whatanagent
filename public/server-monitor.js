/* 🖥️ Server monitor — small live RAM / disk pill in the dashboard top bar; click for details.
   Polls a tiny endpoint (a few file reads on the server) every 15 s while the tab is visible. */
(function () {
  const POLL_MS = 15000;
  const el = document.getElementById('serverMonitorPill');
  if (!el) return;
  let last = null, timer = null, dir = '/', modal = null;

  const hdr = () => { try { return { 'x-admin-token': localStorage.getItem('wat_admin_token') || '' }; } catch (e) { return {}; } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fmt(b) {
    b = Number(b) || 0;
    if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(b >= 10 * 1024 ** 3 ? 0 : 1) + ' GB';
    if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(0) + ' MB';
    return (b / 1024).toFixed(0) + ' KB';
  }
  const pct = (u, t) => (t > 0 ? Math.round((u / t) * 100) : 0);
  const color = (p) => (p >= 90 ? '#dc2626' : p >= 75 ? '#d97706' : '#16a34a');

  async function poll() {
    if (document.hidden) return;
    try {
      const r = await fetch('/api/server/stats', { headers: hdr(), cache: 'no-store' });
      if (!r.ok) throw new Error(r.status === 401 ? 'token' : 'http ' + r.status);
      last = await r.json();
      paint();
      if (modal && modal.style.display !== 'none') paintModalTop();
    } catch (e) {
      el.innerHTML = '🖥️ <span style="color:#b45309;">' + (String(e.message) === 'token' ? 'set admin token' : 'server stats unavailable') + '</span>';
    }
  }

  function paint() {
    const m = last.mem, d = last.disk;
    const mp = pct(m.used, m.total), dp = pct(d.used, d.total);
    el.innerHTML =
      '<span title="Disk used / total">💾 <b style="color:' + color(dp) + '">' + fmt(d.used) + '</b>/' + fmt(d.total) + '</span>' +
      '<span style="opacity:.35;">|</span>' +
      '<span title="RAM used / total">🧠 <b style="color:' + color(mp) + '">' + fmt(m.used) + '</b>/' + fmt(m.total) + '</span>';
    el.title = 'Tencent VPS · disk ' + dp + '% · RAM ' + mp + '% · load ' + last.load1 + '. Click for details.';
  }

  function bar(label, used, total, extra) {
    const p = pct(used, total);
    return '<div style="margin:12px 0;"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><b>' + label + '</b><span>' + fmt(used) + ' of ' + fmt(total) + ' · <b style="color:' + color(p) + '">' + p + '%</b></span></div>' +
      '<div style="height:12px;background:#e5e7eb;border-radius:8px;overflow:hidden;"><div style="height:100%;width:' + p + '%;background:' + color(p) + ';"></div></div>' +
      (extra ? '<div style="font-size:11px;color:#64748b;margin-top:3px;">' + extra + '</div>' : '') + '</div>';
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:100001;display:none;align-items:flex-start;justify-content:center;padding:40px 12px;overflow:auto;';
    modal.onclick = (e) => { if (e.target === modal) close(); };
    modal.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:680px;width:100%;padding:18px 20px;box-shadow:0 20px 50px rgba(0,0,0,.35);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:17px;font-weight:800;">🖥️ Tencent VPS status</div>' +
      '<div><button id="smRefresh" style="border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:12px;">🔄 Refresh folders</button> ' +
      '<button id="smClose" style="border:none;background:#e5e7eb;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:12px;">✕</button></div></div>' +
      '<div id="smTop"></div><div id="smDisk" style="margin-top:6px;"></div><div id="smProcs" style="margin-top:14px;"></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#smClose').onclick = close;
    modal.querySelector('#smRefresh').onclick = () => loadDetails(true);
    return modal;
  }

  function paintModalTop() {
    if (!last) return;
    const m = last.mem, d = last.disk;
    modal.querySelector('#smTop').innerHTML =
      bar('💾 Disk (' + esc(d.mount) + ')', d.used, d.total, fmt(d.free) + ' free') +
      bar('🧠 RAM', m.used, m.total, fmt(m.available) + ' available · ' + fmt(m.cache) + ' in cache (reclaimable)') +
      (m.swapTotal ? bar('♻️ Swap', m.swapUsed, m.swapTotal, 'Heavy swap use means the server is short of RAM') : '') +
      '<div style="font-size:12px;color:#475569;">CPU load (1 / 5 min): <b>' + last.load1 + ' / ' + last.load5 + '</b> on ' + last.cpus + ' cores · server up ' + Math.floor(last.uptimeSec / 86400) + ' d ' + Math.floor((last.uptimeSec % 86400) / 3600) + ' h · app uses ' + fmt(last.app.rss) + ' RAM · updated ' + new Date(last.at).toLocaleTimeString() + '</div>';
  }

  async function loadDetails(fresh) {
    const dEl = modal.querySelector('#smDisk'), pEl = modal.querySelector('#smProcs');
    dEl.innerHTML = '<div style="color:#64748b;font-size:13px;padding:8px 0;">Measuring folders… (can take a few seconds)</div>';
    try {
      const r = await fetch('/api/server/stats/details?dir=' + encodeURIComponent(dir) + (fresh ? '&fresh=1' : ''), { headers: hdr() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.status);
      const items = d.disk.items || [];
      const parent = dir === '/' ? '' : (dir.replace(/\/[^/]+$/, '') || '/');
      dEl.innerHTML = '<div style="font-weight:700;font-size:13px;margin-bottom:6px;">📂 Where the space is used: <code>' + esc(dir) + '</code> (' + fmt(d.disk.total) + ')' +
        (parent ? ' <button data-go="' + esc(parent) + '" style="margin-left:6px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:11px;">⬆ up</button>' : '') + '</div>' +
        (d.disk.note ? '<div style="font-size:12px;color:#64748b;">' + esc(d.disk.note) + '</div>' : '') +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;">' + items.map(it => {
          const p = pct(it.bytes, d.disk.total || 1);
          return '<tr data-go="' + esc(it.path) + '" style="cursor:pointer;border-bottom:1px solid #f1f5f9;"><td style="padding:5px 4px;word-break:break-all;">' + esc(it.path) + '</td>' +
            '<td style="width:120px;"><div style="height:7px;background:#e5e7eb;border-radius:5px;"><div style="height:100%;width:' + p + '%;background:#6366f1;border-radius:5px;"></div></div></td>' +
            '<td style="padding:5px 4px;text-align:right;white-space:nowrap;font-weight:600;">' + fmt(it.bytes) + '</td></tr>';
        }).join('') + '</table><div style="font-size:11px;color:#94a3b8;margin-top:4px;">Click a folder to look inside it. Folders the app cannot read are not counted.</div>';
      dEl.querySelectorAll('[data-go]').forEach(n => { n.onclick = () => { dir = n.getAttribute('data-go'); loadDetails(false); }; });
      pEl.innerHTML = '<div style="font-weight:700;font-size:13px;margin-bottom:6px;">🧠 Programs using the most RAM</div><table style="width:100%;border-collapse:collapse;font-size:12px;">' +
        (d.procs || []).map(p => '<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:5px 4px;"><b>' + esc(p.name) + '</b><div style="color:#94a3b8;font-size:10px;word-break:break-all;">' + esc(p.cmd) + '</div></td>' +
          '<td style="text-align:right;white-space:nowrap;padding:5px 4px;">' + p.cpu + '% CPU</td><td style="text-align:right;white-space:nowrap;padding:5px 4px;font-weight:600;">' + fmt(p.rss) + '</td></tr>').join('') + '</table>';
    } catch (e) {
      dEl.innerHTML = '<div style="color:#b91c1c;font-size:13px;">Could not load details: ' + esc(e.message) + '</div>';
    }
  }

  function open() { ensureModal(); modal.style.display = 'flex'; dir = '/'; paintModalTop(); loadDetails(false); poll(); }
  function close() { if (modal) modal.style.display = 'none'; }

  el.onclick = open;
  poll();
  timer = setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
})();
