// ============================================================================
// 📱 BL Checking Station — "Interaction with WhatsApp"
// ============================================================================
// WHY THIS EXISTS
// The Containers & Lots app (ProformaTracker) has a BL Checking Station where a
// Bill of Lading is keyed in and verified before it enters the register. In real
// life those BLs arrive in a WhatsApp group: the shipping agent posts the BL
// number, the vessel, the containers and the PDF. This module gives that station
// the two things it needs to work from WhatsApp instead of from memory:
//
//   1. SELECT WHATSAPP GROUP  — the groups the linked WhatsApp Web account is a
//      member of, so the owner picks the working group once.
//   2. BLs FETCHED FROM GROUP — the messages of that group are read and the BL
//      numbers / vessel / seal / containers / attached PDF names are extracted,
//      so a BL can be pulled into the station instead of retyped.
//
// It also stores WHICH AI STAFF MEMBER (from the AI Staff Academy) runs that
// group and with what powers, and mirrors the group into that agent's learning
// sources so the assignment is real, not decorative.
//
// ROUTES (under /candl/api/wa, next to the file service — no second server):
//   GET    /status                 WhatsApp Web connection state
//   GET    /groups?refresh=1       groups this WhatsApp account belongs to
//   GET    /agents                 AI Staff Academy staff (read-only summary)
//   GET    /assignment?jid=        who runs this group, and with what powers
//   POST   /assignment             assign an AI staff member to the group
//   DELETE /assignment?jid=        clear the assignment
//   GET    /bls?jid=&limit=        BLs extracted from that group's messages
//
// SECURITY
// These routes are read-mostly and are reached from the Proforma app, which has
// no server session of its own (its records live in the browser). Set
// CANDL_WA_KEY in the environment to require the header `x-candl-key`; without
// that variable the routes behave like the rest of /candl/api (open to the app).
// ============================================================================
import fs from 'fs';
import path from 'path';
import { getAgent, listAgents, saveAgent } from './agentsStore.mjs';
import { fetchWaGroupsLive, getWaWebChats, getWaWebStatus, readChatMessagesForOwner } from './waWebClient.js';

const PREFIX = '/candl/api/wa';
const DATA_DIR = process.env.CANDL_DATA_DIR || path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'candl-wa-groups.json');

const sstr = (v, n = 300) => String(v == null ? '' : v).slice(0, n);

// ── Assignment store (small JSON file; the records themselves stay in the app) ─
function readStore() {
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && obj.assignments && typeof obj.assignments === 'object') return obj;
  } catch (e) { /* missing or unreadable: start clean */ }
  return { assignments: {} };
}

function writeStore(store) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STORE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, STORE_FILE);
  } catch (e) {
    console.warn('[CANDL-WA] could not save assignment store:', e.message);
  }
}

