/* ============================================================================
 * 📱 BL Checking Station — "Interaction with WhatsApp"
 * ============================================================================
 * WHY THIS FILE EXISTS
 * The ProformaTracker/Containers app ships as a pre-built bundle (there is no
 * JSX source in this repo), so this feature is added as a small, self-contained
 * module loaded by public/proforma/index.html. It does three things:
 *
 *   1. Watches for the BL Checking Station modal and adds a TAB STRIP to it:
 *        [ BL CHECKING ]  [ 💬 INTERACTION WITH WHATSAPP ]
 *   2. Clicking the WhatsApp tab opens a section with the two buttons the owner
 *      asked for:
 *        • Select WhatsApp group to interact (from WhatsApp Web)
 *        • BLs fetched from this group
 *   3. Lets the owner assign which AI staff member (AI Staff Academy) runs that
 *      group, and with what powers.
 *
 * Nothing here touches the React tree directly. Records are read/written with
 * the SAME localStorage contract the bundle uses, so a BL pulled from WhatsApp
 * can be handed to the station (fill the form) or parked in the BL Drafts list.
 * ==========================================================================*/
(function () {
  'use strict';

  if (window.__BLWA_LOADED__) return;
  window.__BLWA_LOADED__ = true;

  const DRAFTS_KEY = 'bl_drafts_v1';        // same key the bundle uses
  const GROUP_KEY = 'blwa_group_v1';        // selected group per station/db
  const OVERLAY_ID = 'blwa-overlay';
  const TABS_ID = 'blwa-tabs';

  const state = {
    base: null,
    connected: false,
    status: '',
    groups: null,          // null = not loaded yet
    agents: null,
    groupJid: '',
    groupName: '',
    bls: [],
    assignment: null,
    inbox: null,
    reference: null,
    inboxTimer: null,
    chat: null,
    chatBusy: false,
    xray: null,
    xrayBusy: false,
    xrayFor: '',
    xrayRules: null,
    mediaList: null,
    mediaBusy: false,
    busy: false
  };

  // ── tiny helpers ──────────────────────────────────────────────────────────
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function jget(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }

  /** Exactly the key the bundle builds: `${user}::${activeDatabase}`. */
  function stationKey() {
    const user = jget('ot_user', null);
    const uid = (user && (user.uid || user.id || user.email)) || 'local';
    const db = jget('ot_active_database', null);
    const dbKey = (db && (db.id || db.name)) || 'default';
    return uid + '::' + dbKey;
  }

  function fail(e) {
    const msg = (e && e.message) || String(e);
    console.warn('[BL-WA]', e);
    toast(msg, 'error');
  }

  /** Wrap a handler so a bug in this module can never hit the app's global error screen. */
  function guard(fn) {
    return function () {
      try {
        const r = fn.apply(this, arguments);
        if (r && typeof r.catch === 'function') r.catch(fail);
        return r;
      } catch (e) {
        fail(e);
      }
    };
  }

  function toast(text, kind) {
    let t = document.getElementById('blwa-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'blwa-toast';
      t.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483600;max-width:min(420px,86vw);' +
        'padding:12px 16px;border-radius:10px;font:600 13px/1.45 system-ui,Segoe UI,Arial;box-shadow:0 12px 30px rgba(0,0,0,.55);' +
        'transition:opacity .2s ease;pointer-events:none';
      document.body.appendChild(t);
    }
    const ok = kind !== 'error';
    t.style.background = ok ? 'rgba(6,78,59,.96)' : 'rgba(90,15,20,.96)';
    t.style.border = '1px solid ' + (ok ? 'rgba(16,185,129,.6)' : 'rgba(239,68,68,.6)');
    t.style.color = ok ? '#a7f3d0' : '#fecaca';
    t.textContent = text;
    t.style.opacity = '1';
    clearTimeout(t._hide);
    t._hide = setTimeout(() => { t.style.opacity = '0'; }, 4200);
  }

  // ── API base: this server's /candl/api first, then any configured host ────
  function apiCandidates() {
    const out = [];
    try { out.push(new URL('/candl/api', location.origin).href.replace(/\/$/, '')); } catch (e) { /* ignore */ }
    try {
      const raw = String(localStorage.getItem('ot_api_base') || '').trim();
      if (raw) {
        const b = raw.replace(/\/+$/, '');
        out.push(/\/api$/.test(b) ? b.replace(/\/api$/, '/candl/api') : b + '/candl/api');
      }
    } catch (e) { /* ignore */ }
    out.push('https://whatanagent.duckdns.org/candl/api');
    return Array.from(new Set(out));
  }

  async function apiFetch(pathname, opts) {
    const candidates = apiCandidates();
    const bases = state.base ? [state.base].concat(candidates.filter(b => b !== state.base)) : candidates;
    let lastErr = null;
    for (const base of bases) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 12000);
      try {
        const res = await fetch(base + pathname, Object.assign({ signal: ctl.signal }, opts || {}));
        clearTimeout(timer);
        let body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        if (!res.ok) throw new Error((body && body.error) || ('Request failed (' + res.status + ')'));
        state.base = base;
        return body || {};
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
      }
    }
    throw lastErr || new Error('Could not reach the WhatsApp service');
  }

  // ── locating the BL Checking Station in the React DOM ─────────────────────
  function findStationCard() {
    const heads = document.querySelectorAll('h1,h2,h3');
    for (let i = 0; i < heads.length; i++) {
      const h = heads[i];
      if (!/BL\s+Checking\s+Station/i.test(h.textContent || '')) continue;
      let el = h;
      while (el && el !== document.body) {
        if (el.classList && el.classList.contains('card')) return el;
        el = el.parentElement;
      }
    }
    return null;
  }

  function tabButtons(active) {
    const mk = (key, label, activeNow) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.blwaTab = key;
      b.textContent = label;
      b.style.cssText = [
        'padding:7px 14px', 'border-radius:8px 8px 0 0', 'cursor:pointer',
        'font:800 12px/1 system-ui,Segoe UI,Arial', 'letter-spacing:.04em',
        'background:' + (activeNow ? 'rgba(56,189,248,.22)' : 'transparent'),
        'border:1px solid ' + (activeNow ? 'rgba(56,189,248,.6)' : 'rgba(148,163,184,.28)'),
        'border-bottom:' + (activeNow ? '2px solid #38bdf8' : '2px solid transparent'),
        'color:' + (activeNow ? '#7dd3fc' : '#94a3b8'),
        'white-space:nowrap'
      ].join(';');
      return b;
    };
    const frag = document.createDocumentFragment();
    frag.appendChild(mk('station', 'BL CHECKING', active === 'station'));
    frag.appendChild(mk('whatsapp', '💬 INTERACTION WITH WHATSAPP', active === 'whatsapp'));
    return frag;
  }

  /** Add the tab strip to the station header. Re-added if React drops it. */
  function ensureTabs() {
    const card = findStationCard();
    if (!card) {
      const old = document.getElementById(TABS_ID);
      if (old) old.remove();
      return;
    }
    if (card.querySelector('#' + TABS_ID)) return;

    const bar = document.createElement('div');
    bar.id = TABS_ID;
    bar.style.cssText = 'flex:0 0 auto;display:flex;align-items:flex-end;gap:6px;flex-wrap:wrap;' +
      'margin:0 0 14px 0;padding-bottom:2px;border-bottom:1px solid rgba(148,163,184,.22)';
    bar.appendChild(tabButtons('station'));

    bar.querySelector('[data-blwa-tab="whatsapp"]').addEventListener('click', guard((e) => {
      e.preventDefault();
      e.stopPropagation();
      openWhatsApp();
    }));
    bar.querySelector('[data-blwa-tab="station"]').addEventListener('click', guard((e) => {
      e.preventDefault();
      e.stopPropagation();
      closeWhatsApp();
    }));

    card.insertBefore(bar, card.firstChild);
  }

  // ── overlay section ──────────────────────────────────────────────────────
  function closeWhatsApp() {
    if (state.inboxTimer) { clearInterval(state.inboxTimer); state.inboxTimer = null; }
    const ov = document.getElementById(OVERLAY_ID);
    if (ov) ov.remove();
  }

  function openWhatsApp() {
    if (document.getElementById(OVERLAY_ID)) return;
    restoreSelection();

    const ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483400;background:#070c16;' +
      'display:flex;flex-direction:column;color:#e2e8f0;font:14px/1.5 system-ui,Segoe UI,Arial';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;' +
      'padding:12px 18px 0;background:rgba(15,23,42,.96);border-bottom:1px solid rgba(148,163,184,.2)';
    header.appendChild(tabButtons('whatsapp'));
    const backTab = header.querySelector('[data-blwa-tab="station"]');
    if (backTab) backTab.addEventListener('click', guard((e) => { e.preventDefault(); closeWhatsApp(); }));
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕ Close';
    close.style.cssText = 'margin-left:auto;margin-bottom:8px;padding:7px 12px;border-radius:8px;cursor:pointer;' +
      'background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.4);color:#fca5a5;font:700 12px system-ui';
    close.addEventListener('click', guard((e) => { e.preventDefault(); closeWhatsApp(); }));
    header.appendChild(close);
    ov.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;padding:20px;';
    const wrap = document.createElement('div');
    wrap.id = 'blwa-wrap';
    wrap.style.cssText = 'max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:16px';
    body.appendChild(wrap);
    ov.appendChild(body);

    document.body.appendChild(ov);
    renderSection(wrap);
    loadStatus(wrap);
    syncReference();
    loadInbox(wrap);
    loadMedia(wrap);
    if (state.inboxTimer) clearInterval(state.inboxTimer);
    state.inboxTimer = setInterval(guard(() => loadInbox(wrap, { quiet: true })), 25000);
  }

  /**
   * The app's records live in the browser, so the server is handed the small set it needs to
   * judge an incoming BL: your saved masters (shipper / consignee / port / agent) + your drafts.
   */
  function buildReference() {
    const masters = (jget('ot_masters_cache', []) || []).map(m => ({
      category: m.category, name: m.name, details: m.details
    }));
    const all = jget(DRAFTS_KEY, {}) || {};
    const drafts = Array.isArray(all[stationKey()]) ? all[stationKey()] : [];
    return {
      masters,
      drafts: drafts.map(d => ({
        bl_number: d.bl_number, shipper_name: d.shipper_name, consignee_name: d.consignee_name,
        vessel_name: d.vessel_name, port_of_loading: d.port_of_loading, shipping_agent: d.shipping_agent,
        container_numbers: d.container_numbers, container_numbers_text: d.container_numbers_text,
        proforma_number: d.proforma_number
      }))
    };
  }

  async function syncReference() {
    try {
      const body = buildReference();
      const r = await apiFetch('/wa/reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      state.reference = { masters: r.masters, drafts: r.drafts, updatedAt: r.updatedAt };
    } catch (e) {
      state.reference = null;
    }
  }

  /** The connection chip starts as "unknown" — always ask the server before showing a verdict. */
  function statusChipHtml() {
    if (!state.status) {
      return '<span id="blwa-status-chip" style="font-size:11px;font-weight:800;letter-spacing:.06em;padding:4px 10px;' +
        'border-radius:20px;background:rgba(148,163,184,.14);border:1px solid rgba(148,163,184,.35);color:#94a3b8">' +
        'CHECKING WHATSAPP WEB…</span>';
    }
    const ok = state.connected;
    return '<span id="blwa-status-chip" style="font-size:11px;font-weight:800;letter-spacing:.06em;padding:4px 10px;' +
      'border-radius:20px;background:' + (ok ? 'rgba(16,185,129,.16)' : 'rgba(245,158,11,.16)') + ';' +
      'border:1px solid ' + (ok ? 'rgba(16,185,129,.5)' : 'rgba(245,158,11,.5)') + ';' +
      'color:' + (ok ? '#34d399' : '#fbbf24') + '">' +
      (ok
        ? 'WHATSAPP WEB CONNECTED' + (state.phone ? ' · ' + esc(state.phone) : '')
        : 'WHATSAPP WEB ' + esc(String(state.status || 'not connected').toUpperCase())) +
    '</span>';
  }

  async function loadStatus(wrap) {
    try {
      const s = await apiFetch('/wa/status');
      state.connected = !!s.connected;
      state.status = s.status || 'disconnected';
      state.phone = s.phone || '';
    } catch (e) {
      state.connected = false;
      state.status = 'unreachable';
    }
    const chip = wrap.querySelector('#blwa-status-chip');
    if (chip) chip.outerHTML = statusChipHtml();
  }

  function cardStyle() {
    return 'background:linear-gradient(180deg,rgba(30,41,59,.75),rgba(15,23,42,.75));' +
      'border:1px solid rgba(148,163,184,.22);border-radius:14px;padding:18px';
  }

  function buttonStyle(kind, disabled) {
    const palette = {
      primary: ['rgba(56,189,248,.2)', 'rgba(56,189,248,.65)', '#7dd3fc'],
      green: ['rgba(16,185,129,.16)', 'rgba(16,185,129,.6)', '#6ee7b7'],
      ghost: ['rgba(255,255,255,.05)', 'rgba(148,163,184,.32)', '#cbd5e1'],
      secondary: ['rgba(255,255,255,.05)', 'rgba(148,163,184,.32)', '#cbd5e1']
    };
    // Never let an unknown variant throw here: this runs while the section is being built, so a
    // crash would blank the page. An unstyled button is a much better failure.
    const accent = palette[kind] || palette[kind || 'primary'] || palette.primary;
    return 'display:inline-flex;align-items:center;gap:8px;padding:10px 15px;border-radius:10px;' +
      'cursor:' + (disabled ? 'not-allowed' : 'pointer') + ';' +
      (disabled ? 'opacity:.45;' : '') +
      'background:' + accent[0] + ';border:1px solid ' + accent[1] + ';color:' + accent[2] +
      ';font:800 13px system-ui;letter-spacing:.02em';
  }

  function renderSection(wrap) {
    const selected = state.groupJid;

    wrap.innerHTML = '' +
      '<div style="padding:2px 2px 0">' +
        '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
          '<div style="font-size:22px;font-weight:800;color:#fff">💬 Interaction with WhatsApp</div>' +
          statusChipHtml() +
        '</div>' +
        '<div style="font-size:13px;color:#94a3b8;margin-top:6px">' +
          'Work the BL Checking Station straight from the shipping group: pick the group, pull the BLs posted in it, ' +
          'and assign the AI staff member who runs that group.' +
        '</div>' +
      '</div>' +

      // ── STEP 1 ─────────────────────────────────────────────────────────────
      '<div style="' + cardStyle() + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
          '<div>' +
            '<div style="font-size:15px;font-weight:800;color:#fff">1. Select WhatsApp group to interact</div>' +
            '<div style="font-size:12.5px;color:#94a3b8;margin-top:3px">' +
              'Groups from the linked WhatsApp Web account. Our AI agent sits in the group you choose here.' +
            '</div>' +
          '</div>' +
          '<button type="button" id="blwa-pick-group" style="' + buttonStyle('primary') + '">' +
            (selected ? '↻ Change group' : '📋 Select WhatsApp group') +
          '</button>' +
        '</div>' +
        (selected
          ? '<div style="margin-top:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;' +
              'padding:11px 14px;border-radius:10px;background:rgba(56,189,248,.09);border:1px solid rgba(56,189,248,.4)">' +
              '<span style="font-weight:800;color:#7dd3fc">Selected group:</span>' +
              '<span style="font-weight:700;color:#fff">' + esc(state.groupName || state.groupJid) + '</span>' +
              '<span style="font-size:11.5px;color:#64748b;font-family:ui-monospace,Consolas,monospace">' + esc(state.groupJid) + '</span>' +
            '</div>'
          : '<div style="margin-top:14px;padding:11px 14px;border-radius:10px;background:rgba(245,158,11,.08);' +
              'border:1px dashed rgba(245,158,11,.4);color:#fbbf24;font-size:12.5px">' +
              'No group selected yet. Press “Select WhatsApp group”.' +
            '</div>') +
        '<div id="blwa-group-picker" style="margin-top:14px"></div>' +
      '</div>' +

      // ── STEP 2 ─────────────────────────────────────────────────────────────
      '<div style="' + cardStyle() + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
          '<div>' +
            '<div style="font-size:15px;font-weight:800;color:#fff">2. BLs fetched from this group</div>' +
            '<div style="font-size:12.5px;color:#94a3b8;margin-top:3px">' +
              'Reads the group’s messages and pulls out BL numbers, vessel, seal, containers and attached BL PDFs.' +
            '</div>' +
          '</div>' +
          '<button type="button" id="blwa-fetch-bls" style="' + buttonStyle('green', !selected) + '"' +
            (selected ? '' : ' disabled title="Select a group first"') + '>' +
            (state.busy ? '⏳ Reading…' : '⬇ Fetch BLs from this group') +
          '</button>' +
        '</div>' +
        '<div id="blwa-bls" style="margin-top:14px"></div>' +
      '</div>' +

      // ── STEP 3 ─────────────────────────────────────────────────────────────
      '<div style="' + cardStyle() + '">' +
        '<div style="font-size:15px;font-weight:800;color:#fff">3. AI agent for this group (assigning power)</div>' +
        '<div style="font-size:12.5px;color:#94a3b8;margin-top:3px">' +
          'Hire staff in the AI Staff Academy, then give one of them this group. Assigning also files the group ' +
          'as that staff member’s learning source.' +
        '</div>' +
        '<div id="blwa-agents" style="margin-top:14px"></div>' +
      '</div>' +

      // ── STEP 4 ─────────────────────────────────────────────────────────────
      '<div style="' + cardStyle() + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
          '<div>' +
            '<div style="font-size:15px;font-weight:800;color:#fff">4. AI checks (automatic)</div>' +
            '<div style="font-size:12.5px;color:#94a3b8;margin-top:3px">' +
              'Every BL posted in the assigned group is read, filed to Google Drive and compared with your saved ' +
              'shipper / consignee / port / agent. A difference is reported in the group and to your WhatsApp; ' +
              'a clean BL is confirmed to you only.' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<button type="button" id="blwa-xray-open" style="' + buttonStyle('green', !selected) + '"' +
              (selected ? '' : ' disabled title="Select a group first"') + '>' +
              (state.xrayBusy ? '\u23f3 Reading\u2026' : '\ud83d\udd2c BL X-Ray Checkup') +
            '</button>' +
            '<button type="button" id="blwa-scan-now" style="' + buttonStyle('primary', !selected) + '"' +
              (selected ? '' : ' disabled title="Select a group first"') + '>' +
              (state.scanning ? '\u23f3 Checking\u2026' : '\u26a1 Check the group now') +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div id="blwa-xray" style="margin-top:14px"></div>' +
        '<div id="blwa-inbox" style="margin-top:14px"></div>' +
      '</div>' +

      // ── STEP 5 ─────────────────────────────────────────────────────────────
      '<div style="' + cardStyle() + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
          '<div>' +
            '<div style="font-size:15px;font-weight:800;color:#fff">5. Chat &amp; files of this group</div>' +
            '<div style="font-size:12.5px;color:#94a3b8;margin-top:3px">' +
              'Read what the group has been saying and open the files the AI has already saved. ' +
              'WhatsApp only lets a file be downloaded while it is fresh, so files are copied the moment ' +
              'they arrive \u2014 anything from before saving was switched on has to be forwarded once.' +
            '</div>' +
          '</div>' +
          '<button type="button" id="blwa-load-chat" style="' + buttonStyle('secondary', !selected) + '"' +
            (selected ? '' : ' disabled title="Select a group first"') + '>' +
            (state.chatBusy ? '\u23f3 Loading\u2026' : '\ud83d\udcac Load chat') +
          '</button>' +
        '</div>' +
        '<div id="blwa-chat" style="margin-top:14px"></div>' +
      '</div>' +

      // ── STEP 6: DRAFTS MEDIA ───────────────────────────────────────────────
      '<div style="' + cardStyle() + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
          '<div>' +
            '<div style="font-size:15px;font-weight:800;color:#fff">\ud83d\udcc1 DRAFTS MEDIA</div>' +
            '<div style="font-size:12.5px;color:#94a3b8;margin-top:3px">' +
              'Every document and photo the AI downloaded from the assigned group(s) and saved on your Tencent server. ' +
              'Files are kept here so a BL can still be read and checked long after WhatsApp has stopped serving it.' +
            '</div>' +
          '</div>' +
          '<button type="button" id="blwa-media-load" style="' + buttonStyle('primary') + '">' +
            (state.mediaBusy ? '\u23f3 Loading\u2026' : '\ud83d\udcc2 Load files') +
          '</button>' +
        '</div>' +
        '<div id="blwa-media" style="margin-top:14px"></div>' +
      '</div>' +

      '<div style="font-size:11.5px;color:#64748b;padding:0 2px 8px">' +
        'BL rows can be pushed into the station form (fields are filled for you to verify) or parked in ' +
        '<b style="color:#94a3b8">BL Drafts</b>. Drafts written from here appear in the station list after the app is reloaded.' +
      '</div>';

    // wire step 1
    const pickBtn = wrap.querySelector('#blwa-pick-group');
    if (pickBtn) pickBtn.addEventListener('click', guard(() => openGroupPicker(wrap)));

    // wire step 2
    const fetchBtn = wrap.querySelector('#blwa-fetch-bls');
    if (fetchBtn && selected) fetchBtn.addEventListener('click', guard(() => fetchBls(wrap)));

    // wire step 4
    const scanBtn = wrap.querySelector('#blwa-scan-now');
    if (scanBtn && selected) scanBtn.addEventListener('click', guard(() => scanNow(wrap)));

    const xrayBtn = wrap.querySelector('#blwa-xray-open');
    if (xrayBtn && selected) xrayBtn.addEventListener('click', guard(() => xrayNewest(wrap)));

    // wire step 5
    const chatBtn = wrap.querySelector('#blwa-load-chat');
    if (chatBtn && selected) chatBtn.addEventListener('click', guard(() => loadChat(wrap)));

    // wire step 6
    const mediaBtn = wrap.querySelector('#blwa-media-load');
    if (mediaBtn) mediaBtn.addEventListener('click', guard(() => loadMedia(wrap)));

    renderBls(wrap);
    renderAgents(wrap);
    renderInbox(wrap);
    renderXray(wrap);
    renderChat(wrap);
    renderMedia(wrap);
  }

  // ── step 6: DRAFTS MEDIA (what is saved on the server) ──────────────────
  function fmtBytes(n) {
    const v = Number(n) || 0;
    if (v < 1024) return v + ' B';
    if (v < 1048576) return (v / 1024).toFixed(0) + ' KB';
    return (v / 1048576).toFixed(1) + ' MB';
  }

  async function loadMedia(wrap) {
    if (state.mediaBusy) return;
    state.mediaBusy = true;
    renderSection(wrap);
    try {
      const r = await apiFetch('/wa/media/list?limit=200');
      state.mediaList = r;
    } catch (e) {
      toast('Could not read the saved media: ' + e.message, 'error');
      state.mediaList = state.mediaList || { ok: false, items: [] };
    } finally {
      state.mediaBusy = false;
      renderSection(wrap);
    }
  }

  function renderMedia(wrap) {
    const host = wrap.querySelector('#blwa-media');
    if (!host) return;

    if (state.mediaList === null || state.mediaList === undefined) {
      host.innerHTML = '<div style="font-size:12.5px;color:#94a3b8">Press \u201cLoad files\u201d to see what the AI has saved on this server.</div>';
      return;
    }

    const data = state.mediaList;
    if (data.ok === false) {
      host.innerHTML = '<div style="font-size:12.5px;color:#fca5a5">' + esc(data.error || 'Could not read the saved media.') + '</div>';
      return;
    }

    const folderLine = '<div style="font-size:11.5px;color:#64748b;margin-bottom:9px">' +
      'Folder on the server: <b style="color:#94a3b8">' + esc(data.folder || 'data/wa-media') + '</b>' +
      ' \u00b7 ' + (data.total || 0) + ' file(s) \u00b7 ' + fmtBytes(data.bytes) + '</div>';

    if (!data.items || !data.items.length) {
      host.innerHTML = folderLine +
        '<div style="padding:12px 14px;border-radius:10px;background:rgba(148,163,184,.06);' +
        'border:1px dashed rgba(148,163,184,.3);font-size:12.5px;color:#94a3b8">' +
        'Nothing saved yet. Files are copied the moment they are posted in an assigned group \u2014 ' +
        'anything posted before saving was switched on cannot be recovered from WhatsApp and has to be forwarded once.' +
        '</div>';
      return;
    }

    const rows = data.items.map((f) => {
      const isImg = /^image\//i.test(f.mimetype || '');
      const icon = isImg ? '\ud83d\uddbc\ufe0f' : (/pdf/i.test(f.mimetype || '') || /\.pdf$/i.test(f.file_name || '') ? '\ud83d\udcc4' : '\ud83d\udcce');
      const day = f.ts ? new Date(f.ts).toLocaleString() : '';
      return '<div style="padding:10px 12px;border-top:1px solid rgba(148,163,184,.14)">' +
        '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">' +
          '<span>' + icon + '</span>' +
          '<a href="' + esc((state.base || '') + f.url) + '" target="_blank" rel="noreferrer" ' +
            'style="color:#7dd3fc;font-weight:700;text-decoration:none;font-size:12.5px;overflow:hidden;' +
            'text-overflow:ellipsis;white-space:nowrap;max-width:52ch" title="' + esc(f.file_name) + '">' +
            esc(f.file_name) + ' \u2197</a>' +
          '<span style="font-size:11px;color:#64748b">' + esc(fmtBytes(f.size)) + '</span>' +
          '<span style="margin-left:auto;font-size:11px;color:#64748b">' + esc(day) + '</span>' +
        '</div>' +
        '<div style="margin-top:5px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:11.5px;color:#94a3b8">' +
          (f.group_name ? '<span>\ud83d\udc65 ' + esc(f.group_name) + '</span>' : '') +
          '<button type="button" data-blwa-media-drive="' + esc(f.jid) + '|' + esc(f.id) + '" ' +
            'style="' + buttonStyle('ghost') + ';padding:3px 9px;font-size:11px">Save to Drive</button>' +
        '</div>' +
      '</div>';
    }).join('');

    host.innerHTML = folderLine +
      '<div style="border:1px solid rgba(148,163,184,.18);border-radius:10px;overflow:hidden;max-height:460px;overflow-y:auto">' + rows + '</div>';

    host.querySelectorAll('[data-blwa-media-drive]').forEach((b) => {
      b.addEventListener('click', guard(() => {
        const parts = String(b.dataset.blwaMediaDrive || '').split('|');
        if (parts.length === 2) saveMediaToDrive(wrap, parts[0], parts[1]);
      }));
    });
  }

  // ── step 4: automatic checks ─────────────────────────────────────────────
  async function loadInbox(wrap, opts) {
    const quiet = !!(opts && opts.quiet);
    try {
      const q = state.groupJid ? ('?jid=' + encodeURIComponent(state.groupJid)) : '';
      const data = await apiFetch('/wa/bl-inbox' + q);
      state.inbox = Array.isArray(data.items) ? data.items : [];
      if (typeof data.referenceUpdatedAt === 'number') state.referenceUpdatedAt = data.referenceUpdatedAt;
      state.bossReady = data.boss_notifications !== false;
      renderInbox(wrap);
    } catch (e) {
      state.inbox = state.inbox || [];
      if (!quiet) toast('Could not read the AI inbox: ' + e.message, 'error');
    }
  }

  async function scanNow(wrap) {
    if (!state.groupJid || state.scanning) return;
    state.scanning = true;
    renderSection(wrap);
    try {
      await syncReference();
      const r = await apiFetch('/wa/bl-inbox/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: state.groupJid })
      });
      const first = (r.results || [])[0] || {};
      if (first.ok === false) toast(first.error || 'Scan failed', 'error');
      else if (!first.processed) toast('Checked — no new BL document in this group yet.');
      else toast('Checked ' + first.processed + ' BL document(s).');
    } catch (e) {
      toast('Scan failed: ' + e.message, 'error');
    } finally {
      state.scanning = false;
      await loadInbox(wrap, { quiet: true });
      renderSection(wrap);
    }
  }

  function verdictChip(item) {
    const v = (item.check && item.check.verdict) || item.status || 'pending';
    const map = {
      mismatch: ['MISMATCH', 'rgba(239,68,68,.18)', 'rgba(239,68,68,.55)', '#fca5a5'],
      unknown: ['CHECK', 'rgba(245,158,11,.16)', 'rgba(245,158,11,.5)', '#fbbf24'],
      ok: ['OK', 'rgba(16,185,129,.16)', 'rgba(16,185,129,.5)', '#34d399'],
      'no-reference': ['NO REFERENCE', 'rgba(148,163,184,.16)', 'rgba(148,163,184,.4)', '#cbd5e1'],
      'awaiting-media': ['NEED FILE', 'rgba(245,158,11,.16)', 'rgba(245,158,11,.5)', '#fbbf24'],
      'not-a-bl': ['NOT A BL', 'rgba(148,163,184,.14)', 'rgba(148,163,184,.35)', '#94a3b8'],
      unreadable: ['UNREADABLE', 'rgba(148,163,184,.14)', 'rgba(148,163,184,.35)', '#94a3b8'],
      error: ['ERROR', 'rgba(239,68,68,.14)', 'rgba(239,68,68,.45)', '#fca5a5']
    };
    const m = map[v] || map['no-reference'];
    return '<span style="font-size:10px;font-weight:800;letter-spacing:.05em;padding:3px 8px;border-radius:20px;' +
      'background:' + m[1] + ';border:1px solid ' + m[2] + ';color:' + m[3] + '">' + m[0] + '</span>';
  }

  function renderInbox(wrap) {
    const host = wrap.querySelector('#blwa-inbox');
    if (!host) return;

    const refLine = '<div style="font-size:11.5px;color:#64748b;margin-bottom:9px">' +
      (state.reference
        ? 'Comparing against your app: ' + state.reference.drafts + ' BL draft(s) and ' + state.reference.masters + ' saved master(s).'
        : 'Your app\u2019s reference (masters + drafts) is synced automatically when this section opens.') +
      '</div>' +
      (state.bossReady === false
        ? '<div style="font-size:11.5px;color:#fbbf24;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);' +
          'border-radius:8px;padding:8px 10px;margin-bottom:9px">Boss WhatsApp is not configured on the server ' +
          '(BOSS_PHONE missing) \u2014 verdicts will still be posted in the group, but not sent to you directly.</div>'
        : '');

    if (state.inbox === null) {
      host.innerHTML = refLine + '<div style="font-size:12.5px;color:#7dd3fc">Loading AI checks\u2026</div>';
      return;
    }
    if (!state.inbox.length) {
      host.innerHTML = refLine +
        '<div style="padding:12px 14px;border-radius:10px;background:rgba(148,163,184,.06);' +
        'border:1px dashed rgba(148,163,184,.3);font-size:12.5px;color:#94a3b8">' +
        (state.groupJid
          ? 'No BL has been read from this group yet. Once a group is assigned, a BL is read the moment it is posted; you can also press \u201cCheck the group now\u201d.'
          : 'Select a group and assign an AI staff member \u2014 checks then start as messages arrive.') +
        '</div>';
      return;
    }

    const rows = state.inbox.map((item) => {
      const f = item.fields || {};
      const issues = (item.check && item.check.issues) || [];
      const driveLink = item.drive && item.drive.ok && item.drive.web_view_link
        ? '<a href="' + esc(item.drive.web_view_link) + '" target="_blank" rel="noreferrer" style="color:#7dd3fc;font-weight:700;text-decoration:none">Drive \u2197</a>'
        : '<span style="color:#64748b">' + esc((item.drive && item.drive.reason) || 'not filed') + '</span>';
      const detail = issues.length
        ? '<ul style="margin:5px 0 0 16px;padding:0;font-size:11.5px;color:#cbd5e1">' + issues.map(i =>
            '<li>' + esc(i.label) + (i.severity === 'mismatch'
              ? ': <b style="color:#fca5a5">' + esc(i.got) + '</b> (app: ' + esc(i.expected) + ')'
              : ': ' + esc(i.got) + ' <span style="color:#94a3b8">(' + esc(i.note || '') + ')</span>') + '</li>'
          ).join('') + '</ul>'
        : (item.error ? '<div style="font-size:11.5px;color:#fca5a5;margin-top:4px">' + esc(item.error) + '</div>' : '');
      return '' +
        '<div style="padding:11px 13px;border-top:1px solid rgba(148,163,184,.14)">' +
          '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">' +
            verdictChip(item) +
            '<span style="font-weight:800;color:#fbbf24;font-family:ui-monospace,Consolas,monospace">' + esc(f.bl_number || item.source_file_name || 'document') + '</span>' +
            (f.vessel_name ? '<span style="font-size:11.5px;color:#94a3b8">' + esc(f.vessel_name) + '</span>' : '') +
            '<span style="margin-left:auto;font-size:11px;color:#64748b">' + esc(item.message_ts ? new Date(item.message_ts).toLocaleString() : '') + '</span>' +
          '</div>' +
          detail +
          '<div style="margin-top:6px;display:flex;gap:14px;font-size:11.5px;color:#94a3b8;flex-wrap:wrap;align-items:center">' +
            '<span>' + esc(item.source_file_name || '') + '</span>' +
            driveLink +
            '<button type="button" data-blwa-xray="' + esc(item.id) + '" style="' + buttonStyle('ghost') +
              ';padding:3px 9px;font-size:11px">\ud83d\udd2c X-Ray</button>' +
            (item.notified && item.notified.group ? '<span style="color:#6ee7b7">reported in group</span>' : '') +
          '</div>' +
        '</div>';
    }).join('');

    host.innerHTML = refLine +
      '<div style="border:1px solid rgba(148,163,184,.18);border-radius:10px;overflow:hidden">' + rows + '</div>';

    host.querySelectorAll('[data-blwa-xray]').forEach((b) => {
      b.addEventListener('click', guard(() => {
        const item = (state.inbox || []).find(i => i && String(i.id) === String(b.dataset.blwaXray));
        if (item) runXray(wrap, item);
      }));
    });
  }

  // ── step 4b: BL X-Ray Checkup ───────────────────────────────────────────
  const XRAY_STATUS = {
    ok: ['OK', 'rgba(16,185,129,.16)', 'rgba(16,185,129,.5)', '#34d399'],
    mismatch: ['DIFFERS', 'rgba(239,68,68,.18)', 'rgba(239,68,68,.55)', '#fca5a5'],
    missing: ['MISSING', 'rgba(245,158,11,.16)', 'rgba(245,158,11,.5)', '#fbbf24'],
    invalid: ['INVALID', 'rgba(239,68,68,.18)', 'rgba(239,68,68,.55)', '#fca5a5'],
    unknown: ['NO REFERENCE', 'rgba(148,163,184,.16)', 'rgba(148,163,184,.4)', '#cbd5e1']
  };

  function xrayChip(status) {
    const m = XRAY_STATUS[status] || XRAY_STATUS.unknown;
    return '<span style="font-size:10px;font-weight:800;letter-spacing:.05em;padding:3px 8px;border-radius:20px;' +
      'white-space:nowrap;background:' + m[1] + ';border:1px solid ' + m[2] + ';color:' + m[3] + '">' + m[0] + '</span>';
  }

  /** The header button x-rays the newest BL the AI has read from this group. */
  function xrayNewest(wrap) {
    const list = state.inbox || [];
    if (!list.length) {
      toast('No BL read from this group yet \u2014 press \u201cCheck the group now\u201d first.', 'error');
      return;
    }
    const readable = list.find(i => i && i.check && ['ok', 'mismatch', 'unknown', 'no-reference'].indexOf(i.check.verdict) !== -1);
    runXray(wrap, readable || list[0]);
  }

  async function runXray(wrap, item) {
    if (!item || state.xrayBusy) return;
    state.xrayBusy = true;
    state.xrayFor = item.id || item.message_id || '';
    state.xray = null;
    renderSection(wrap);
    try {
      const r = await apiFetch('/wa/xray', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jid: item.jid || state.groupJid,
          message_id: item.message_id || item.id,
          file_name: item.source_file_name || ''
        })
      });
      state.xray = r;
      if (!state.xrayRules) loadXrayRules(wrap);
    } catch (e) {
      state.xray = { ok: false, error: e.message, file_name: item.source_file_name || '' };
      toast('X-Ray: ' + e.message, 'error');
    } finally {
      state.xrayBusy = false;
      renderSection(wrap);
    }
  }

  async function loadXrayRules(wrap) {
    try {
      const r = await apiFetch('/wa/xray/rules');
      state.xrayRules = r;
      renderXray(wrap);
    } catch (e) { /* the panel still renders without the rule */ }
  }

  async function saveXrayRule(wrap) {
    const input = wrap.querySelector('#blwa-xray-free-days');
    const raw = input ? input.value.trim() : '';
    try {
      const r = await apiFetch('/wa/xray/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ free_days_default: raw, free_days_by_port: (state.xrayRules && state.xrayRules.free_days_by_port) || {} })
      });
      state.xrayRules = r.rules || r;
      toast('Free-days rule saved \u2014 press BL X-Ray Checkup again to re-check.');
      renderXray(wrap);
    } catch (e) {
      toast('Could not save the rule: ' + e.message, 'error');
    }
  }

  function renderXray(wrap) {
    const host = wrap.querySelector('#blwa-xray');
    if (!host) return;

    if (state.xrayBusy) {
      host.innerHTML = '<div style="padding:12px 14px;border-radius:10px;background:rgba(56,189,248,.08);' +
        'border:1px dashed rgba(56,189,248,.4);font-size:12.5px;color:#7dd3fc">\ud83d\udd2c Reading the whole BL and checking every field\u2026</div>';
      return;
    }
    if (!state.xray) { host.innerHTML = ''; return; }

    const closeBtn = '<button type="button" id="blwa-xray-close" style="' + buttonStyle('ghost') + ';padding:5px 10px;font-size:11.5px">\u2715 Close X-Ray</button>';

    if (state.xray.ok === false) {
      host.innerHTML = '<div style="padding:13px 15px;border-radius:10px;background:rgba(239,68,68,.1);' +
        'border:1px solid rgba(239,68,68,.4);font-size:12.5px;color:#fca5a5">' +
        esc(state.xray.error || 'X-Ray failed') +
        '</div><div style="margin-top:10px">' + closeBtn + '</div>';
      const b = host.querySelector('#blwa-xray-close');
      if (b) b.addEventListener('click', guard(() => { state.xray = null; renderSection(wrap); }));
      return;
    }

    const x = state.xray;
    const sum = x.summary || {};
    const summaryChips = ['mismatch', 'missing', 'invalid', 'ok', 'unknown']
      .filter(k => (sum[k] || 0) > 0)
      .map(k => '<span style="display:inline-flex;align-items:center;gap:6px;margin-right:10px">' + xrayChip(k) +
        '<b style="font-size:12px;color:#cbd5e1">' + (sum[k] || 0) + '</b></span>').join('');

    const rows = (x.checks || []).map(c => {
      const expected = c.expected ? '<div style="font-size:11.5px;color:#94a3b8;margin-top:2px">in app: ' + esc(c.expected) + '</div>' : '';
      return '<div style="padding:9px 12px;border-top:1px solid rgba(148,163,184,.12)">' +
        '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">' +
          xrayChip(c.status) +
          '<b style="font-size:12.5px;color:#e2e8f0">' + esc(c.label) + '</b>' +
          '<span style="font-size:12.5px;color:' + (c.status === 'mismatch' || c.status === 'invalid' ? '#fca5a5' : '#cbd5e1') + '">' +
            esc(c.got || '\u2014') + '</span>' +
        '</div>' +
        expected +
        (c.note ? '<div style="font-size:11.5px;color:#64748b;margin-top:2px">' + esc(c.note) + '</div>' : '') +
      '</div>';
    }).join('');

    const groupBlocks = (x.groups || []).map(g => {
      const fields = g.fields.map(f =>
        '<div style="display:grid;grid-template-columns:170px 1fr;gap:10px;padding:4px 0;border-top:1px solid rgba(148,163,184,.08)">' +
          '<div style="font-size:11.5px;color:#94a3b8">' + esc(f.label) + '</div>' +
          '<div style="font-size:12.5px;color:' + (f.value ? '#e2e8f0' : '#475569') + '">' + (esc(f.value) || '\u2014') +
            (f.note ? ' <span style="font-size:10.5px;color:#fbbf24">(' + esc(f.note) + ')</span>' : '') + '</div>' +
        '</div>').join('');
      return '<div style="margin-top:12px">' +
        '<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:#7dd3fc;font-weight:800;margin-bottom:4px">' + esc(g.label) + '</div>' +
        fields + '</div>';
    }).join('');

    const ruleNow = state.xrayRules && state.xrayRules.free_days_default ? String(state.xrayRules.free_days_default) : '';

    host.innerHTML = '' +
      '<div style="border:1px solid rgba(56,189,248,.3);border-radius:12px;overflow:hidden;background:rgba(56,189,248,.04)">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 13px;background:rgba(56,189,248,.08)">' +
          '<b style="font-size:13px;color:#fff">\ud83d\udd2c BL X-Ray \u2014 ' + esc(x.file_name || 'document') + '</b>' +
          '<span style="font-size:11px;color:#94a3b8">' +
            'read by ' + esc(x.extraction_source || '?') +
            (x.cached ? ' \u00b7 from cache (no AI cost)' : '') +
            (x.media_source ? ' \u00b7 file from ' + esc(x.media_source) : '') +
            (x.text_source ? ' \u00b7 text ' + esc(x.text_source) : '') +
          '</span>' +
          '<span style="margin-left:auto">' + closeBtn + '</span>' +
        '</div>' +
        '<div style="padding:11px 13px">' +
          ((x.text_error || x.ai_error)
            ? '<div style="font-size:11.5px;color:#fbbf24;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);' +
                'border-radius:8px;padding:8px 10px;margin-bottom:8px">Limited read \u2014 ' +
                esc([x.text_error ? 'text: ' + x.text_error : '', x.ai_error ? 'fields: ' + x.ai_error : ''].filter(Boolean).join(' \u00b7 ')) +
              '</div>'
            : '') +
          (x.read_at
            ? '<div style="font-size:11px;color:#64748b;margin-bottom:8px">Text kept since ' +
                esc(new Date(x.read_at).toLocaleString()) +
                (x.text_chars ? ' \u00b7 ' + Number(x.text_chars).toLocaleString() + ' characters' : '') +
                ' \u00b7 future checks of this BL are free</div>'
            : '') +
          '<div style="margin-bottom:8px">' + (summaryChips || '<span style="font-size:12px;color:#64748b">No checks ran.</span>') + '</div>' +
          '<div style="border:1px solid rgba(148,163,184,.18);border-radius:10px;overflow:hidden">' + rows + '</div>' +
          '<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(148,163,184,.06);' +
            'border:1px solid rgba(148,163,184,.2);display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
            '<span style="font-size:12px;color:#cbd5e1">Free days you expect by default:</span>' +
            '<input id="blwa-xray-free-days" type="number" min="0" max="365" value="' + esc(ruleNow) + '" ' +
              'placeholder="e.g. 14" style="width:90px;padding:6px 9px;border-radius:8px;background:#0f172a;' +
              'border:1px solid rgba(148,163,184,.35);color:#e2e8f0;font-size:12.5px">' +
            '<button type="button" id="blwa-xray-rule-save" style="' + buttonStyle('ghost') + ';padding:6px 11px;font-size:11.5px">Save rule</button>' +
            '<span style="font-size:11px;color:#64748b">Compared with the free days printed on the BL.</span>' +
          '</div>' +
          groupBlocks +
        '</div>' +
      '</div>';

    const close = host.querySelector('#blwa-xray-close');
    if (close) close.addEventListener('click', guard(() => { state.xray = null; renderSection(wrap); }));
    const save = host.querySelector('#blwa-xray-rule-save');
    if (save) save.addEventListener('click', guard(() => saveXrayRule(wrap)));
  }

  // ── step 5: the group's chat + files ─────────────────────────────────────
  /** Absolute URL for an archived file, using whichever API host answered. */
  function mediaUrl(jid, id) {
    const base = state.base || (apiCandidates()[0] || '');
    return base + '/wa/media?jid=' + encodeURIComponent(jid) + '&id=' + encodeURIComponent(id);
  }

  async function loadChat(wrap) {
    if (!state.groupJid || state.chatBusy) return;
    state.chatBusy = true;
    renderSection(wrap);
    try {
      const data = await apiFetch('/wa/chat?limit=200&jid=' + encodeURIComponent(state.groupJid));
      if (data.ok === false) toast(data.error || 'Could not read this chat', 'error');
      state.chat = Array.isArray(data.messages) ? data.messages : [];
      state.chatArchived = Number(data.archived_files) || 0;
    } catch (e) {
      toast('Could not read this chat: ' + e.message, 'error');
      state.chat = state.chat || [];
    } finally {
      state.chatBusy = false;
      renderSection(wrap);
    }
  }

  async function saveMediaToDrive(wrap, jid, id) {
    try {
      const r = await apiFetch('/wa/media/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: jid, id: id })
      });
      if (r && r.web_view_link) {
        toast('Saved to Google Drive.');
        window.open(r.web_view_link, '_blank', 'noopener');
      } else {
        toast('Saved, but Drive returned no link.', 'error');
      }
    } catch (e) {
      toast('Drive save failed: ' + e.message, 'error');
    }
  }

  function renderChat(wrap) {
    const host = wrap.querySelector('#blwa-chat');
    if (!host) return;

    if (state.chat === null || state.chat === undefined) {
      host.innerHTML = '<div style="font-size:12.5px;color:#94a3b8">' +
        (state.groupJid
          ? 'Press \u201cLoad chat\u201d to read this group\u2019s latest 200 messages.'
          : 'Select a group first, then press \u201cLoad chat\u201d.') +
        '</div>';
      return;
    }
    if (!state.chat.length) {
      host.innerHTML = '<div style="padding:12px 14px;border-radius:10px;background:rgba(148,163,184,.06);' +
        'border:1px dashed rgba(148,163,184,.3);font-size:12.5px;color:#94a3b8">No messages in memory for this group right now.</div>';
      return;
    }

    const rows = state.chat.slice().reverse().map((m) => {
      const time = m.ts ? new Date(m.ts).toLocaleString() : '';
      const isDoc = m.media_type === 'document' || m.media_type === 'image';
      let fileBit = '';
      if (isDoc) {
        fileBit = m.archived
          ? '<div style="margin-top:4px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
              '<a href="' + esc(mediaUrl(state.groupJid, m.id)) + '" target="_blank" rel="noreferrer" ' +
                'style="color:#7dd3fc;font-weight:700;text-decoration:none">\ud83d\udcce ' + esc(m.file_name || 'Open file') + ' \u2197</a>' +
              '<button type="button" data-blwa-drive="' + esc(m.id) + '" style="' + buttonStyle('ghost') + ';padding:4px 9px;font-size:11px">Save to Drive</button>' +
            '</div>'
          : '<div style="margin-top:4px;font-size:11.5px;color:#fbbf24">\ud83d\udcce ' + esc(m.file_name || m.media_type) +
            ' \u2014 not saved (arrived before saving was on; forward it once)</div>';
      }
      return '' +
        '<div style="padding:9px 12px;border-top:1px solid rgba(148,163,184,.12)">' +
          '<div style="display:flex;align-items:baseline;gap:9px;flex-wrap:wrap">' +
            '<span style="font-weight:800;color:' + (m.from_me ? '#6ee7b7' : '#7dd3fc') + ';font-size:12px">' + esc(m.sender || (m.from_me ? 'You' : 'Member')) + '</span>' +
            '<span style="margin-left:auto;font-size:11px;color:#64748b">' + esc(time) + '</span>' +
          '</div>' +
          '<div style="font-size:12.5px;color:#cbd5e1;margin-top:2px;white-space:pre-wrap">' + esc(m.text || '') + '</div>' +
          fileBit +
        '</div>';
    }).join('');

    const head = '<div style="font-size:11.5px;color:#64748b;margin-bottom:9px">' +
      state.chat.length + ' message(s) \u00b7 ' + (state.chatArchived || 0) + ' file(s) saved by the AI' +
      '</div>';

    host.innerHTML = head +
      '<div style="border:1px solid rgba(148,163,184,.18);border-radius:10px;overflow:hidden;max-height:420px;overflow-y:auto">' + rows + '</div>';

    host.querySelectorAll('[data-blwa-drive]').forEach((b) => {
      b.addEventListener('click', guard(() => saveMediaToDrive(wrap, state.groupJid, b.dataset.blwaDrive)));
    });
  }

  function renderBls(wrap) {
    const host = wrap.querySelector('#blwa-bls');
    if (!host) return;
    if (!state.bls.length) {
      host.innerHTML = '<div style="font-size:12.5px;color:#64748b">' +
        (state.blsLoaded ? 'Nothing found yet — press “Fetch BLs from this group”.' : 'Press “Fetch BLs from this group”.') +
        '</div>';
      return;
    }
    const rows = state.bls.map((b, i) => {
      const conts = (b.container_numbers || []).join(', ');
      const docs = (b.document_names || []).join(', ');
      return '' +
        '<tr style="border-top:1px solid rgba(148,163,184,.14)">' +
          '<td style="padding:9px 10px;font:800 12.5px ui-monospace,Consolas,monospace;color:#fbbf24;white-space:nowrap">' + esc(b.bl_number) + '</td>' +
          '<td style="padding:9px 10px;color:#cbd5e1">' + (esc(b.vessel_name) || '<span style="color:#475569">—</span>') + '</td>' +
          '<td style="padding:9px 10px;color:#38bdf8;font:600 12px ui-monospace,Consolas,monospace">' + (esc(conts) || '<span style="color:#475569">—</span>') + '</td>' +
          '<td style="padding:9px 10px;color:#94a3b8;white-space:nowrap">' + (esc(b.date) || '—') + '</td>' +
          '<td style="padding:9px 10px;color:#cbd5e1;max-width:260px">' +
            '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(b.snippet) + '">' + (esc(b.snippet) || '—') + '</div>' +
            (docs ? '<div style="font-size:11px;color:#7dd3fc;margin-top:2px">📄 ' + esc(docs) + '</div>' : '') +
          '</td>' +
          '<td style="padding:9px 10px;text-align:right;white-space:nowrap">' +
            '<button type="button" data-blwa-fill="' + i + '" style="' + buttonStyle('primary') + ';padding:6px 10px;font-size:11.5px">Use in BL form</button> ' +
            '<button type="button" data-blwa-draft="' + i + '" style="' + buttonStyle('ghost') + ';padding:6px 10px;font-size:11.5px">Save as draft</button>' +
          '</td>' +
        '</tr>';
    }).join('');

    host.innerHTML = '' +
      '<div style="font-size:12px;color:#94a3b8;margin-bottom:6px">' +
        state.bls.length + ' BL reference(s) found in the last ' + (state.scanned || 0) + ' messages.' +
      '</div>' +
      '<div style="overflow-x:auto;border:1px solid rgba(148,163,184,.18);border-radius:10px">' +
        '<table style="width:100%;border-collapse:collapse;font-size:12.5px">' +
          '<thead><tr style="background:rgba(148,163,184,.08);text-align:left;color:#94a3b8;font-size:10.5px;' +
            'text-transform:uppercase;letter-spacing:.06em">' +
            '<th style="padding:9px 10px">BL Number</th><th style="padding:9px 10px">Vessel</th>' +
            '<th style="padding:9px 10px">Containers</th><th style="padding:9px 10px">Date</th>' +
            '<th style="padding:9px 10px">Message</th><th style="padding:9px 10px;text-align:right">Action</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>';

    host.querySelectorAll('[data-blwa-fill]').forEach((b) => {
      b.addEventListener('click', guard(() => fillBlForm(state.bls[Number(b.dataset.blwaFill)])));
    });
    host.querySelectorAll('[data-blwa-draft]').forEach((b) => {
      b.addEventListener('click', guard(() => saveDraft(state.bls[Number(b.dataset.blwaDraft)])));
    });
  }

  function renderAgents(wrap) {
    const host = wrap.querySelector('#blwa-agents');
    if (!host) return;
    const a = state.assignment;
    const list = state.agents || [];
    if (state.agents === null) {
      host.innerHTML = '<div style="font-size:12.5px;color:#64748b">Loading AI staff…</div>';
      loadAgents(wrap);
      return;
    }
    if (!list.length) {
      host.innerHTML = '<div style="font-size:12.5px;color:#fbbf24;padding:10px 12px;border-radius:10px;' +
        'background:rgba(245,158,11,.08);border:1px dashed rgba(245,158,11,.35)">' +
        (state.agentsError
          ? 'Could not read the AI Staff Academy: ' + esc(state.agentsError)
          : 'No AI staff found in the Academy yet. Hire one in the AI Staff Academy, then reopen this section.') +
      '</div>';
      return;
    }
    const p = (a && a.powers) || { readBls: true, extractPdf: true, saveMedia: true, draftReplies: false, autoReply: false, notifyOwner: true };
    const power = (key, label) =>
      '<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#cbd5e1;cursor:pointer">' +
        '<input type="checkbox" data-blwa-power="' + key + '"' + (p[key] ? ' checked' : '') +
        ' style="width:15px;height:15px;accent-color:#38bdf8">' + esc(label) + '</label>';

    const options = list.map((ag) => {
      const sel = a && String(a.agentId) === String(ag.id) ? ' selected' : '';
      return '<option value="' + esc(ag.id) + '"' + sel + '>' + esc((ag.emoji || '') + ' ' + ag.name + (ag.role ? ' — ' + ag.role : '')) + '</option>';
    }).join('');

    host.innerHTML = '' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">' +
        '<div style="flex:1 1 260px">' +
          '<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:5px">AI staff member</div>' +
          '<select id="blwa-agent-select" style="width:100%;padding:9px 11px;border-radius:9px;background:#0f172a;' +
            'color:#e2e8f0;border:1px solid rgba(148,163,184,.32);font:600 13px system-ui">' +
            '<option value="">— choose staff —</option>' + options +
          '</select>' +
        '</div>' +
        '<button type="button" id="blwa-assign" style="' + buttonStyle('green', !state.groupJid) + '"' +
          (state.groupJid ? '' : ' disabled title="Select a group first"') + '>' +
          (a ? '↻ Update assignment' : '✓ Assign to this group') +
        '</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px 16px;margin-top:14px">' +
        power('readBls', 'Read BLs from this group') +
        power('extractPdf', 'Read attached BL PDFs') +
        power('saveMedia', 'Save the group\u2019s files (documents & photos)') +
        power('draftReplies', 'Draft replies for approval') +
        power('autoReply', 'Reply automatically') +
        power('notifyOwner', 'Notify me of new BLs') +
      '</div>' +
      (a
        ? '<div style="margin-top:14px;font-size:12px;color:#6ee7b7;padding:9px 12px;border-radius:9px;' +
            'background:rgba(16,185,129,.09);border:1px solid rgba(16,185,129,.35)">' +
            'Currently assigned: <b>' + esc(a.agentName || a.agentId) + '</b> · updated ' +
            esc(a.updatedAt ? new Date(a.updatedAt).toLocaleString() : '') +
          '</div>'
        : '');

    const assignBtn = host.querySelector('#blwa-assign');
    if (assignBtn && state.groupJid) assignBtn.addEventListener('click', guard(() => assignAgent(host)));
  }

  // ── step 1: group picker ─────────────────────────────────────────────────
  async function openGroupPicker(wrap) {
    const host = wrap.querySelector('#blwa-group-picker');
    if (!host) return;
    host.innerHTML = '<div style="font-size:12.5px;color:#7dd3fc">Loading WhatsApp groups…</div>';
    try {
      if (!state.groups) {
        const data = await apiFetch('/wa/groups?refresh=1');
        state.groups = Array.isArray(data.groups) ? data.groups : [];
        state.connected = !!data.connected;
        state.status = data.status || state.status;
        if (data.hint) toast(data.hint, 'error');
      }
      renderPicker(host, wrap);
    } catch (e) {
      host.innerHTML = '<div style="font-size:12.5px;color:#fca5a5">Could not load groups: ' + esc(e.message) + '</div>';
    }
  }

  function renderPicker(host, wrap) {
    const groups = state.groups || [];
    host.innerHTML = '' +
      '<div style="border:1px solid rgba(148,163,184,.25);border-radius:11px;overflow:hidden">' +
        '<div style="display:flex;gap:8px;padding:9px;background:rgba(15,23,42,.9);border-bottom:1px solid rgba(148,163,184,.18)">' +
          '<input id="blwa-group-search" type="text" placeholder="Search group name…" ' +
            'style="flex:1;padding:8px 11px;border-radius:8px;background:rgba(2,6,23,.9);color:#fff;' +
            'border:1px solid rgba(148,163,184,.28);font:600 12.5px system-ui">' +
          '<button type="button" id="blwa-group-reload" style="' + buttonStyle('ghost') + ';padding:7px 11px;font-size:12px">↻</button>' +
        '</div>' +
        '<div id="blwa-group-list" style="max-height:300px;overflow-y:auto"></div>' +
      '</div>';

    const list = host.querySelector('#blwa-group-list');
    const paint = (q) => {
      const needle = String(q || '').toLowerCase().trim();
      const shown = groups.filter(g => !needle || String(g.name || '').toLowerCase().includes(needle));
      if (!shown.length) {
        list.innerHTML = '<div style="padding:14px;font-size:12.5px;color:#64748b">' +
          (groups.length ? 'No group matches that search.' : 'No groups available.') + '</div>';
        return;
      }
      list.innerHTML = shown.slice(0, 400).map((g) => {
        const on = g.jid === state.groupJid;
        return '<button type="button" data-blwa-group="' + esc(g.jid) + '" data-blwa-gname="' + esc(g.name) + '" ' +
          'style="display:block;width:100%;text-align:left;padding:10px 13px;background:' +
          (on ? 'rgba(56,189,248,.14)' : 'transparent') + ';border:none;' +
          'border-bottom:1px solid rgba(148,163,184,.1);cursor:pointer;color:' + (on ? '#7dd3fc' : '#e2e8f0') + '">' +
          '<div style="font:700 13px system-ui">' + esc(g.name) + (on ? ' ✓' : '') + '</div>' +
          '<div style="font:11px ui-monospace,Consolas,monospace;color:#64748b">' + esc(g.jid) + '</div>' +
        '</button>';
      }).join('');

      list.querySelectorAll('[data-blwa-group]').forEach((b) => {
        b.addEventListener('click', guard(() => {
          selectGroup(b.dataset.blwaGroup, b.dataset.blwaGname, wrap);
        }));
      });
    };

    paint('');
    const search = host.querySelector('#blwa-group-search');
    if (search) search.addEventListener('input', () => paint(search.value));
    const reload = host.querySelector('#blwa-group-reload');
    if (reload) reload.addEventListener('click', guard(async () => {
      state.groups = null;
      await openGroupPicker(wrap);
    }));
  }

  function selectGroup(jid, name, wrap) {
    state.groupJid = jid || '';
    state.groupName = name || '';
    state.bls = [];
    state.blsLoaded = false;
    state.assignment = null;
    try {
      localStorage.setItem(GROUP_KEY + '::' + stationKey(), JSON.stringify({ jid: state.groupJid, name: state.groupName }));
    } catch (e) { /* private mode */ }
    renderSection(wrap);
    toast('Group selected: ' + (name || jid));
    loadAssignment(wrap);
  }

  function restoreSelection() {
    if (state.groupJid) return;
    const saved = jget(GROUP_KEY + '::' + stationKey(), null);
    if (saved && saved.jid) {
      state.groupJid = saved.jid;
      state.groupName = saved.name || '';
    }
  }

  // ── step 2: fetch BLs ────────────────────────────────────────────────────
  async function fetchBls(wrap) {
    if (!state.groupJid || state.busy) return;
    state.busy = true;
    renderSection(wrap);
    try {
      const data = await apiFetch('/wa/bls?jid=' + encodeURIComponent(state.groupJid) + '&limit=300');
      state.bls = Array.isArray(data.bls) ? data.bls : [];
      state.scanned = data.scanned || 0;
      state.blsLoaded = true;
      if (data.hint) toast(data.hint, 'error');
      else toast(state.bls.length + ' BL reference(s) found in this group');
    } catch (e) {
      state.bls = [];
      state.blsLoaded = true;
      toast('Could not fetch BLs: ' + e.message, 'error');
    } finally {
      state.busy = false;
      renderSection(wrap);
    }
  }

  // ── step 3: agents ───────────────────────────────────────────────────────
  async function loadAgents(wrap) {
    try {
      const data = await apiFetch('/wa/agents');
      state.agents = Array.isArray(data.agents) ? data.agents : [];
      state.agentsError = '';
    } catch (e) {
      state.agents = [];
      state.agentsError = e.message || 'Could not reach the AI Staff Academy.';
    }
    renderSection(wrap);
    if (state.groupJid) loadAssignment(wrap);
  }

  async function loadAssignment(wrap) {
    if (!state.groupJid) return;
    try {
      const data = await apiFetch('/wa/assignment?jid=' + encodeURIComponent(state.groupJid));
      state.assignment = data.assignment || null;
      renderAgents(wrap);
    } catch (e) { /* silent: the section still works without it */ }
  }

  async function assignAgent(host) {
    const sel = host.querySelector('#blwa-agent-select');
    const agentId = sel ? sel.value : '';
    if (!agentId) { toast('Choose an AI staff member first.', 'error'); return; }
    const agent = (state.agents || []).find(a => String(a.id) === String(agentId)) || {};
    const powers = {};
    host.querySelectorAll('[data-blwa-power]').forEach((cb) => { powers[cb.dataset.blwaPower] = !!cb.checked; });
    try {
      const data = await apiFetch('/wa/assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jid: state.groupJid,
          groupName: state.groupName,
          agentId,
          agentName: agent.name || agentId,
          powers
        })
      });
      state.assignment = data.assignment || null;
      toast('Assigned ' + (agent.name || 'AI staff') + ' to this group' +
        (data.mirroredIntoSources ? ' · added as a learning source' : ''));
      const wrap = document.getElementById('blwa-wrap');
      if (wrap) renderSection(wrap);
    } catch (e) {
      toast('Assignment failed: ' + e.message, 'error');
    }
  }

  // ── hand a fetched BL to the station form ────────────────────────────────
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : (el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function labelTextFor(field) {
    const group = field.closest('.form-group') || field.parentElement;
    if (!group) return '';
    const labels = group.querySelectorAll('label');
    for (let i = 0; i < labels.length; i++) {
      const t = (labels[i].textContent || '').trim();
      if (t) return t;
    }
    return '';
  }

  function findField(form, matcher) {
    const fields = form.querySelectorAll('input, textarea');
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.type === 'checkbox' || f.type === 'file' || f.type === 'hidden') continue;
      if (matcher(labelTextFor(f).toLowerCase())) return f;
    }
    return null;
  }

  function fillBlForm(row) {
    if (!row) return;
    const card = findStationCard();
    const form = card ? card.querySelector('form') : null;
    if (!form) {
      toast('Open the BL Checking Station form first, then try again.', 'error');
      return;
    }
    closeWhatsApp();

    const fill = (matcher, value) => {
      if (!value) return;
      const f = findField(form, matcher);
      if (f) setNativeValue(f, value);
    };

    fill(t => t.includes('bill of lading number'), row.bl_number || '');
    fill(t => t.includes('vessel'), row.vessel_name || '');
    fill(t => t.includes('seal'), row.seal_number || '');

    // Tick the matching container checkboxes (React listens to click, not change).
    const wanted = (row.container_numbers || []).map(c => String(c).toUpperCase());
    if (wanted.length) {
      form.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        const lab = cb.closest('label');
        const text = (lab ? lab.textContent : '').toUpperCase();
        if (!text) return;
        if (wanted.some(c => text.indexOf(c) !== -1) && !cb.checked) cb.click();
      });
    }

    toast('BL ' + (row.bl_number || '') + ' copied into the form — verify the details, then save.');
  }

  // ── park a fetched BL in the station's BL Drafts list ────────────────────
  function saveDraft(row) {
    if (!row) return;
    const key = stationKey();
    const all = jget(DRAFTS_KEY, {});
    const arr = Array.isArray(all[key]) ? all[key] : [];
    const now = new Date().toISOString();
    const draft = {
      id: 'bld_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      date: now.slice(0, 10),
      created_at: now,
      updated_at: now,
      bl_number: row.bl_number || '',
      dealer_name: state.groupName || '',
      lot_no: '',
      proforma_number: '',
      shipper_name: '',
      consignee_name: '',
      vessel_name: row.vessel_name || '',
      arrival_date: '',
      source: 'whatsapp',
      source_group: state.groupName || '',
      source_message_id: row.message_id || ''
    };
    const at = arr.findIndex(d => d && String(d.bl_number || '').toUpperCase() === String(draft.bl_number).toUpperCase());
    if (at >= 0) arr[at] = Object.assign({}, arr[at], draft, { id: arr[at].id });
    else arr.unshift(draft);
    all[key] = arr.slice(0, 500);
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(all));
      toast('BL ' + draft.bl_number + ' saved to BL Drafts. Reload the app (F5) to see it in the station list.');
    } catch (e) {
      toast('Could not save the draft: ' + e.message, 'error');
    }
  }

  // ── keep the tab strip present across React re-renders ───────────────────
  let scheduled = false;
  function scheduleEnsure() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      // This runs on every React re-render. A throw here would escape into the app's global
      // error overlay and blank the whole page, so a bug can only ever cost us the tab.
      try { ensureTabs(); } catch (e) { console.warn('[BL-WA] tab injection failed:', e && e.message); }
    });
  }

  function start() {
    scheduleEnsure();
    try {
      const mo = new MutationObserver(scheduleEnsure);
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* very old browser: the tab still appears on first open */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
