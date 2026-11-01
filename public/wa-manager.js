/* 🎚️ Manage all contacts & groups — AI status, handler and data deletion per WhatsApp chat.
   Full-screen overlay opened by window.openWaManager() from the WhatsApp page toolbar. */
(function () {
  const S = { rows: [], agents: [], defaultMode: 'smart', defaultAgentId: '', q: '', kind: 'all', st: 'all', sel: new Set(), sort: 'recent', busy: false };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STATUS = { active: ['🟢 Active', '#16a34a'], paused: ['⏸️ Paused', '#d97706'], off: ['⛔ Full off', '#dc2626'] };
  let root = null;

  async function api(url, body) {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
    return d;
  }

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'waManagerOverlay';
    root.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#0b141a;color:#e9edef;display:none;flex-direction:column;font-family:inherit;';
    document.body.appendChild(root);
    return root;
  }

  function visible() {
    const q = S.q.trim().toLowerCase();
    let rows = S.rows.filter(r => {
      if (S.kind === 'groups' && !r.isGroup) return false;
      if (S.kind === 'contacts' && r.isGroup) return false;
      if (S.st !== 'all' && r.status !== S.st) return false;
      if (!q) return true;
      return (r.name || '').toLowerCase().includes(q) || (r.phone || '').includes(q.replace(/\D/g, '') || '\u0000');
    });
    if (S.sort === 'name') rows = rows.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (S.sort === 'msgs') rows = rows.slice().sort((a, b) => (b.total || 0) - (a.total || 0));
    return rows;
  }

  function render() {
    const el = ensureRoot();
    const rows = visible();
    const cnt = { active: 0, paused: 0, off: 0 };
    S.rows.forEach(r => { cnt[r.status] = (cnt[r.status] || 0) + 1; });
    const allSel = rows.length && rows.every(r => S.sel.has(r.id));
    const inp = 'background:#202c33;border:1px solid #2a3942;color:#e9edef;border-radius:8px;padding:7px 10px;font-size:13px;';
    const b = (bg, label, js, extra) => '<button onclick="' + js + '" style="background:' + bg + ';border:none;color:#fff;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;' + (extra || '') + '">' + label + '</button>';

    const head =
      '<div style="padding:12px 18px;border-bottom:1px solid #2a3942;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#111b21;">' +
      '<div style="flex:1;min-width:260px;"><div style="font-size:18px;font-weight:800;">🎚️ Manage all contacts &amp; groups</div>' +
      '<div style="font-size:12px;color:#8696a0;margin-top:2px;">Paused / Full-off chats are shown as plain WhatsApp: no AI replies, no voice-note transcription, no translation, no analysis. ' +
      S.rows.length + ' chats · 🟢 ' + cnt.active + ' · ⏸️ ' + cnt.paused + ' · ⛔ ' + cnt.off + '</div></div>' +
      '<label style="font-size:12px;color:#8696a0;">Saved contacts &amp; groups by default: ' +
      '<select onchange="WAM.defMode(this.value)" style="' + inp + '"><option value="smart"' + (S.defaultMode === 'smart' ? ' selected' : '') + '>AI OFF (only new unsaved numbers get AI)</option>' +
      '<option value="all_active"' + (S.defaultMode === 'all_active' ? ' selected' : '') + '>AI active for everyone</option></select></label>' +
      b('#2a3942', '🔄 Refresh', 'WAM.load(true)') + b('#00a884', '✕ Close', 'WAM.close()') + '</div>';

    const tools =
      '<div style="padding:10px 18px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:#0f1a20;border-bottom:1px solid #2a3942;">' +
      '<input id="wamSearch" value="' + esc(S.q) + '" oninput="WAM.search(this.value)" placeholder="Search name or number…" style="' + inp + 'min-width:220px;">' +
      '<select onchange="WAM.set(\'kind\',this.value)" style="' + inp + '">' + [['all', 'Contacts + groups'], ['contacts', 'Contacts only'], ['groups', 'Groups only']].map(o => '<option value="' + o[0] + '"' + (S.kind === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<select onchange="WAM.set(\'st\',this.value)" style="' + inp + '">' + [['all', 'Any status'], ['active', 'Active'], ['paused', 'Paused'], ['off', 'Full off']].map(o => '<option value="' + o[0] + '"' + (S.st === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<select onchange="WAM.set(\'sort\',this.value)" style="' + inp + '">' + [['recent', 'Recent first'], ['name', 'Name A-Z'], ['msgs', 'Most messages']].map(o => '<option value="' + o[0] + '"' + (S.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<span style="flex:1"></span>' +
      '<span style="font-size:12px;color:#8696a0;">' + S.sel.size + ' selected:</span>' +
      b('#16a34a', 'Active', 'WAM.bulk(\'active\')') + b('#d97706', 'Pause', 'WAM.bulk(\'paused\')') + b('#dc2626', 'Full off', 'WAM.bulk(\'off\')') +
      '<select id="wamBulkAgent" style="' + inp + '"><option value="">Handled by…</option>' + S.agents.map(a => '<option value="' + esc(a.id) + '">' + esc(a.name) + (a.id === S.defaultAgentId ? ' (default)' : '') + '</option>').join('') + '</select>' +
      b('#7c3aed', 'Apply', 'WAM.bulkAgent()') + '</div>';

    const th = 'text-align:left;padding:9px 10px;font-size:11px;color:#8696a0;text-transform:uppercase;position:sticky;top:0;background:#111b21;z-index:1;white-space:nowrap;';
    const td = 'padding:8px 10px;border-bottom:1px solid #1d2a31;font-size:13px;vertical-align:middle;';
    const body = rows.map(r => {
      const st = STATUS[r.status] || STATUS.active;
      const sid = esc(r.id).replace(/'/g, '&#39;');
      const agentOpts = S.agents.map(a => '<option value="' + esc(a.id) + '"' + (a.id === r.handledBy ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') +
        (S.agents.some(a => a.id === r.handledBy) ? '' : '<option value="' + esc(r.handledBy) + '" selected>' + esc(r.handledByName) + '</option>');
      const delBtn = (what, label) => '<button onclick="WAM.del(\'' + sid + '\',\'' + what + '\')" style="background:#3b1818;border:1px solid #e74c3c;color:#ff8585;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;margin-right:4px;white-space:nowrap;">' + label + '</button>';
      return '<tr style="' + (S.sel.has(r.id) ? 'background:#1a2b33;' : '') + '">' +
        '<td style="' + td + '"><input type="checkbox" ' + (S.sel.has(r.id) ? 'checked' : '') + ' onchange="WAM.pick(\'' + sid + '\',this.checked)"></td>' +
        '<td style="' + td + 'max-width:260px;"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (r.isGroup ? '👥 ' : '') + esc(r.name || 'Unknown') + '</div>' +
        (r.source === 'boss' ? '<div style="font-size:10px;color:#00a884;">boss / self - always active</div>' : r.source === 'default' ? '<div style="font-size:10px;color:#8696a0;">default policy</div>' : '') + '</td>' +
        '<td style="' + td + 'color:#8696a0;white-space:nowrap;">' + (r.phone ? '+' + esc(r.phone) : (r.isGroup ? 'group' : '—')) + '</td>' +
        '<td style="' + td + '"><select onchange="WAM.one(\'' + sid + '\',this.value)" style="background:#202c33;border:1px solid ' + st[1] + ';color:' + st[1] + ';border-radius:6px;padding:4px 6px;font-size:12px;font-weight:700;">' +
        Object.keys(STATUS).map(k => '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + '>' + STATUS[k][0] + '</option>').join('') + '</select></td>' +
        '<td style="' + td + '"><select onchange="WAM.agent(\'' + sid + '\',this.value)" style="background:#202c33;border:1px solid #2a3942;color:#e9edef;border-radius:6px;padding:4px 6px;font-size:12px;max-width:170px;">' + agentOpts + '</select></td>' +
        '<td style="' + td + 'text-align:right;">' + (r.total || 0) + '</td>' +
        '<td style="' + td + 'white-space:nowrap;">' + delBtn('all', '🗑 All data') + delBtn('media', '🖼 Media only') + delBtn('text', '💬 Text only') + '</td></tr>';
    }).join('');

    el.innerHTML = head + tools +
      '<div style="flex:1;overflow:auto;"><table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr><th style="' + th + 'width:30px;"><input type="checkbox" ' + (allSel ? 'checked' : '') + ' onchange="WAM.pickAll(this.checked)"></th>' +
      '<th style="' + th + '">Name</th><th style="' + th + '">Number</th><th style="' + th + '">Status</th><th style="' + th + '">Handled by</th><th style="' + th + 'text-align:right;">Total msgs</th><th style="' + th + '">Delete data</th></tr></thead>' +
      '<tbody>' + (body || '<tr><td colspan="7" style="padding:40px;text-align:center;color:#8696a0;">No chats match.</td></tr>') + '</tbody></table></div>' +
      '<div style="padding:8px 18px;border-top:1px solid #2a3942;font-size:11px;color:#8696a0;background:#111b21;">Deleting removes the chat history from this app and the linked WhatsApp account (best effort). Messages other people sent stay on their own phones. This cannot be undone.</div>';
    const s = document.getElementById('wamSearch');
    if (s && S.focusSearch) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }

  async function load(fresh) {
    try {
      const d = await api('/api/wa-web/manager' + (fresh ? '?fresh=1' : ''));
      S.rows = d.rows || []; S.agents = d.agents || []; S.defaultMode = d.defaultMode || 'smart'; S.defaultAgentId = d.defaultAgentId || '';
      render();
    } catch (e) { alert('Could not load contacts: ' + e.message); }
  }

  function patchLocal(jids, status) {
    const set = new Set(jids);
    S.rows.forEach(r => { if (set.has(r.id)) { r.status = status; r.source = 'explicit'; } });
    if (Array.isArray(window.waWebCachedChats)) window.waWebCachedChats.forEach(c => { if (set.has(c.id)) c.aiStatus = status; });
    try { if (typeof window.renderWaWebChatList === 'function' && Array.isArray(window.waWebCachedChats)) window.renderWaWebChatList(window.waWebCachedChats); } catch (e) { /* ignore */ }
    try { if (window.waWebCurrentJid && typeof window.updateWaWebChatAiPauseButton === 'function') window.updateWaWebChatAiPauseButton(window.waWebCurrentJid); } catch (e) { /* ignore */ }
  }

  const WAM = window.WAM = {
    async open() { ensureRoot().style.display = 'flex'; S.sel.clear(); root.innerHTML = '<div style="margin:auto;color:#8696a0;">Loading contacts…</div>'; await load(false); },
    close() { if (root) root.style.display = 'none'; },
    load,
    set(k, v) { S[k] = v; S.focusSearch = false; render(); },
    search(v) { S.q = v; S.focusSearch = true; render(); },
    pick(id, on) { on ? S.sel.add(id) : S.sel.delete(id); S.focusSearch = false; render(); },
    pickAll(on) { visible().forEach(r => on ? S.sel.add(r.id) : S.sel.delete(r.id)); S.focusSearch = false; render(); },
    async one(id, status) {
      try { await api('/api/wa-web/manager/status', { jids: [id], status }); patchLocal([id], status); S.focusSearch = false; render(); }
      catch (e) { alert(e.message); load(); }
    },
    async bulk(status) {
      if (!S.sel.size) return alert('Select contacts first (tick the boxes).');
      const ids = [...S.sel];
      try { await api('/api/wa-web/manager/status', { jids: ids, status }); patchLocal(ids, status); S.focusSearch = false; render(); }
      catch (e) { alert(e.message); }
    },
    async agent(id, agentId) {
      try { await api('/api/wa-web/manager/handled-by', { jids: [id], agentId }); await load(true); }
      catch (e) { alert(e.message); load(); }
    },
    async bulkAgent() {
      const agentId = (document.getElementById('wamBulkAgent') || {}).value;
      if (!S.sel.size || !agentId) return alert('Select contacts and choose an agent.');
      try { const r = await api('/api/wa-web/manager/handled-by', { jids: [...S.sel], agentId }); await load(true); alert('Updated ' + r.updated + ' chats.'); }
      catch (e) { alert(e.message); }
    },
    async defMode(mode) {
      if (mode === 'all_active' && !confirm('Switch AI ON for all saved contacts and groups that have no explicit setting? The AI will start replying to them.')) { render(); return; }
      try { await api('/api/wa-web/manager/default', { mode }); await load(true); } catch (e) { alert(e.message); }
    },
    async del(id, what) {
      const row = S.rows.find(r => r.id === id) || {};
      const label = { all: 'ALL data (messages and media)', media: 'ALL MEDIA (photos, videos, voice notes, documents)', text: 'only the TEXT messages' }[what];
      const word = what === 'all' ? 'DELETE' : what === 'media' ? 'MEDIA' : 'TEXT';
      const typed = prompt('Permanently delete ' + label + ' of "' + (row.name || id) + '"?\nThis cannot be undone.\n\nType ' + word + ' to confirm:');
      if (typed == null) return;
      if (typed.trim().toUpperCase() !== word) return alert('Not confirmed - nothing was deleted.');
      try {
        const r = await api('/api/wa-web/manager/delete', { jid: id, what });
        alert('Done. Removed ' + (r.removed === 'all' ? 'all' : r.removed != null ? r.removed : '') + ' message(s) from the archive' + (r.onPhone ? ' (' + r.onPhone + ' also deleted on the linked WhatsApp)' : '') + '.');
        await load(true);
      } catch (e) { alert('Delete failed: ' + e.message); }
    }
  };
  window.openWaManager = WAM.open;
})();