// ── WhatsApp reads (never throw: the station must still render when offline) ──
async function safeGroups(force) {
  try {
    const live = await fetchWaGroupsLive(force);
    if (Array.isArray(live) && live.length) {
      return live
        .filter(g => g && g.jid && String(g.jid).endsWith('@g.us'))
        .map(g => ({ jid: String(g.jid), name: sstr(g.name, 120) || 'Unnamed group' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch (e) { /* fall through to the cached chat list */ }
  try {
    return (getWaWebChats() || [])
      .filter(c => c && c.isGroup && String(c.id || '').endsWith('@g.us'))
      .map(c => ({ jid: String(c.id), name: sstr(c.name || c.subject, 120) || 'Group' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    return [];
  }
}

function waStatus() {
  try {
    const st = getWaWebStatus() || {};
    return {
      connected: st.status === 'connected',
      status: st.status || 'disconnected',
      phone: (st.user && st.user.phone) || '',
      name: (st.user && st.user.name) || ''
    };
  } catch (e) {
    return { connected: false, status: 'unavailable', phone: '', name: '' };
  }
}

// ── BL extraction from plain WhatsApp text ───────────────────────────────────
// Deliberately conservative: a candidate must look like a real BL reference
// (letters + digits) so ordinary chatter never becomes a BL row.
const CONTAINER_RE = /\b([A-Z]{4}\d{7})\b/g;

function digitsIn(s) {
  return (String(s || '').match(/\d/g) || []).length;
}

function looksLikeBl(ref) {
  const t = String(ref || '').trim().toUpperCase();
  if (t.length < 5 || t.length > 26) return false;
  if (!/^[A-Z0-9][A-Z0-9\-/]*$/.test(t)) return false;
  return digitsIn(t) >= 2;
}

function blRefsIn(text) {
  const out = [];
  const src = String(text || '');
  const patterns = [
    /\bB\s*\/\s*L\s*(?:NO\.?|NUMBER|NUM|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/]{3,25})/gi,
    /\bBL\s*(?:NO\.?|NUMBER|NUM|#)?\s*[:\-]\s*([A-Z0-9][A-Z0-9\-/]{3,25})/gi,
    /\bBILL\s+OF\s+LADING\s*(?:NO\.?|NUMBER|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/]{3,25})/gi
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const ref = String(m[1] || '').replace(/[.,;)]+$/, '');
      if (looksLikeBl(ref)) out.push(ref.toUpperCase());
    }
  }
  return out;
}

/**
 * A BL PDF that arrives as a document usually has the number in its file name:
 *   "BL-2026-0142.pdf", "Bill of Lading MEDUXX123456.pdf", "SHA1234567890 BL.pdf".
 */
function blRefsInFileName(name) {
  const raw = String(name || '');
  if (!raw) return [];
  if (!/bl|b\s*\/?\s*l|lading|bill/i.test(raw)) return [];
  const out = blRefsIn(raw.replace(/\.[a-z0-9]{2,5}$/i, ''));
  if (out.length) return out;
  const bare = raw.replace(/\.[a-z0-9]{2,5}$/i, '');
  const token = (bare.match(/[A-Z0-9][A-Z0-9\-/]{4,24}/gi) || []).find(looksLikeBl);
  return token ? [token.toUpperCase()] : [];
}

function vesselIn(text) {
  const m = String(text || '').match(/\bvessel(?:\s*\/\s*carrier)?(?:\s*name)?\s*[:\-–]?\s*([^\n\r,;|]{3,70})/i);
  return m ? cutAt(m[1], /\b(containers?|seals?|ports?|shippers?|consignees?|agent|b\s*\/?\s*l|bill\s+of)\b/i) : '';
}

function sealIn(text) {
  const m = String(text || '').match(/\bseal(?:\s*(?:no|number)\.?)?\s*[:\-–]?\s*([A-Za-z0-9\-]{3,30})/i);
  return m ? cutAt(m[1], /\b(containers?|vessels?|ports?|agent)\b/i) : '';
}

/** Trim a captured value at the first business keyword that follows it. */
function cutAt(value, stopRe) {
  const s = String(value || '').trim();
  const m = s.match(stopRe);
  const out = (m && m.index > 0 ? s.slice(0, m.index) : s).trim().replace(/[\s:,\-]+$/, '');
  return out.length >= 3 ? out : '';
}

function containersIn(text) {
  const found = new Set();
  const src = String(text || '');
  CONTAINER_RE.lastIndex = 0;
  let m;
  while ((m = CONTAINER_RE.exec(src))) found.add(m[1].toUpperCase());
  return Array.from(found);
}

/**
 * Turn one chat into BL rows, newest message wins per BL number.
 * @returns {Array<object>} rows sorted newest-first
 */
export function extractBlRows(messages, group) {
  const byRef = new Map();

  const put = (ref, patch) => {
    const key = String(ref || '').toUpperCase();
    if (!key) return;
    const prev = byRef.get(key) || {
      bl_number: key,
      group_jid: group.jid,
      group_name: group.name,
      vessel_name: '',
      seal_number: '',
      container_numbers: [],
      document_names: [],
      sender: '',
      date: '',
      snippet: '',
      message_id: '',
      found_in: []
    };
    const next = { ...prev, ...patch };
    next.container_numbers = Array.from(new Set([...(prev.container_numbers || []), ...((patch && patch.container_numbers) || [])]));
    next.document_names = Array.from(new Set([...(prev.document_names || []), ...((patch && patch.document_names) || [])]));
    next.found_in = Array.from(new Set([...(prev.found_in || []), ...((patch && patch.found_in) || [])]));
    // Newest message wins for the descriptive fields.
    if (!prev.message_ts || (patch && patch.message_ts && patch.message_ts >= prev.message_ts)) {
      next.vessel_name = (patch && patch.vessel_name) || prev.vessel_name || '';
      next.seal_number = (patch && patch.seal_number) || prev.seal_number || '';
      next.sender = (patch && patch.sender) || prev.sender || '';
      next.date = (patch && patch.date) || prev.date || '';
      next.snippet = (patch && patch.snippet) || prev.snippet || '';
      next.message_id = (patch && patch.message_id) || prev.message_id || '';
      next.message_ts = (patch && patch.message_ts) || prev.message_ts || 0;
    }
    byRef.set(key, next);
  };

  for (const msg of messages || []) {
    if (!msg) continue;
    const text = String(msg.text || '');
    const fileName = (msg.mediaInfo && msg.mediaInfo.fileName) || '';
    const caption = (msg.mediaInfo && msg.mediaInfo.caption) || '';
    const hay = [text, caption].filter(Boolean).join('\n');
    const ts = Number(msg.timestamp) || 0;
    const base = {
      sender: sstr(msg.fromMe ? 'You' : (msg.senderName || 'Member'), 80),
      date: ts ? new Date(ts).toISOString().slice(0, 10) : '',
      message_id: sstr(msg.id, 80),
      message_ts: ts,
      snippet: sstr(hay.replace(/\s+/g, ' ').trim(), 240),
      vessel_name: vesselIn(hay),
      seal_number: sealIn(hay),
      container_numbers: containersIn(hay)
    };

    const refs = new Set(blRefsIn(hay));
    // A BL PDF usually repeats the number already typed in the message, so the file name is
    // only used as a fallback — otherwise one BL would appear twice (once per source).
    if (!refs.size) {
      for (const r of blRefsInFileName(fileName)) refs.add(r);
    }
    if (!refs.size) continue;

    for (const ref of refs) {
      put(ref, {
        ...base,
        found_in: /lading|bill\s+of/i.test(hay) ? ['message'] : ['reference'],
        document_names: fileName ? [sstr(fileName, 160)] : []
      });
    }
  }

  return Array.from(byRef.values())
    .sort((a, b) => (b.message_ts || 0) - (a.message_ts || 0))
    .map(({ message_ts, ...row }) => row);
}

// ── Routes ───────────────────────────────────────────────────────────────────
export function registerCandlWhatsAppRoutes(app) {
  const expectedKey = String(process.env.CANDL_WA_KEY || '').trim();
  const guard = (req, res, next) => {
    if (!expectedKey) return next();
    const given = String(req.headers['x-candl-key'] || req.query.key || '').trim();
    if (given !== expectedKey) return res.status(401).json({ ok: false, error: 'Bad CANDL_WA_KEY' });
    return next();
  };

  app.get(PREFIX + '/status', guard, (req, res) => {
    res.json({ ok: true, ...waStatus() });
  });

  app.get(PREFIX + '/groups', guard, async (req, res) => {
    const force = String(req.query.refresh || '') === '1';
    const groups = await safeGroups(force);
    const st = waStatus();
    res.json({
      ok: true,
      total: groups.length,
      groups: groups.slice(0, 2000),
      connected: st.connected,
      status: st.status,
      phone: st.phone,
      hint: groups.length ? '' : (st.connected
        ? 'No groups found yet — WhatsApp Web is still loading the group list. Press refresh.'
        : 'WhatsApp Web is not connected on this server. Connect it in the dashboard first.')
    });
  });

  app.get(PREFIX + '/agents', guard, async (req, res) => {
    try {
      const agents = await listAgents({ fresh: String(req.query.refresh || '') === '1' });
      res.json({
        ok: true,
        agents: (agents || []).map(a => ({
          id: a.id,
          name: sstr(a.name, 120),
          role: sstr(a.role, 80),
          emoji: a.emoji || '🧑‍💼',
          status: a.status || 'active',
          autonomy: a.autonomy || 'auto',
          isDefault: !!a.isDefault
        }))
      });
    } catch (e) {
      res.json({ ok: true, agents: [], error: sstr(e.message, 160) });
    }
  });

  app.get(PREFIX + '/assignment', guard, (req, res) => {
    const jid = sstr(req.query.jid, 120).trim();
    const store = readStore();
    if (!jid) return res.json({ ok: true, assignments: Object.values(store.assignments) });
    return res.json({ ok: true, assignment: store.assignments[jid] || null });
  });

  app.post(PREFIX + '/assignment', guard, async (req, res) => {
    try {
      const body = req.body || {};
      const jid = sstr(body.jid, 120).trim();
      if (!jid || !jid.endsWith('@g.us')) {
        return res.status(400).json({ ok: false, error: 'A WhatsApp GROUP id (…@g.us) is required.' });
      }
      const powersRaw = body.powers && typeof body.powers === 'object' ? body.powers : {};
      const record = {
        jid,
        groupName: sstr(body.groupName, 160) || jid,
        agentId: sstr(body.agentId, 80),
        agentName: sstr(body.agentName, 120),
        powers: {
          readBls: powersRaw.readBls !== false,
          extractPdf: powersRaw.extractPdf !== false,
          draftReplies: !!powersRaw.draftReplies,
          autoReply: !!powersRaw.autoReply,
          notifyOwner: powersRaw.notifyOwner !== false
        },
        note: sstr(body.note, 300),
        updatedAt: Date.now()
      };
      if (!record.agentId) return res.status(400).json({ ok: false, error: 'Choose an AI staff member to assign.' });

      const store = readStore();
      store.assignments[jid] = record;
      writeStore(store);

      // Make the assignment real: the group becomes a learning source of that agent.
      // If the academy storage is unavailable we still keep the local record.
      let mirrored = false;
      try {
        const agent = await getAgent(record.agentId, { fresh: true });
        if (agent) {
          const sources = Array.isArray(agent.sources) ? agent.sources.slice() : [];
          if (!sources.some(s => s && s.jid === jid)) {
            sources.push({
              jid,
              name: record.groupName,
              isGroup: true,
              addedAt: Date.now(),
              lastLearnedAt: null,
              messagesRead: 0,
              runs: 0,
              confidence: 0,
              learned: { style: '', facts: [], topics: [], at: null }
            });
          }
          await saveAgent(record.agentId, { sources: sources.slice(0, 40) });
          mirrored = true;
        }
      } catch (e) {
        console.warn('[CANDL-WA] could not mirror group into agent sources:', e.message);
      }

      res.json({ ok: true, assignment: record, mirroredIntoSources: mirrored });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  app.delete(PREFIX + '/assignment', guard, (req, res) => {
    const jid = sstr(req.query.jid, 120).trim();
    if (!jid) return res.status(400).json({ ok: false, error: 'jid is required' });
    const store = readStore();
    delete store.assignments[jid];
    writeStore(store);
    res.json({ ok: true });
  });

  app.get(PREFIX + '/bls', guard, async (req, res) => {
    const jid = sstr(req.query.jid, 120).trim();
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 250, 20), 500);
    if (!jid) return res.status(400).json({ ok: false, error: 'jid (the WhatsApp group id) is required.' });
    if (!jid.endsWith('@g.us')) return res.status(400).json({ ok: false, error: 'Select a WhatsApp GROUP, not an individual chat.' });

    const groups = await safeGroups(false);
    const group = groups.find(g => g.jid === jid) || { jid, name: jid };

    let messages = [];
    try {
      messages = await readChatMessagesForOwner(jid, limit);
    } catch (e) {
      return res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }

    const bls = extractBlRows(messages, group);
    res.json({
      ok: true,
      group,
      scanned: messages.length,
      total: bls.length,
      bls,
      hint: messages.length
        ? (bls.length ? '' : 'No BL reference found in the last ' + messages.length + ' messages of this group.')
        : 'No messages for this group on this server yet. Open the group once in WhatsApp Web so its history syncs, then fetch again.'
    });
  });

  console.log('[CANDL-WA] 📱 BL Checking Station WhatsApp routes ready at ' + PREFIX +
    (expectedKey ? ' (key required)' : ''));
}
