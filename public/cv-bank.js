/* 📄 Ready-to-Insert CV bank for the AI Staff Academy.
   Saved CVs live on the server (/api/agents/cvs). They fill the "Hire New Staff" form in one click. */
(function () {
  const $ = (id) => document.getElementById(id);
  let cvSearch = '';

  window.loadCvs = async function (fresh) {
    const d = await api('/api/agents/cvs' + (fresh ? '?fresh=1' : ''));
    S.cvs = d.cvs || [];
    return S.cvs;
  };

  const findCv = (id) => (S.cvs || []).find(c => c.id === id);

  // ---------- picker inside the hire form ----------
  window.refreshCvPicker = async function () {
    const sel = $('hCvPick');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Blank form (no CV) —</option>';
    try { if (!S.cvs) await window.loadCvs(); } catch (e) { /* picker stays empty */ }
    sel.innerHTML = '<option value="">— Blank form (no CV) —</option>' + (S.cvs || []).map(c =>
      '<option value="' + esc(c.id) + '">' + esc((c.emoji || '🧑‍💼') + ' ' + (c.title || c.name)) + (c.isDefaultAgent ? ' ★' : '') + '</option>').join('');
    sel.value = S.cvPickId || '';
  };

  window.cvPicked = function (id) {
    S.cvPickId = id || '';
    if (!id) return;
    const cv = findCv(id);
    if (!cv) { toast('❌ CV not found — refresh the list'); return; }
    fillHireForm(cv);
    $('hCvNote').textContent = '✅ Filled from CV "' + (cv.title || cv.name) + '". Change the name if this is a new person, then press Hire.';
  };

  // ---------- save the form into the bank ----------
  window.saveFormAsCv = async function () {
    const p = hirePayload();
    if (!p.name) { toast('❌ Name is required'); return; }
    p.title = p.name + (p.role ? ' — ' + p.role : '');
    // Reuse the CV being edited, or the one for the same person, instead of piling up duplicates.
    let existing = S.cvMode && S.cvEditId ? findCv(S.cvEditId) : null;
    if (!existing) existing = (S.cvs || []).find(c => (S.editId && c.sourceAgentId === S.editId) ||
      (String(c.name).toLowerCase() === p.name.toLowerCase() && String(c.role || '').toLowerCase() === p.role.toLowerCase()));
    if (existing && !(S.cvMode && S.cvEditId === existing.id) && !confirm('A CV for "' + existing.title + '" already exists.\n\nOK = update it with this form\nCancel = save as a new CV')) existing = null;
    if (existing) { p.id = existing.id; p.sourceAgentId = existing.sourceAgentId; p.isDefaultAgent = existing.isDefaultAgent; }
    else if (S.editId) p.sourceAgentId = S.editId;
    try {
      const d = await api('/api/agents/cvs', { method: 'POST', body: JSON.stringify(p) });
      await window.loadCvs(true);
      toast('📄 CV saved: ' + d.cv.title);
      if (S.cvMode) { closeHire(); S.cvMode = false; renderTabs(); if (S.tab === 'cvs') window.renderCvBank(); }
      else renderTabs();
    } catch (e) { toast('❌ ' + e.message); }
  };

  // ---------- CV bank tab ----------
  function cvCard(c) {
    const when = c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : '';
    const tools = (c.allowedTools || []).length;
    return '<div class="card" style="' + (c.isDefaultAgent ? 'border-color:#fcd34d;box-shadow:0 0 0 3px #fef3c7 inset;' : '') + '">' +
      '<div class="card-head"><div class="avatar">' + (c.avatarUrl ? '<img src="' + esc(c.avatarUrl) + '" alt="">' : esc(c.emoji || '🧑‍💼')) + '</div>' +
      '<div style="flex:1;min-width:0;"><div class="card-name">' + esc(c.name) + (c.isDefaultAgent ? ' <span class="pill" style="background:#fef3c7;color:#92400e;">★ Default</span>' : '') + '</div>' +
      '<div class="card-role">' + esc(c.role || '') + '</div></div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;"><span class="chip">' + esc(c.category || 'business') + '</span><span class="chip">' + esc(c.model || '') + '</span>' +
      '<span class="chip">🛠️ ' + tools + ' tools</span><span class="chip">🗣️ ' + esc((c.languages || []).slice(0, 3).join(', ')) + '</span></div>' +
      (c.jobDescription ? '<div style="font-size:12px;color:#475569;line-height:1.45;max-height:4.4em;overflow:hidden;">' + esc(c.jobDescription) + '</div>' : '') +
      '<div class="meta-row"><span>' + esc(c.tone || '') + '</span><span>' + (when ? 'saved ' + when : '') + '</span></div>' +
      '<div class="card-actions">' +
      '<button class="btn btn-sm btn-primary" onclick="hireFromCv(\'' + esc(c.id) + '\')">🚀 Hire from this CV</button>' +
      '<button class="btn btn-sm btn-ghost" onclick="openCvForm(\'' + esc(c.id) + '\')">✏️ Edit</button>' +
      '<button class="btn btn-sm btn-ghost" onclick="deleteCvItem(\'' + esc(c.id) + '\')" style="color:#dc2626;">🗑️</button></div></div>';
  }

  window.renderCvBank = async function () {
    const box = $('cards');
    if (!S.cvs) {
      box.innerHTML = '<div class="x" style="grid-column:1/-1;">Loading CVs…</div>';
      try { await window.loadCvs(); } catch (e) { box.innerHTML = '<div class="x" style="grid-column:1/-1;">❌ ' + esc(e.message) + '</div>'; return; }
      if (S.tab !== 'cvs') return;
      renderTabs();
    }
    const q = cvSearch.trim().toLowerCase();
    const list = (S.cvs || []).filter(c => !q || [c.name, c.role, c.title, c.category, c.model, c.jobDescription].join(' ').toLowerCase().includes(q));
    const bar = '<div style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
      '<b style="font-size:15px;">📄 Ready-to-Insert CVs</b>' +
      '<input class="f" id="cvSearchBox" placeholder="Search CVs…" value="' + esc(cvSearch) + '" oninput="cvSearchChanged(this.value)" style="max-width:240px;margin:0;">' +
      '<span style="flex:1;"></span>' +
      '<button class="btn btn-sm btn-primary" onclick="openCvForm()">➕ New CV</button>' +
      '<button class="btn btn-sm btn-ghost" onclick="syncCvsFromStaff()" title="Add a CV for every hired staff member that does not have one yet">🔄 Import from hired staff</button></div>' +
      '<div style="grid-column:1/-1;font-size:12px;color:#64748b;margin-top:-4px;">Save a CV once, then pick it in <b>Hire New Staff</b> to fill the whole form instantly.</div>';
    box.innerHTML = bar + (list.length ? list.map(cvCard).join('') :
      '<div class="x" style="grid-column:1/-1;padding:24px;text-align:center;">' + (S.cvs.length ? 'No CV matches your search.' : 'No CVs saved yet. Press <b>🔄 Import from hired staff</b> or <b>➕ New CV</b>.') + '</div>');
  };

  window.cvSearchChanged = function (v) {
    cvSearch = v || '';
    window.renderCvBank().then(() => { const el = $('cvSearchBox'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  };

  window.syncCvsFromStaff = async function () {
    try {
      const d = await api('/api/agents/cvs/sync', { method: 'POST', body: '{}' });
      S.cvs = d.cvs || [];
      toast(d.added ? '✅ ' + d.added + ' CV(s) imported from hired staff' : 'All hired staff already have a CV');
      renderTabs(); window.renderCvBank();
    } catch (e) { toast('❌ ' + e.message); }
  };

  window.openCvForm = async function (id) {
    await openHire();
    if (!S.meta) return;
    S.cvMode = true; S.cvEditId = id || null;
    $('hCvPickWrap').classList.add('hidden');
    $('hireSaveCvBtn').classList.add('hidden');
    $('hireTitle').textContent = id ? '✏️ Edit CV' : '📄 New CV';
    $('hireSaveBtn').textContent = '💾 Save CV';
    if (id) { const cv = findCv(id); if (cv) fillHireForm(cv); }
  };

  window.hireFromCv = async function (id) {
    await openHire();
    if (!S.meta) return;
    S.cvPickId = id;
    await window.refreshCvPicker();
    window.cvPicked(id);
  };

  window.deleteCvItem = async function (id) {
    const cv = findCv(id);
    if (!confirm('Delete the CV "' + ((cv && cv.title) || id) + '"?\n\nStaff already hired from it are not affected.')) return;
    try {
      await api('/api/agents/cvs/' + encodeURIComponent(id), { method: 'DELETE' });
      await window.loadCvs(true);
      toast('🗑️ CV deleted'); renderTabs(); window.renderCvBank();
    } catch (e) { toast('❌ ' + e.message); }
  };
})();
