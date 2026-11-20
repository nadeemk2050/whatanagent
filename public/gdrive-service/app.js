/* ============================================================================
 * ☁️ GDrive API Service Centre — front end (plain JS, no build step)
 * ==========================================================================*/
(function () {
  'use strict';

  const API = '/gdrive/api';
  const TOKEN_KEY = 'gdrive_admin_token';

  const S = {
    accounts: [],
    search: '',
    driveId: '',
    overview: null,
    poll: null,
    retryTimer: null,
    busy: false
  };

  // ── tiny helpers ─────────────────────────────────────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function fmtBytes(n) {
    const v = Number(n) || 0;
    if (v < 1024) return v + ' B';
    if (v < 1048576) return (v / 1024).toFixed(0) + ' KB';
    if (v < 1073741824) return (v / 1048576).toFixed(1) + ' MB';
    return (v / 1073741824).toFixed(2) + ' GB';
  }
  const fmtDate = (ms) => (ms ? new Date(Number(ms)).toLocaleString() : '—');

  let toastTimer = null;
  function toast(msg, kind) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast ' + (kind || '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
  }

  // ── clipboard (works over plain HTTP too) ────────────────────────────────
  function copyText(text) {
    const fail = () => toast('Copy failed — select the text and copy it manually', 'bad');
    const ok = () => toast('Copied', 'ok');
    const legacy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = String(text == null ? '' : text);
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        const done = typeof document.execCommand === 'function' && document.execCommand('copy');
        document.body.removeChild(ta);
        if (done) ok(); else fail();
      } catch (e) { fail(); }
    };
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(String(text == null ? '' : text)).then(ok, legacy);
        return;
      }
    } catch (e) { /* fall through to the textarea path */ }
    legacy();
  }

  // ── API with admin-token handling ────────────────────────────────────────
  async function api(path, opts) {
    const options = Object.assign({ headers: {} }, opts || {});
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) options.headers['x-gdrive-token'] = token;
    if (options.body && typeof options.body === 'string') options.headers['Content-Type'] = 'application/json';

    const res = await fetch(API + path, options);
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }

    if (res.status === 401 && !options.__retried) {
      const given = await askToken();
      if (given) {
        options.__retried = true;
        return api(path, options);
      }
    }
    if (!res.ok) throw new Error((body && body.error) || ('Request failed (' + res.status + ')'));
    return body || {};
  }

  function askToken() {
    return new Promise((resolve) => {
      openModal('Admin token required', 'This centre is protected. Paste the admin token to continue.',
        [
          { label: 'Cancel', kind: 'ghost', onClick: () => { closeModal(); resolve(''); } },
          {
            label: 'Use token', kind: 'primary', onClick: () => {
              const input = $('#modalBody input');
              const value = input ? input.value.trim() : '';
              closeModal();
              if (value) { localStorage.setItem(TOKEN_KEY, value); resolve(value); }
              else resolve('');
            }
          }
        ],
        '<input type="password" id="adminTokenInput" placeholder="admin token" style="margin-top:8px">');
    });
  }

  // ── modal ────────────────────────────────────────────────────────────────
  function openModal(title, bodyHtml, actions, extraHtml) {
    const modal = $('#modal');
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = (bodyHtml || '') + (extraHtml || '');
    const row = $('#modalActions');
    row.innerHTML = '';
    (actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.kind || 'ghost');
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      row.appendChild(b);
    });
    modal.hidden = false;
  }
  function closeModal() {
    const modal = $('#modal');
    if (modal) modal.hidden = true;
  }
  function confirmModal(title, html, yesLabel, onYes) {
    openModal(title, html, [
      { label: 'No', kind: 'ghost', onClick: closeModal },
      {
        label: yesLabel || 'Yes', kind: 'primary', onClick: () => {
          closeModal();
          try { onYes(); } catch (e) { toast(e.message, 'bad'); }
        }
      }
    ]);
  }

  // ── routing ──────────────────────────────────────────────────────────────
  function route() {
    const m = location.pathname.match(/^\/gdrive-service\/(\d+)\/?$/);
    if (m) {
      S.driveId = m[1];
      $('#hub').hidden = true;
      $('#hubTabs').hidden = true;
      $('#service').hidden = false;
      loadService();
    } else {
      S.driveId = '';
      stopPoll();
      $('#hub').hidden = false;
      $('#hubTabs').hidden = false;
      $('#service').hidden = true;
      loadAccounts();
    }
  }

  function goToService(id, alias) {
    confirmModal(
      'Open service page?',
      'Do you want to open / initialize the <b>Dedicated API Service Page</b> for <b>' + esc(alias) + '</b>?',
      'Yes, open it',
      () => {
        history.pushState({}, '', '/gdrive-service/' + id);
        route();
      }
    );
  }

  // ── health / quota rendering ─────────────────────────────────────────────
  function healthPill(account) {
    const h = account.last_health;
    if (account.status === 'inactive') return '<span class="pill pill-muted">Paused</span>';
    if (h === 'connected') return '<span class="pill pill-ok">Connected</span>';
    if (h === 'expired') return '<span class="pill pill-bad">Token expired</span>';
    if (h === 'error') return '<span class="pill pill-warn">Error</span>';
    return '<span class="pill pill-muted">Unknown</span>';
  }

  function quotaCell(account) {
    const used = Number(account.quota_used) || 0;
    const total = Number(account.quota_total) || 0;
    if (!total) return '<span class="dim">—</span>';
    const pct = Math.min(100, Math.round((used / total) * 100));
    const cls = pct >= 95 ? 'bad' : (pct >= 80 ? 'warn' : '');
    const alertGb = Number(account.quota_alert_gb) || 0;
    const overAlert = alertGb > 0 && used >= alertGb * 1073741824;
    return '' +
      '<div class="mono">' + (used / 1073741824).toFixed(2) + ' / ' + (total / 1073741824).toFixed(1) + ' GB</div>' +
      '<div class="bar ' + cls + '" style="margin-top:4px"><i style="width:' + pct + '%"></i></div>' +
      (overAlert ? '<div style="font-size:10.5px;color:#fbbf24;margin-top:3px">above ' + alertGb + ' GB alert</div>' : '');
  }

  // ── hub: accounts list ───────────────────────────────────────────────────
  async function loadAccounts() {
    try {
      const data = await api('/accounts');
      clearTimeout(S.retryTimer);
      S.retryTimer = null;
      S.accounts = data.accounts || [];
      renderAccounts();
      const sys = await api('/system').catch(() => null);
      $('#connPill').className = 'pill pill-ok';
      $('#connPill').textContent = 'service online';
      if (sys && sys.admin_token_required && !localStorage.getItem(TOKEN_KEY)) {
        $('#connPill').className = 'pill pill-warn';
        $('#connPill').textContent = 'token required';
      }
    } catch (e) {
      // A deploy restarts the server, so a failed first load usually heals itself.
      $('#connPill').className = 'pill pill-warn';
      $('#connPill').textContent = 'reconnecting…';
      $('#accountsTable').innerHTML = '<div class="pad" style="color:#fca5a5">' + esc(e.message) + '</div>' +
        '<div class="pad muted">The service may be restarting. Retrying automatically…</div>';
      clearTimeout(S.retryTimer);
      S.retryTimer = setTimeout(loadAccounts, 4000);
    }
  }

  function renderAccounts() {
    const host = $('#accountsTable');
    const q = S.search.trim().toLowerCase();
    const rows = S.accounts.filter((a) =>
      !q || String(a.alias || '').toLowerCase().includes(q) || String(a.email || '').toLowerCase().includes(q));

    if (!rows.length) {
      host.innerHTML = '<div class="pad muted">' + (S.accounts.length
        ? 'No drive matches that search.'
        : 'No Google Drive connected yet. Add one from the first tab.') + '</div>';
      return;
    }

    host.innerHTML = '' +
      '<table><thead><tr>' +
        '<th>ID / Alias</th><th>Google email</th><th>Health</th><th>Storage</th>' +
        '<th>Active apps</th><th>Queue</th><th>VPS cache</th><th>Auto-delete</th><th>Actions</th>' +
      '</tr></thead><tbody>' +
      rows.map((a) => {
        const st = a.stats || {};
        return '<tr class="clickable" data-open="' + a.id + '" data-alias="' + esc(a.alias) + '">' +
          '<td><b>#' + a.id + '</b> · ' + esc(a.alias) + '<div class="dim" style="font-size:11px">' +
            (a.has_credentials ? 'credentials saved' : 'no credentials') + '</div></td>' +
          '<td><a href="#" data-open="' + a.id + '" data-alias="' + esc(a.alias) + '">' + esc(a.email) + '</a></td>' +
          '<td>' + healthPill(a) +
            ' <button class="btn small ghost" data-retest="' + a.id + '">Re-test</button>' +
            (a.last_error ? '<div style="font-size:10.5px;color:#fca5a5;max-width:220px">' + esc(a.last_error.slice(0, 90)) + '</div>' : '') +
          '</td>' +
          '<td>' + quotaCell(a) + '</td>' +
          '<td><b>' + (a.clients_active || 0) + '</b></td>' +
          '<td>' + (Number(st.queued) ? '<span class="pill pill-info">' + st.queued + ' pending</span> ' : '') +
            (Number(st.failed) ? '<span class="pill pill-bad">' + st.failed + ' failed</span>' : '') +
            (!Number(st.queued) && !Number(st.failed) ? '<span class="dim">idle</span>' : '') + '</td>' +
          '<td class="mono">' + fmtBytes(st.cache_bytes) + '</td>' +
          '<td>' + (a.retention_hours || 24) + ' hrs</td>' +
          '<td style="white-space:nowrap">' +
            '<button class="btn small ghost" data-edit="' + a.id + '">Edit</button> ' +
            '<button class="btn small ' + (a.status === 'active' ? 'ghost' : 'green') + '" data-toggle="' + a.id + '">' +
              (a.status === 'active' ? 'Pause' : 'Activate') + '</button> ' +
            '<button class="btn small danger" data-del="' + a.id + '">Delete</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';

    $$('[data-open]', host).forEach((n) => n.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = n.getAttribute('data-open');
      const acc = S.accounts.find((x) => String(x.id) === String(id));
      goToService(id, (acc && acc.alias) || 'this drive');
    }));
    $$('[data-retest]', host).forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      retestAccount(b.getAttribute('data-retest'), b);
    }));
    $$('[data-edit]', host).forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openEdit(b.getAttribute('data-edit'));
    }));
    $$('[data-toggle]', host).forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleAccount(b.getAttribute('data-toggle'));
    }));
    $$('[data-del]', host).forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      deleteAccountPrompt(b.getAttribute('data-del'));
    }));
  }

  async function retestAccount(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'testing…'; }
    try {
      const r = await api('/accounts/' + id + '/test', { method: 'POST' });
      toast('Connected · ' + (r.drive_email || 'verified'), 'ok');
    } catch (e) {
      toast('Test failed: ' + e.message, 'bad');
    } finally {
      await loadAccounts();
    }
  }

  function toggleAccount(id) {
    const acc = S.accounts.find((x) => String(x.id) === String(id));
    if (!acc) return;
    const next = acc.status === 'active' ? 'inactive' : 'active';
    api('/accounts/' + id, { method: 'PUT', body: JSON.stringify({ status: next }) })
      .then(() => { toast('Drive ' + (next === 'active' ? 'activated' : 'paused'), 'ok'); loadAccounts(); })
      .catch((e) => toast(e.message, 'bad'));
  }

  function deleteAccountPrompt(id) {
    const acc = S.accounts.find((x) => String(x.id) === String(id));
    confirmModal('Delete this Google Drive?',
      'Removing <b>' + esc(acc ? acc.alias : id) + '</b> also removes its client keys and queue rows from this server. ' +
      'Files already on Google Drive are <b>not</b> deleted.',
      'Delete drive',
      async () => {
        try {
          await api('/accounts/' + id, { method: 'DELETE' });
          toast('Drive removed', 'ok');
          loadAccounts();
        } catch (e) { toast(e.message, 'bad'); }
      });
  }

  function openEdit(id) {
    const acc = S.accounts.find((x) => String(x.id) === String(id));
    if (!acc) return;
    openModal('Edit credentials — ' + acc.alias,
      '<div class="muted" style="margin-bottom:10px">Leave the secret and token blank to keep the stored values.</div>',
      [
        { label: 'Cancel', kind: 'ghost', onClick: closeModal },
        {
          label: 'Save changes', kind: 'primary', onClick: async () => {
            const body = {
              alias: $('#e_alias').value.trim(),
              email: $('#e_email').value.trim(),
              client_id: $('#e_cid').value.trim() || undefined,
              client_secret: $('#e_csec').value.trim() || undefined,
              refresh_token: $('#e_tok').value.trim() || undefined,
              root_folder_id: $('#e_root').value.trim(),
              retention_hours: Number($('#e_ret').value) || 24,
              quota_alert_gb: Number($('#e_alert').value) || 0,
              status: $('#e_status').value
            };
            try {
              await api('/accounts/' + id, { method: 'PUT', body: JSON.stringify(body) });
              closeModal();
              toast('Saved', 'ok');
              loadAccounts();
            } catch (e) { toast(e.message, 'bad'); }
          }
        }
      ],
      '<div class="grid">' +
        '<label>Alias<input id="e_alias" value="' + esc(acc.alias) + '"></label>' +
        '<label>Email<input id="e_email" value="' + esc(acc.email) + '"></label>' +
        '<label class="span2">Client ID<input id="e_cid" placeholder="' + esc(acc.client_id_hint) + '"></label>' +
        '<label>Client secret<input id="e_csec" type="password" placeholder="unchanged"></label>' +
        '<label>Refresh token<input id="e_tok" type="password" placeholder="unchanged"></label>' +
        '<label>Root folder ID<input id="e_root" value="' + esc(acc.root_folder_id) + '"></label>' +
        '<label>Retention hours<input id="e_ret" type="number" min="1" max="720" value="' + (acc.retention_hours || 24) + '"></label>' +
        '<label>Quota alert GB<input id="e_alert" type="number" min="0" value="' + (acc.quota_alert_gb || 0) + '"></label>' +
        '<label>Status<select id="e_status">' +
          '<option value="active"' + (acc.status === 'active' ? ' selected' : '') + '>Active</option>' +
          '<option value="inactive"' + (acc.status === 'inactive' ? ' selected' : '') + '>Inactive</option>' +
        '</select></label>' +
      '</div>');
  }

  // ── hub: add form ────────────────────────────────────────────────────────
  function formValues() {
    const f = $('#addForm');
    const get = (n) => (f.elements[n] ? String(f.elements[n].value || '').trim() : '');
    return {
      alias: get('alias'),
      email: get('email'),
      client_id: get('client_id'),
      client_secret: get('client_secret'),
      refresh_token: get('refresh_token'),
      root_folder_id: get('root_folder_id'),
      retention_hours: Number(get('retention_hours')) || 24,
      quota_alert_gb: Number(get('quota_alert_gb')) || 0,
      status: get('status') || 'active'
    };
  }

  function showResult(html, kind) {
    const box = $('#addResult');
    box.className = 'result ' + (kind || '');
    box.innerHTML = html;
    box.hidden = false;
  }

  async function testConnection() {
    const v = formValues();
    if (!v.client_id || !v.client_secret || !v.refresh_token) {
      showResult('Client ID, client secret and refresh token are required to test.', 'bad');
      return;
    }
    const btn = $('#testBtn');
    btn.disabled = true; btn.textContent = 'testing…';
    try {
      const r = await api('/accounts/test', { method: 'POST', body: JSON.stringify(v) });
      const used = fmtBytes(r.quota.used);
      const total = r.quota.total ? fmtBytes(r.quota.total) : 'unlimited';
      showResult('✅ Connection OK\nGoogle account: ' + esc(r.email) +
        (r.display_name ? ' (' + esc(r.display_name) + ')' : '') +
        '\nStorage: ' + used + ' used of ' + total, 'ok');
      // Fill the email if the user left it identical to the verified account.
      if (!$('#addForm').elements.email.value.trim() && r.email) {
        $('#addForm').elements.email.value = r.email;
      }
    } catch (e) {
      showResult('❌ ' + esc(e.message), 'bad');
    } finally {
      btn.disabled = false; btn.textContent = '🔌 Test Connection & Verify Token';
    }
  }

  async function saveAccount(ev) {
    ev.preventDefault();
    const v = formValues();
    if (!v.alias || !v.email || !v.client_id || !v.client_secret || !v.refresh_token) {
      showResult('Alias, email, client ID, client secret and refresh token are all required.', 'bad');
      return;
    }
    const submit = ev.target.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = 'saving…';
    try {
      const r = await api('/accounts', { method: 'POST', body: JSON.stringify(v) });
      showResult('✅ Saved. Drive #' + r.account.id + ' is ' + r.account.status +
        (r.account.last_health === 'connected' ? ' and verified.' : ' — check its health in the list.'), 'ok');
      $('#addForm').reset();
      $('#addForm').elements.retention_hours.value = '24';
      await loadAccounts();
      switchTab('list');
    } catch (e) {
      showResult('❌ ' + esc(e.message), 'bad');
    } finally {
      submit.disabled = false; submit.textContent = '💾 Save GDrive Account';
    }
  }

  // ── tabs ─────────────────────────────────────────────────────────────────
  function switchTab(which) {
    $$('#hubTabs .tab').forEach((t) => t.classList.toggle('active', t.getAttribute('data-tab') === which));
    $('#tab-add').hidden = which !== 'add';
    $('#tab-list').hidden = which !== 'list';
    if (which === 'list') loadAccounts();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEDICATED SERVICE PAGE
  // ══════════════════════════════════════════════════════════════════════════
  async function loadService() {
    const host = $('#service');
    host.innerHTML = '<div class="card"><div class="muted pad">Loading drive #' + esc(S.driveId) + '…</div></div>';
    try {
      S.overview = await api('/accounts/' + S.driveId + '/overview');
      renderService();
      startPoll();
    } catch (e) {
      host.innerHTML = '<div class="card"><div class="pad" style="color:#fca5a5">' + esc(e.message) + '</div>' +
        '<div class="pad"><a class="btn ghost" href="/gdrive-service">← Back to all drives</a></div></div>';
    }
  }

  function startPoll() {
    stopPoll();
    S.poll = setInterval(() => refreshService(true), 5000);
  }
  function stopPoll() { if (S.poll) { clearInterval(S.poll); S.poll = null; } }

  async function refreshService(silent) {
    try {
      const data = await api('/accounts/' + S.driveId + '/overview');
      S.overview = data;
      if (silent) {
        const stats = $('#statGrid'); if (stats) stats.innerHTML = statCards(data);
        const files = $('#filesBody'); if (files) files.innerHTML = fileRows(data.files || []);
        const clients = $('#clientsBody'); if (clients) clients.innerHTML = clientRows(data.clients || []);
        const quota = $('#quotaLine'); if (quota) quota.innerHTML = quotaLine(data.account);
      } else {
        renderService();
      }
    } catch (e) { /* keep the last known state */ }
  }

  function statCards(d) {
    const st = d.stats || {};
    const cards = [
      ['Pending on VPS', st.queued || 0, 'pill-info'],
      ['Uploading', st.uploading || 0, 'pill-info'],
      ['Verified (both)', st.uploaded || 0, 'pill-ok'],
      ['Archived on Drive', st.archived || 0, 'pill-muted'],
      ['Failed', st.failed || 0, st.failed ? 'pill-bad' : 'pill-muted'],
      ['VPS cache', fmtBytes(st.cache_bytes), 'pill-muted'],
      ['Active apps', (d.clients || []).filter((c) => c.status === 'active').length, 'pill-muted']
    ];
    return cards.map(([label, value, cls]) =>
      '<div class="stat"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>').join('');
  }

  function statusChip(status) {
    const map = {
      QUEUED: ['Queued on VPS', 'pill-info'],
      UPLOADING: ['Uploading', 'pill-info'],
      UPLOADED_VERIFIED: ['Verified on both', 'pill-ok'],
      ARCHIVED_ON_GDRIVE: ['VPS cleaned · GDrive only', 'pill-muted'],
      FAILED: ['Failed', 'pill-bad']
    };
    const m = map[status] || [status, 'pill-muted'];
    return '<span class="pill ' + m[1] + '">' + esc(m[0]) + '</span>';
  }

  function fileRows(files) {
    if (!files.length) return '<tr><td colspan="7" class="muted">No files yet. Upload one from a client app to see it here.</td></tr>';
    return files.map((f) => '' +
      '<tr>' +
        '<td class="mono" style="max-width:180px;overflow:hidden;text-overflow:ellipsis">' + esc(f.name) + '</td>' +
        '<td>' + esc(f.client_name || '—') + '</td>' +
        '<td class="mono">' + fmtBytes(f.size) + '</td>' +
        '<td>' + statusChip(f.status) +
          (f.error ? '<div style="font-size:10.5px;color:#fca5a5;max-width:240px">' + esc(f.error.slice(0, 110)) + '</div>' : '') + '</td>' +
        '<td class="mono">' + (f.local_present ? 'on VPS' : 'drive only') + '</td>' +
        '<td style="font-size:11px" class="dim">' + fmtDate(f.created_at) + '</td>' +
        '<td style="white-space:nowrap">' +
          (f.status === 'FAILED' ? '<button class="btn small green" data-retry="' + esc(f.id) + '">Retry</button> ' : '') +
          (f.gdrive_link ? '<a class="btn small ghost" href="' + esc(f.gdrive_link) + '" target="_blank" rel="noreferrer">Drive ↗</a> ' : '') +
          (f.local_present ? '<a class="btn small ghost" href="/gdrive/api/files/' + esc(f.id) + '/peek" target="_blank">Local</a> ' : '') +
          '<button class="btn small danger" data-delfile="' + esc(f.id) + '">Delete</button>' +
        '</td>' +
      '</tr>').join('');
  }

  function clientRows(clients) {
    if (!clients.length) return '<tr><td colspan="8" class="muted">No client app yet. Create one below to get an API key.</td></tr>';
    return clients.map((c) => '' +
      '<tr>' +
        '<td><b>' + esc(c.name) + '</b><div class="dim mono" style="font-size:10.5px">' + esc(c.serial) + '</div></td>' +
        '<td class="mono">' + esc(c.key_hint) + '</td>' +
        '<td>' + (c.folder_url
          ? '<a href="' + esc(c.folder_url) + '" target="_blank" rel="noreferrer">' + esc(c.folder_name) + ' ↗</a>'
          : '<span class="dim">—</span>') + '</td>' +
        '<td>' + esc(c.scope_label) + '</td>' +
        '<td class="mono">' + (c.files_count || 0) + ' · ' + fmtBytes(c.bytes_used) + '</td>' +
        '<td class="mono">' + (c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'Lifetime') +
          (c.expired ? ' <span class="pill pill-bad">expired</span>' : '') + '</td>' +
        '<td><span class="pill ' + (c.status === 'active' ? 'pill-ok' : 'pill-muted') + '">' + esc(c.status) + '</span></td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn small ghost" data-snippets="' + c.id + '">Code</button> ' +
          '<button class="btn small ghost" data-extend="' + c.id + '">Extend</button> ' +
          '<button class="btn small ghost" data-regen="' + c.id + '">New key</button> ' +
          '<button class="btn small ' + (c.status === 'active' ? 'ghost' : 'green') + '" data-revoke="' + c.id + '">' +
            (c.status === 'active' ? 'Revoke' : 'Activate') + '</button> ' +
          '<button class="btn small ghost" data-audit="' + c.id + '">Logs</button> ' +
          '<button class="btn small danger" data-delclient="' + c.id + '">Delete</button>' +
        '</td>' +
      '</tr>').join('');
  }

  function quotaLine(account) {
    const used = Number(account.quota_used) || 0;
    const total = Number(account.quota_total) || 0;
    if (!total) return '<span class="dim">storage quota unavailable</span>';
    const pct = Math.min(100, Math.round((used / total) * 100));
    return '<div class="mono">' + (used / 1073741824).toFixed(2) + ' GB of ' + (total / 1073741824).toFixed(1) +
      ' GB (' + pct + '%)</div><div class="bar ' + (pct >= 95 ? 'bad' : pct >= 80 ? 'warn' : '') +
      '" style="margin-top:5px;max-width:320px"><i style="width:' + pct + '%"></i></div>';
  }

  function renderService() {
    const d = S.overview;
    if (!d) return;
    const a = d.account;
    const host = $('#service');

    host.innerHTML = '' +
      '<div class="row between" style="margin:6px 0 14px">' +
        '<div>' +
          '<button class="btn ghost small" data-hub="1">← All drives</button>' +
        '</div>' +
        '<div class="row">' +
          '<span class="pill ' + (a.status === 'active' ? 'pill-ok' : 'pill-muted') + '">' + esc(a.status) + '</span>' +
          '<button class="btn small ghost" id="svcRetest">Re-test token</button>' +
          '<button class="btn small ghost" id="svcRefresh">↻ Refresh</button>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="row between">' +
          '<div>' +
            '<h2 style="margin:0">' + esc(a.alias) + ' <span class="dim" style="font-size:12px">#' + a.id + '</span></h2>' +
            '<div class="muted">' + esc(a.email) + ' · retained on VPS for ' + (a.retention_hours || 24) + ' hrs after verified upload' +
              (a.root_folder_id ? ' · root folder ' + esc(a.root_folder_id) : '') + '</div>' +
          '</div>' +
          '<div id="quotaLine">' + quotaLine(a) + '</div>' +
        '</div>' +
        '<div class="statgrid" id="statGrid">' + statCards(d) + '</div>' +
        (a.last_error ? '<div class="result bad" style="margin-top:8px">' + esc(a.last_error) + '</div>' : '') +
      '</div>' +

      // ── A: queue ────────────────────────────────────────────────────────
      '<div class="sectiontitle">📦 Local cache &amp; upload queue</div>' +
      '<div class="card">' +
        '<div class="muted" style="margin-bottom:10px">' +
          'Files land on this server first (instant 200 to the calling app), are pushed to Google Drive in the background, ' +
          'and the local copy is deleted only after a live Google check confirms it — then again after the retention window.' +
        '</div>' +
        '<div class="tablewrap"><table><thead><tr>' +
          '<th>File</th><th>App</th><th>Size</th><th>Status</th><th>Location</th><th>Received</th><th>Actions</th>' +
        '</tr></thead><tbody id="filesBody">' + fileRows(d.files || []) + '</tbody></table></div>' +
      '</div>' +

      // ── B: clients ──────────────────────────────────────────────────────
      '<div class="sectiontitle">🔑 API clients &amp; access control</div>' +
      '<div class="card">' +
        '<h3>Generate a new client API key</h3>' +
        '<form id="clientForm"><div class="grid">' +
          '<label>Client app name<span class="req">*</span><input name="name" required placeholder="EasyInvoice"></label>' +
          '<label>Access expiry<select name="ttl_days">' +
            '<option value="30">30 days</option><option value="90">90 days</option>' +
            '<option value="365">1 year</option><option value="0" selected>Lifetime</option>' +
          '</select></label>' +
          '<label>Permissions<select name="scope">' +
            '<option value="upload">Upload only</option>' +
            '<option value="read_upload" selected>Read &amp; upload</option>' +
            '<option value="full">Full access (upload, read, delete)</option>' +
          '</select></label>' +
          '<label>Rate limit (requests / minute)<input name="rate_limit" type="number" min="1" max="6000" value="60"></label>' +
        '</div>' +
        '<div class="row"><button type="submit" class="btn green">🔑 Create key &amp; folder</button></div>' +
        '<div id="newKey"></div></form>' +

        '<div class="tablewrap"><table><thead><tr>' +
          '<th>Client app</th><th>API key</th><th>Dedicated folder</th><th>Scope</th><th>Files</th><th>Expiry</th><th>Status</th><th>Actions</th>' +
        '</tr></thead><tbody id="clientsBody">' + clientRows(d.clients || []) + '</tbody></table></div>' +
      '</div>' +

      // ── C: integration ──────────────────────────────────────────────────
      '<div class="sectiontitle">🔌 Integration</div>' +
      '<div class="card">' +
        '<div class="muted">Base URL</div>' +
        '<div class="codeblock"><button class="copy" data-copy="' + esc(location.origin) + '">copy</button>' +
          esc(location.origin) + '/api/v1/gdrive</div>' +
        '<div class="muted" style="margin-top:12px">Headers every call needs</div>' +
        '<div class="codeblock"><button class="copy" data-copy="x-api-key: &lt;your key&gt;\nx-client-serial: &lt;app serial&gt;">copy</button>' +
          'x-api-key: &lt;your key&gt;\nx-client-serial: &lt;app serial&gt;</div>' +
        '<div class="muted" style="margin-top:12px">Press <b>Code</b> on a client above for ready-to-paste cURL / JavaScript / Node snippets with its serial already filled in.</div>' +
      '</div>';

    wireService();
  }

  function wireService() {
    const host = $('#service');

    const retest = $('#svcRetest', host);
    if (retest) retest.addEventListener('click', async () => {
      retest.disabled = true;
      try {
        await api('/accounts/' + S.driveId + '/test', { method: 'POST' });
        toast('Token verified', 'ok');
      } catch (e) { toast(e.message, 'bad'); }
      finally { retest.disabled = false; refreshService(false); }
    });
    const refresh = $('#svcRefresh', host);
    if (refresh) refresh.addEventListener('click', () => refreshService(false));

    const form = $('#clientForm', host);
    if (form) form.addEventListener('submit', createClient);

    // One delegated handler for the whole page: rows are re-rendered on every poll.
    if (!host.__gdDelegated) {
      host.__gdDelegated = true;
      host.addEventListener('click', onServiceAction);
    }
    $$('[data-copy]', host).forEach((b) => b.addEventListener('click', () => copyText(b.getAttribute('data-copy'))));
  }

  async function onServiceAction(ev) {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;

    const hub = t.getAttribute('data-hub');
    if (hub) { ev.preventDefault(); history.pushState({}, '', '/gdrive-service'); route(); return; }

    const retry = t.getAttribute('data-retry');
    if (retry) { ev.preventDefault(); return retryFile(retry); }

    const delFile = t.getAttribute('data-delfile');
    if (delFile) { ev.preventDefault(); return confirmModal('Delete this file?', 'This removes it from Google Drive and from this server.', 'Delete file', async () => {
      try { await api('/files/' + delFile, { method: 'DELETE' }); toast('Deleted', 'ok'); refreshService(false); }
      catch (e) { toast(e.message, 'bad'); }
    }); }

    const snippets = t.getAttribute('data-snippets');
    if (snippets) { ev.preventDefault(); return showSnippets(snippets); }

    const extend = t.getAttribute('data-extend');
    if (extend) { ev.preventDefault(); return extendClient(extend); }

    const regen = t.getAttribute('data-regen');
    if (regen) { ev.preventDefault(); return confirmModal('Regenerate API key?', 'The old key stops working immediately. Any app still using it will fail until you update it.', 'Regenerate', async () => {
      try {
        const r = await api('/clients/' + regen, { method: 'PATCH', body: JSON.stringify({ action: 'regenerate' }) });
        await refreshService(false);
        showNewKey(r.api_key, 'New API key');
      } catch (e) { toast(e.message, 'bad'); }
    }); }

    const revoke = t.getAttribute('data-revoke');
    if (revoke) { ev.preventDefault(); const c = findClient(revoke); const next = c && c.status === 'active' ? 'revoke' : 'activate';
      try {
        await api('/clients/' + revoke, { method: 'PATCH', body: JSON.stringify({ action: next }) });
        toast(next === 'revoke' ? 'Access revoked' : 'Access restored', 'ok');
        refreshService(false);
      } catch (e) { toast(e.message, 'bad'); }
      return;
    }

    const auditBtn = t.getAttribute('data-audit');
    if (auditBtn) { ev.preventDefault(); return showAudit(auditBtn); }

    const delClient = t.getAttribute('data-delclient');
    if (delClient) { ev.preventDefault(); return confirmModal('Delete this client?', 'Its key stops working and the record is removed. Files it uploaded stay on the drive.', 'Delete client', async () => {
      try { await api('/clients/' + delClient, { method: 'DELETE' }); toast('Client deleted', 'ok'); refreshService(false); }
      catch (e) { toast(e.message, 'bad'); }
    }); }
  }

  const findClient = (id) => (S.overview && S.overview.clients || []).find((c) => String(c.id) === String(id));

  async function retryFile(id) {
    try { await api('/files/' + id + '/retry', { method: 'POST' }); toast('Queued again', 'ok'); refreshService(false); }
    catch (e) { toast(e.message, 'bad'); }
  }

  async function createClient(ev) {
    ev.preventDefault();
    const f = ev.target;
    const body = {
      name: String(f.elements.name.value || '').trim(),
      ttl_days: Number(f.elements.ttl_days.value) || 0,
      scope: f.elements.scope.value,
      rate_limit: Number(f.elements.rate_limit.value) || 60
    };
    if (!body.name) { toast('Give the client app a name', 'bad'); return; }
    const btn = f.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'creating…';
    try {
      const r = await api('/accounts/' + S.driveId + '/clients', { method: 'POST', body: JSON.stringify(body) });
      f.reset();
      await refreshService(false);
      showNewKey(r.api_key, 'API key for ' + body.name);
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      btn.disabled = false; btn.textContent = '🔑 Create key & folder';
    }
  }

  function showNewKey(key, title) {
    const host = $('#newKey');
    if (!host) return;
    host.innerHTML = '<div class="keybox"><div style="font-size:12px;color:#6ee7b7;font-weight:800;margin-bottom:6px">' +
      esc(title || 'New API key') + ' — copy it now, it is never shown again</div>' +
      '<code>' + esc(key) + '</code>' +
      '<div style="margin-top:8px"><button class="btn small ghost" id="copyKey">Copy key</button></div></div>';
    const btn = $('#copyKey');
    if (btn) btn.addEventListener('click', () => copyText(key));
  }

  function extendClient(id) {
    openModal('Extend access', 'How many days from today (or from the current expiry, whichever is later)?',
      [
        { label: 'Cancel', kind: 'ghost', onClick: closeModal },
        {
          label: 'Extend', kind: 'primary', onClick: async () => {
            const days = Number($('#extendDays').value) || 30;
            try {
              await api('/clients/' + id, { method: 'PATCH', body: JSON.stringify({ action: 'extend', days }) });
              closeModal();
              toast('Extended by ' + days + ' days', 'ok');
              refreshService(false);
            } catch (e) { toast(e.message, 'bad'); }
          }
        }
      ],
      '<input id="extendDays" type="number" min="1" max="3650" value="30" style="margin-top:8px">');
  }

  async function showAudit(clientId) {
    try {
      const r = await api('/clients/' + clientId + '/audit');
      const rows = (r.audit || []).map((x) =>
        '<tr><td class="mono">' + fmtDate(x.at) + '</td><td>' + esc(x.action) + '</td>' +
        '<td style="max-width:320px">' + esc(x.detail || '') + '</td></tr>').join('');
      openModal('Audit log', '', [{ label: 'Close', kind: 'ghost', onClick: closeModal }],
        '<div class="tablewrap"><table style="min-width:520px"><thead><tr><th>When</th><th>Action</th><th>Detail</th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="3" class="muted">Nothing recorded yet.</td></tr>') + '</tbody></table></div>');
    } catch (e) { toast(e.message, 'bad'); }
  }

  function showSnippets(clientId) {
    const c = findClient(clientId);
    if (!c) return;
    const base = location.origin + '/api/v1/gdrive';
    const serial = c.serial;
    const curlUpload =
      'curl -X POST "' + base + '/file" \\\n' +
      '  -H "x-api-key: <YOUR_API_KEY>" \\\n' +
      '  -H "x-client-serial: ' + serial + '" \\\n' +
      '  -F "file=@/path/to/invoice.pdf"\n\n' +
      '# → { "ok": true, "file_uuid": "…" }  (returns in milliseconds)';
    const curlDownload =
      'curl -L "' + base + '/file/<FILE_UUID>" \\\n' +
      '  -H "x-api-key: <YOUR_API_KEY>" \\\n' +
      '  -H "x-client-serial: ' + serial + '" \\\n' +
      '  -o downloaded.pdf\n\n' +
      '# header X-GDrive-Source tells you: vps-cache or google-drive';
    const jsUpload =
      "const fd = new FormData();\n" +
      "fd.append('file', fileInput.files[0]);\n" +
      "const res = await fetch('" + base + "/file', {\n" +
      "  method: 'POST',\n" +
      "  headers: { 'x-api-key': '<YOUR_API_KEY>', 'x-client-serial': '" + serial + "' },\n" +
      "  body: fd\n" +
      "});\n" +
      "const { file_uuid } = await res.json();";
    const nodeUpload =
      "import fs from 'fs';\n" +
      "const fd = new FormData();\n" +
      "fd.append('file', new Blob([fs.readFileSync('./invoice.pdf')]), 'invoice.pdf');\n" +
      "const res = await fetch('" + base + "/file', {\n" +
      "  method: 'POST',\n" +
      "  headers: { 'x-api-key': '<YOUR_API_KEY>', 'x-client-serial': '" + serial + "' },\n" +
      "  body: fd\n" +
      "});\n" +
      "const { file_uuid } = await res.json();";

    const box = (title, code) =>
      '<div style="margin-top:10px"><div class="muted" style="font-weight:800;color:#7dd3fc">' + title + '</div>' +
      '<div class="codeblock"><button class="copy" data-copy="' + esc(code) + '">copy</button>' + esc(code) + '</div></div>';

    openModal('Integration snippets — ' + c.name,
      '<div class="muted">Serial: <span class="mono">' + esc(serial) + '</span> · scope: ' + esc(c.scope_label) + '</div>',
      [{ label: 'Close', kind: 'ghost', onClick: closeModal }],
      box('cURL — upload', curlUpload) + box('cURL — download', curlDownload) +
      box('JavaScript (browser) — upload', jsUpload) + box('Node.js — upload', nodeUpload));

    $$('[data-copy]', $('#modal')).forEach((b) => b.addEventListener('click', () => copyText(b.getAttribute('data-copy'))));
  }

  // ── boot ─────────────────────────────────────────────────────────────────
  function boot() {
    $('#addForm').addEventListener('submit', saveAccount);
    $('#testBtn').addEventListener('click', testConnection);
    $('#refreshList').addEventListener('click', loadAccounts);
    $('#search').addEventListener('input', (ev) => { S.search = ev.target.value; renderAccounts(); });
    $$('#hubTabs .tab').forEach((t) => t.addEventListener('click', () => switchTab(t.getAttribute('data-tab'))));
    $$('.eye').forEach((b) => b.addEventListener('click', () => {
      const input = $('input[name="' + b.getAttribute('data-eye') + '"]');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.textContent = show ? 'hide' : 'show';
    }));
    $('#backLink').addEventListener('click', (ev) => {
      if (!S.driveId) return;              // already on the hub
      ev.preventDefault();
      history.pushState({}, '', '/gdrive-service');
      route();
    });
    $('#modal').addEventListener('click', (ev) => { if (ev.target === $('#modal')) closeModal(); });
    const modalClose = $('#modalClose');
    if (modalClose) modalClose.addEventListener('click', closeModal);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !$('#modal').hidden) closeModal();
    });
    window.addEventListener('popstate', route);
    window.addEventListener('beforeunload', stopPoll);

    route();
    setInterval(() => { if (!S.driveId) loadAccounts(); }, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
