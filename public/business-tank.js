/* 🧠 Business Data Tank — owner enters business facts + uploads files; AI staff linked to the tank use them.
   Plain script for academy.html (uses its globals: $, esc, api, toast, S). */
(function () {
  const B = { d: null, pane: 'company', draft: {}, dirty: {}, busy: false, view: null };
  const inp = 'width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box;';
  const btn = (cls, js, label, extra) => '<button class="btn ' + cls + ' btn-sm" onclick="' + js + '" ' + (extra || '') + '>' + label + '</button>';
  const ago = (t) => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const sec = (id) => (B.d.sections || []).find(s => s.id === id);
  const isTable = (s) => s && s.kind === 'table';

  function seedDraft() {
    B.draft = {}; B.dirty = {};
    for (const s of B.d.sections) {
      const v = B.d.data[s.id];
      B.draft[s.id] = isTable(s) ? (Array.isArray(v) ? v.map(r => ({ ...r })) : []) : { ...(v || {}) };
    }
  }

  async function load(fresh) {
    try {
      B.d = await api('/api/business' + (fresh ? '?fresh=1' : ''));
      if (!B.draft || !Object.keys(B.draft).length || fresh) seedDraft();
      render();
    } catch (e) {
      $('cards').innerHTML = '<div class="x" style="grid-column:1/-1;">❌ ' + esc(e.message) + '</div>';
    }
  }

  function render() {
    const d = B.d, box = $('cards');
    if (!d) return;
    const cp = d.completeness || { per: {}, overall: 0 };
    const stale = d.digest && d.updatedAt > (d.digest.at || 0);
    const pills = d.sections.map(s => {
      const p = cp.per[s.id] || 0, on = B.pane === s.id;
      return '<button class="tab ' + (on ? 'active' : '') + '" onclick="BT.pane(\'' + s.id + '\')" style="' + (on ? 'background:#0d9488;border-color:#0d9488;color:#fff;' : '') + '">' +
        s.icon + ' ' + esc(s.title) + ' <span style="opacity:.75;font-size:10px;">' + (B.dirty[s.id] ? '●' : p + '%') + '</span></button>';
    }).join('') +
      '<button class="tab ' + (B.pane === 'files' ? 'active' : '') + '" onclick="BT.pane(\'files\')" style="border-color:#0ea5e9;' + (B.pane === 'files' ? 'background:#0ea5e9;color:#fff;' : '') + '">📎 Files (' + d.files.length + ')</button>' +
      '<button class="tab ' + (B.pane === 'digest' ? 'active' : '') + '" onclick="BT.pane(\'digest\')" style="border-color:#7c3aed;' + (B.pane === 'digest' ? 'background:#7c3aed;color:#fff;' : '') + '">✨ AI summary' + (stale ? ' ⚠️' : '') + '</button>' +
      '<button class="tab ' + (B.pane === 'staff' ? 'active' : '') + '" onclick="BT.pane(\'staff\')" style="border-color:#f59e0b;' + (B.pane === 'staff' ? 'background:#f59e0b;color:#fff;' : '') + '">👥 Linked staff (' + d.staff.filter(x => x.linked).length + ')</button>';

    box.innerHTML =
      '<div style="grid-column:1/-1;background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px;">' +
      '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
      '<div style="flex:1;min-width:240px;"><div style="font-size:16px;font-weight:800;">🧠 Business Data Tank</div>' +
      '<div style="font-size:12px;color:#64748b;margin-top:2px;">Fill in everything about the business and upload files. Staff linked to the tank learn it and answer from real facts.</div>' +
      '<div class="bar" style="height:8px;margin-top:8px;"><div style="width:' + cp.overall + '%;background:linear-gradient(90deg,#0d9488,#14b8a6);"></div></div>' +
      '<div style="font-size:11px;color:#475569;margin-top:3px;">' + cp.overall + '% filled · last change ' + ago(d.updatedAt) + ' · AI summary ' + (d.digest ? ago(d.digest.at) : 'not built yet') + '</div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
      btn('btn-primary', 'BT.digest()', B.busy ? '⏳ Working…' : '🔄 Build AI summary &amp; lists', B.busy ? 'disabled' : '') +
      btn('btn-ghost', 'BT.preview()', '👁 What staff see') +
      btn('btn-ghost', 'BT.reload()', '↻ Reload') + '</div></div>' +
      (stale ? '<div style="margin-top:10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:10px;padding:8px 10px;font-size:12px;">⚠️ You changed the data after the last AI summary. Press <b>Build AI summary &amp; lists</b> to refresh it.</div>' : '') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;">' + pills + '</div></div>' +
      '<div id="btBody" style="grid-column:1/-1;background:#fff;border:1px solid var(--border);border-radius:14px;padding:16px;min-height:300px;"></div>';
    renderBody();
  }

  function renderBody() {
    const el = $('btBody'); if (!el) return;
    if (B.pane === 'files') return filesPane(el);
    if (B.pane === 'digest') return digestPane(el);
    if (B.pane === 'staff') return staffPane(el);
    const s = sec(B.pane); if (!s) return;
    el.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">' +
      '<div><div style="font-size:15px;font-weight:800;">' + s.icon + ' ' + esc(s.title) + '</div><div style="font-size:12px;color:#64748b;">' + esc(s.hint || '') + '</div></div>' +
      '<div>' + btn('btn-primary', 'BT.save(\'' + s.id + '\')', '💾 Save ' + esc(s.title)) + '</div></div>' +
      (isTable(s) ? tableForm(s) : fieldForm(s));
  }

  function fieldForm(s) {
    const v = B.draft[s.id] || {};
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">' + s.fields.map(f => {
      const val = v[f.k] == null ? '' : v[f.k];
      let ctl;
      if (f.type === 'area') ctl = '<textarea rows="4" placeholder="' + esc(f.ph) + '" oninput="BT.f(\'' + f.k + '\',this.value)" style="' + inp + 'resize:vertical;min-height:90px;">' + esc(val) + '</textarea>';
      else if (f.type === 'select') ctl = '<select onchange="BT.f(\'' + f.k + '\',this.value)" style="' + inp + '">' + f.opts.map(o => '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc(o || '— select —') + '</option>').join('') + '</select>';
      else ctl = '<input type="text" value="' + esc(val) + '" placeholder="' + esc(f.ph) + '" oninput="BT.f(\'' + f.k + '\',this.value)" style="' + inp + '">';
      return '<label style="display:block;' + (f.type === 'area' ? 'grid-column:1/-1;' : '') + '"><span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:3px;">' + esc(f.label) + '</span>' + ctl + '</label>';
    }).join('') + '</div>';
  }

  function tableForm(s) {
    const rows = B.draft[s.id] || [];
    const head = s.cols.map(c => '<th style="text-align:left;font-size:11px;color:#475569;padding:4px 6px;min-width:' + (c.w || 100) + 'px;">' + esc(c.label) + '</th>').join('');
    const body = rows.map((r, i) => '<tr>' + s.cols.map(c =>
      '<td style="padding:3px;"><input type="text" value="' + esc(r[c.k] || '') + '" oninput="BT.c(' + i + ',\'' + c.k + '\',this.value)" style="' + inp + 'padding:5px 7px;font-size:12px;"></td>').join('') +
      '<td style="padding:3px;"><button class="btn btn-ghost btn-sm" title="Delete row" onclick="BT.delRow(' + i + ')">🗑</button></td></tr>').join('');
    return '<div style="overflow:auto;max-height:62vh;border:1px solid var(--border);border-radius:10px;"><table style="border-collapse:collapse;width:100%;"><thead style="position:sticky;top:0;background:#f8fafc;"><tr>' + head + '<th></th></tr></thead><tbody>' +
      (body || '<tr><td colspan="' + (s.cols.length + 1) + '" style="padding:16px;text-align:center;color:#94a3b8;font-size:12px;">No rows yet — add one or paste from Excel.</td></tr>') + '</tbody></table></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">' + btn('btn-ghost', 'BT.addRow()', '＋ Add row') + btn('btn-ghost', 'BT.togglePaste()', '📋 Paste from Excel') +
      '<span style="font-size:11px;color:#94a3b8;align-self:center;">' + rows.length + ' / ' + (s.max || 300) + ' rows</span></div>' +
      '<div id="btPaste" class="hidden" style="margin-top:10px;"><div style="font-size:11px;color:#64748b;margin-bottom:4px;">Copy cells from Excel / Google Sheets (columns in this order: ' + esc(s.cols.map(c => c.label).join(' · ')) + ') and paste here:</div>' +
      '<textarea id="btPasteTa" rows="6" style="' + inp + 'font-family:monospace;font-size:12px;"></textarea><div style="margin-top:6px;">' + btn('btn-primary', 'BT.importPaste()', 'Import rows') + '</div></div>';
  }

  function filesPane(el) {
    const fl = B.d.files || [];
    el.innerHTML = '<div style="font-size:15px;font-weight:800;">📎 Files</div>' +
      '<div style="font-size:12px;color:#64748b;margin:2px 0 10px;">Upload price lists, catalogues, brochures, specs, certificates, contracts. Supported: PDF, Excel (.xlsx), Word (.docx), PowerPoint (.pptx), CSV, TXT, images. Max 12 MB each. The text is read and summarised for your staff.</div>' +
      '<label id="btDrop" style="display:block;border:2px dashed #99f6e4;background:#f0fdfa;border-radius:12px;padding:22px;text-align:center;cursor:pointer;font-size:13px;color:#0f766e;font-weight:700;" ' +
      'ondragover="event.preventDefault()" ondrop="event.preventDefault();BT.upload(event.dataTransfer.files)">📤 Click to choose files, or drop them here' +
      '<input type="file" multiple style="display:none;" onchange="BT.upload(this.files);this.value=\'\'"></label><div id="btUp" style="font-size:12px;color:#64748b;margin:8px 0;"></div>' +
      (fl.length ? fl.map(f =>
        '<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px;">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;"><b style="font-size:13px;">📄 ' + esc(f.name) + '</b>' +
        '<span style="font-size:11px;color:#94a3b8;">' + Math.round((f.size || 0) / 1024) + ' KB · ' + (f.chars || 0) + ' chars' + (f.truncated ? ' (trimmed)' : '') + ' · ' + ago(f.addedAt) + '</span></div>' +
        '<div style="font-size:12px;color:#334155;margin-top:4px;white-space:pre-wrap;">' + esc(f.summary || '') + '</div>' +
        '<div style="margin-top:6px;display:flex;gap:6px;">' + btn('btn-ghost', 'BT.viewFile(\'' + f.id + '\')', '👁 View text') + btn('btn-ghost', 'BT.delFile(\'' + f.id + '\')', '🗑 Delete') + '</div>' +
        '<pre id="btF_' + f.id + '" class="hidden" style="margin-top:8px;max-height:260px;overflow:auto;background:#f8fafc;border-radius:8px;padding:8px;font-size:11px;white-space:pre-wrap;"></pre></div>').join('')
        : '<div class="x">No files yet.</div>');
  }

  function digestPane(el) {
    const g = B.d.digest;
    if (!g) { el.innerHTML = '<div style="font-size:15px;font-weight:800;">✨ AI summary</div><div class="x">Not built yet. Fill in some sections / upload files, then press <b>Build AI summary &amp; lists</b>.</div>'; return; }
    const list = (t, arr) => (arr && arr.length) ? '<div style="margin-top:12px;"><b style="font-size:12px;">' + t + '</b><ul style="margin:4px 0 0 18px;padding:0;font-size:12.5px;line-height:1.55;">' + arr.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '';
    el.innerHTML = '<div style="font-size:15px;font-weight:800;">✨ AI summary <span style="font-size:11px;color:#94a3b8;font-weight:400;">built ' + ago(g.at) + '</span></div>' +
      '<div style="margin-top:8px;font-size:13px;line-height:1.55;background:#faf5ff;border-radius:10px;padding:10px;">' + esc(g.summary || '') + '</div>' +
      list('📦 Product list', g.productList) + list('🧱 Raw material list', g.rawMaterialList) + list('📌 Key facts staff must remember', g.keyFacts) + list('💰 Pricing rules', g.pricingRules) +
      ((g.faqs && g.faqs.length) ? '<div style="margin-top:12px;"><b style="font-size:12px;">❓ FAQs</b>' + g.faqs.map(q => '<div style="font-size:12.5px;margin-top:4px;"><b>' + esc(q.q) + '</b><br>' + esc(q.a) + '</div>').join('') + '</div>' : '') +
      ((g.gaps && g.gaps.length) ? '<div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:8px 10px;"><b style="font-size:12px;color:#92400e;">⚠️ Still missing — please add:</b><ul style="margin:4px 0 0 18px;padding:0;font-size:12.5px;">' + g.gaps.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '');
  }

  function staffPane(el) {
    el.innerHTML = '<div style="font-size:15px;font-weight:800;">👥 Linked staff</div>' +
      '<div style="font-size:12px;color:#64748b;margin:2px 0 10px;">Tick the staff who should know your business — normally Business Communicator Pro and the sales / purchase staff. Un-ticked staff never see this data. (You can also tick it inside each staff office → Profile.)</div>' +
      (B.d.staff.length ? B.d.staff.map(a =>
        '<label style="display:flex;gap:10px;align-items:center;border:1px solid var(--border);border-radius:10px;padding:9px 12px;margin-bottom:6px;cursor:pointer;">' +
        '<input type="checkbox" ' + (a.linked ? 'checked' : '') + ' onchange="BT.link(\'' + esc(a.id) + '\',this)"><span style="font-size:20px;">' + esc(a.emoji || '🧑‍💼') + '</span>' +
        '<span><b style="font-size:13px;">' + esc(a.name) + '</b><br><span style="font-size:11px;color:#64748b;">' + esc(a.role || '') + '</span></span></label>').join('')
        : '<div class="x">No staff yet.</div>');
  }

  // ------------------------------------------------------------------ actions
  const BT = window.BT = {
    pane(p) { B.pane = p; render(); },
    reload() { B.draft = {}; load(true); },
    f(k, v) { B.draft[B.pane][k] = v; markDirty(); },
    c(i, k, v) { B.draft[B.pane][i][k] = v; markDirty(); },
    addRow() {
      const s = sec(B.pane), rows = B.draft[B.pane];
      if (rows.length >= (s.max || 300)) return toast('Row limit reached');
      rows.push({}); markDirty(true); renderBody();
    },
    delRow(i) { B.draft[B.pane].splice(i, 1); markDirty(true); renderBody(); },
    togglePaste() { const e = $('btPaste'); if (e) e.classList.toggle('hidden'); },
    importPaste() {
      const s = sec(B.pane), ta = $('btPasteTa'); if (!ta || !ta.value.trim()) return;
      const lines = ta.value.replace(/\r/g, '').split('\n').filter(l => l.trim());
      const first = lines[0].split('\t').map(x => x.trim().toLowerCase());
      const isHead = s.cols.filter((c, i) => first[i] && (first[i] === c.label.toLowerCase() || first[i] === c.k)).length >= 2;
      const rows = B.draft[B.pane]; let n = 0;
      for (const l of (isHead ? lines.slice(1) : lines)) {
        if (rows.length >= (s.max || 300)) break;
        const cells = l.split('\t'), r = {};
        s.cols.forEach((c, i) => { if (cells[i] != null && cells[i].trim()) r[c.k] = cells[i].trim(); });
        if (Object.keys(r).length) { rows.push(r); n++; }
      }
      markDirty(true); renderBody(); toast('📋 Imported ' + n + ' rows — press Save');
    },
    async save(id) {
      try {
        const r = await api('/api/business/section/' + id, { method: 'PUT', body: JSON.stringify({ value: B.draft[id] }) });
        B.d.data[id] = isTable(sec(id)) ? B.draft[id].map(x => ({ ...x })) : { ...B.draft[id] };
        B.d.updatedAt = r.updatedAt || Date.now();
        if (r.completeness) B.d.completeness = r.completeness;
        const s = sec(id);
        B.draft[id] = isTable(s) ? (B.d.data[id] || []).map(x => ({ ...x })) : { ...(B.d.data[id] || {}) };
        B.dirty[id] = false; render(); toast('✅ Saved — remember to rebuild the AI summary');
      } catch (e) { toast('❌ ' + e.message); }
    },
    async upload(files) {
      const list = Array.from(files || []); const st = $('btUp');
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (st) st.textContent = '⏳ Reading ' + f.name + ' (' + (i + 1) + '/' + list.length + ') — PDFs and images can take up to a minute…';
        try {
          if (f.size > 12 * 1024 * 1024) throw new Error('larger than 12 MB');
          const b64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(new Error('could not read file')); r.readAsDataURL(f); });
          const r = await api('/api/business/file', { method: 'POST', body: JSON.stringify({ name: f.name, mime: f.type, dataBase64: b64 }) });
          B.d.files.unshift(r.file);
          toast('✅ ' + f.name + ' added');
        } catch (e) { toast('❌ ' + f.name + ': ' + e.message); }
      }
      render();
    },
    async viewFile(id) {
      const el = $('btF_' + id); if (!el) return;
      if (!el.classList.contains('hidden')) return el.classList.add('hidden');
      el.textContent = 'Loading…'; el.classList.remove('hidden');
      try { const r = await api('/api/business/file/' + encodeURIComponent(id)); el.textContent = r.text || '(empty)'; } catch (e) { el.textContent = '❌ ' + e.message; }
    },
    async delFile(id) {
      if (!confirm('Delete this file from the Business Data Tank?')) return;
      try { await api('/api/business/file/' + encodeURIComponent(id), { method: 'DELETE' }); B.d.files = B.d.files.filter(f => f.id !== id); render(); toast('🗑 Deleted'); } catch (e) { toast('❌ ' + e.message); }
    },
    async digest() {
      const unsaved = Object.keys(B.dirty).filter(k => B.dirty[k]);
      if (unsaved.length && !confirm('You have unsaved changes (' + unsaved.length + ' section/s) that will NOT be included. Build anyway?')) return;
      B.busy = true; render();
      try { const r = await api('/api/business/digest', { method: 'POST', body: '{}' }); B.d.digest = r.digest; B.pane = 'digest'; toast('✨ AI summary & lists are ready'); }
      catch (e) { toast('❌ ' + e.message); }
      B.busy = false; render();
    },
    async preview() {
      try {
        const r = await api('/api/business/preview');
        const w = document.createElement('div');
        w.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
        w.onclick = (e) => { if (e.target === w) w.remove(); };
        w.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:820px;width:100%;max-height:85vh;display:flex;flex-direction:column;"><div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;"><b>👁 Exactly what linked staff receive</b><button class="btn btn-ghost btn-sm" onclick="this.closest(\'div[style*=fixed]\').remove()">✕</button></div><pre style="margin:0;padding:14px;overflow:auto;white-space:pre-wrap;font-size:12px;">' + esc(r.text || '(nothing yet)') + '</pre></div>';
        document.body.appendChild(w);
      } catch (e) { toast('❌ ' + e.message); }
    },
    async link(id, el) {
      const on = el.checked;
      try {
        await api('/api/business/link', { method: 'POST', body: JSON.stringify({ agentId: id, on }) });
        const a = B.d.staff.find(x => x.id === id); if (a) a.linked = on;
        const ag = (window.S && S.agents || []).find(x => x.id === id); if (ag) ag.useBusinessTank = on;
        toast(on ? '🧠 Linked' : 'Unlinked'); render();
      } catch (e) { el.checked = !on; toast('❌ ' + e.message); }
    }
  };

  function markDirty(rerender) {
    if (!B.dirty[B.pane]) { B.dirty[B.pane] = true; }
    if (rerender) render();
  }

  window.renderBusinessTank = function () {
    $('cards').innerHTML = '<div class="x" style="grid-column:1/-1;">Loading Business Data Tank…</div>';
    load(false);
  };
})();
