// ======================== NOTE BOOK API (WhatAnAgent dashboard) ========================
// Google-Keep-style notebook with AI brains: speak a voice note -> the AI writes the perfect
// paragraph; refine single paragraphs; extract tasks into AlignTasks; push notes to WhatsApp;
// import chats from the WhatsApp vault. Registered from index.js via registerNotebookRoutes(app, db).
import { doc, getDoc, setDoc, addDoc, collection, getDocs, query, orderBy, limit, deleteDoc } from 'firebase/firestore';

const NOTES = 'notes';
const ALIGNTASKS_APP_ID = '1:410197132578:web:97cfc3ae33f39ed3df917b';
const ALIGN_BASE = 'artifacts/' + ALIGNTASKS_APP_ID + '/public/data';

const sstr = (v, n = 4000) => String(v == null ? '' : v).substring(0, n);
const dubaiStamp = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)).replace(' ', 'T').slice(0, 16);

async function getAppSettings(db) {
  try { const s = await getDoc(doc(db, 'appData', 'settings')); return s.exists() ? (s.data() || {}) : {}; } catch (e) { return {}; }
}

// Multi-model text brain (Gemini / DeepSeek / Qwen) with rotation fallback - same keys as the rest of the app.
async function callNoteAI(db, systemPrompt, userText, preferred) {
  const st = await getAppSettings(db);
  const qwenKey = st.QWEN_API_KEY || process.env.QWEN_API_KEY || st.DASHSCOPE_API_KEY || '';
  const qwenBase = String(st.QWEN_BASE_URL || process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const qwenModel = st.QWEN_MODEL || process.env.QWEN_MODEL || 'qwen3.8-flash';
  const deepseekKey = st.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const geminiKey = st.GEMINI_API_KEY || process.env.GEMINI_API_KEY || st.geminiApiKey || '';
  const avail = { qwen: !!qwenKey, gemini: !!geminiKey, deepseek: !!deepseekKey };
  const pref = ['gemini', 'qwen', 'deepseek'].includes(preferred) ? preferred : 'qwen';
  const order = [];
  if (avail[pref]) order.push(pref);
  for (const p of ['qwen', 'gemini', 'deepseek']) { if (p !== pref && avail[p]) order.push(p); }

  for (const p of order) {
    try {
      if (p === 'qwen' || p === 'deepseek') {
        const url = p === 'qwen' ? (qwenBase + '/chat/completions') : 'https://api.deepseek.com/chat/completions';
        const key = p === 'qwen' ? qwenKey : deepseekKey;
        const model = p === 'qwen' ? qwenModel : 'deepseek-chat';
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({ model, temperature: 0.4, max_tokens: 1400, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }] }),
          signal: AbortSignal.timeout(45000)
        });
        if (!r.ok) { console.warn('[NOTE AI] ' + p + ' HTTP ' + r.status); continue; }
        const j = await r.json();
        const t = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
        if (t) { console.log('[NOTE AI] ✍️ answered via ' + model); return t; }
      } else if (p === 'gemini') {
        for (const gm of ['gemini-2.5-flash', 'gemini-3.6-flash']) {
          try {
            const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + gm + ':generateContent?key=' + geminiKey, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userText }] }] }),
              signal: AbortSignal.timeout(45000)
            });
            if (!r.ok) continue;
            const j = await r.json();
            const t = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text) || '').trim();
            if (t) { console.log('[NOTE AI] ✍️ answered via ' + gm); return t; }
          } catch (e) { /* try next gemini */ }
        }
      }
    } catch (e) { console.warn('[NOTE AI] ' + p + ' failed: ' + sstr(e && e.message || e, 120)); }
  }
  return '';
}

async function loadNoteWithBlocks(db, id) {
  const noteSnap = await getDoc(doc(db, NOTES, id));
  if (!noteSnap.exists()) return null;
  const blocksSnap = await getDocs(query(collection(db, NOTES, id, 'blocks'), orderBy('seq', 'asc')));
  const blocks = [];
  blocksSnap.forEach((d) => blocks.push(Object.assign({ id: d.id }, d.data() || {})));
  return { note: Object.assign({ id: id }, noteSnap.data() || {}), blocks };
}

async function nextSeq(db, id) {
  const blocksSnap = await getDocs(query(collection(db, NOTES, id, 'blocks'), orderBy('seq', 'desc'), limit(1)));
  let max = 0;
  blocksSnap.forEach((d) => { max = Number((d.data() || {}).seq) || 0; });
  return max + 1;
}

async function touchNote(db, id, patch) {
  await setDoc(doc(db, NOTES, id), Object.assign({ updatedAt: Date.now() }, patch || {}), { merge: true });
}

// --- Create an AlignTasks task straight from extracted note items (same rules as boss orders:
// no person named -> General list; a person named -> their individual list) ---
async function createNoteAlignTask(db, t, parsedWhen) {
  const description = sstr(t.description || t.task || '', 200).trim();
  if (!description) return { ok: false, error: 'Empty task' };
  let dueValue = '';
  let dueTs = 0;
  if (parsedWhen && parsedWhen > Date.now() - 60000) { dueTs = parsedWhen; dueValue = dubaiStamp(parsedWhen); }
  const assignee = sstr(t.assignee || '', 60).trim();
  if (!assignee) {
    await addDoc(collection(db, ALIGN_BASE + '/tasks_for_all'), {
      description, dueDate: dueValue, status: 'To Do', comments: [], createdAt: new Date(),
      createdBy: 'note-extract', ownerAdminUid: '', ownerAdminEmail: ''
    });
    return { ok: true, where: 'General Tasks (For All)' };
  }
  const staffSnap = await getDocs(collection(db, ALIGN_BASE + '/staff'));
  const q = assignee.toLowerCase();
  let match = null;
  staffSnap.forEach((d) => {
    const v = d.data() || {};
    const nm = String(v.name || '').toLowerCase();
    if (!match && nm && (nm === q || nm.includes(q) || q.includes(nm.split(' ')[0]))) match = Object.assign({ id: d.id }, v);
  });
  if (!match) {
    await addDoc(collection(db, ALIGN_BASE + '/tasks_for_all'), {
      description: description + ' (for ' + assignee + ')', dueDate: dueValue, status: 'To Do', comments: [], createdAt: new Date(),
      createdBy: 'note-extract', ownerAdminUid: '', ownerAdminEmail: ''
    });
    return { ok: true, where: 'General Tasks (no member matched "' + assignee + '")' };
  }
  await addDoc(collection(db, ALIGN_BASE + '/tasks'), {
    description, assigneeEmail: String(match.email || '').toLowerCase(), dueDate: dueValue, status: 'To Do', comments: [],
    createdAt: new Date(), createdBy: 'note-extract', ownerAdminUid: match.uid || '', ownerAdminEmail: '', setAlarm: false
  });
  return { ok: true, where: match.name || match.email };
}

export function registerNotebookRoutes(app, db) {

  // ---------- Notes CRUD ----------
  app.get('/api/notes', async (req, res) => {
    try {
      const snap = await getDocs(query(collection(db, NOTES), orderBy('updatedAt', 'desc'), limit(100)));
      const notes = [];
      snap.forEach((d) => {
        const v = d.data() || {};
        notes.push({
          id: d.id, title: v.title || '', preview: v.preview || '', color: v.color || '', pinned: !!v.pinned,
          archived: !!v.archived, trashed: !!v.trashed, labels: v.labels || [], model: v.model || 'qwen',
          segmentCount: v.segmentCount || 0, updatedAt: v.updatedAt || 0, createdAt: v.createdAt || 0
        });
      });
      res.json(notes);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/notes', async (req, res) => {
    try {
      const b = req.body || {};
      const payload = {
        title: sstr(b.title || '', 160).trim() || 'Untitled note',
        preview: '', color: b.color || '', pinned: false, archived: false, trashed: false,
        labels: [], model: ['gemini', 'qwen', 'deepseek'].includes(b.model) ? b.model : 'qwen',
        segmentCount: 0, createdBy: 'dashboard', createdAt: Date.now(), updatedAt: Date.now()
      };
      const ref = await addDoc(collection(db, NOTES), payload);
      res.json({ success: true, id: ref.id, note: Object.assign({ id: ref.id }, payload) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/notes/:id', async (req, res) => {
    try {
      const data = await loadNoteWithBlocks(db, req.params.id);
      if (!data) return res.status(404).json({ error: 'Note not found' });
      res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/notes/:id', async (req, res) => {
    try {
      const b = req.body || {};
      const patch = {};
      if (typeof b.title === 'string') patch.title = sstr(b.title, 160);
      if (typeof b.model === 'string' && ['gemini', 'qwen', 'deepseek'].includes(b.model)) patch.model = b.model;
      if (typeof b.color === 'string') patch.color = sstr(b.color, 20);
      if (typeof b.pinned === 'boolean') patch.pinned = b.pinned;
      if (typeof b.archived === 'boolean') patch.archived = b.archived;
      if (typeof b.trashed === 'boolean') patch.trashed = b.trashed;
      if (Array.isArray(b.labels)) patch.labels = b.labels.map((l) => sstr(l, 30)).filter(Boolean).slice(0, 12);
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
      await touchNote(db, req.params.id, patch);
      res.json({ success: true, patch });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/notes/:id', async (req, res) => {
    try {
      const id = req.params.id;
      if (req.query.purge === '1') {
        const blocksSnap = await getDocs(collection(db, NOTES, id, 'blocks'));
        for (const d of blocksSnap.docs) await deleteDoc(d.ref);
        await deleteDoc(doc(db, NOTES, id));
        return res.json({ success: true, purged: true });
      }
      await touchNote(db, id, { trashed: true, trashedAt: Date.now() });
      res.json({ success: true, trashed: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- Blocks ----------
  app.post('/api/notes/:id/blocks', async (req, res) => {
    try {
      const id = req.params.id;
      const b = req.body || {};
      const type = ['paragraph', 'todo', 'code', 'table'].includes(b.type) ? b.type : 'paragraph';
      const text = sstr(b.text || '', 8000);
      if (!text.trim()) return res.status(400).json({ error: 'Empty block' });
      const block = { seq: await nextSeq(db, id), type, text, checked: false, versions: [], source: 'manual', status: 'done', createdAt: Date.now() };
      const ref = await addDoc(collection(db, NOTES, id, 'blocks'), block);
      await touchNote(db, id, { preview: text.substring(0, 120), segmentCount: (await nextSeq(db, id)) - 1 });
      res.json({ success: true, block: Object.assign({ id: ref.id }, block) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/notes/:id/block-update', async (req, res) => {
    try {
      const { blockId, text, checked, undo } = req.body || {};
      if (!blockId) return res.status(400).json({ error: 'Missing blockId' });
      const ref = doc(db, NOTES, req.params.id, 'blocks', blockId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return res.status(404).json({ error: 'Block not found' });
      const cur = snap.data() || {};
      if (undo) {
        const versions = Array.isArray(cur.versions) ? cur.versions.slice() : [];
        const prev = versions.pop();
        if (!prev) return res.status(400).json({ error: 'Nothing to undo' });
        await setDoc(ref, { text: prev.text, versions: versions, updatedAt: Date.now() }, { merge: true });
        return res.json({ success: true, text: prev.text });
      }
      const patch = { updatedAt: Date.now() };
      if (typeof text === 'string') patch.text = sstr(text, 8000);
      if (typeof checked === 'boolean') patch.checked = checked;
      await setDoc(ref, patch, { merge: true });
      await touchNote(db, req.params.id, {});
      res.json({ success: true, patch });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/notes/:id/block-delete', async (req, res) => {
    try {
      const { blockId } = req.body || {};
      if (!blockId) return res.status(400).json({ error: 'Missing blockId' });
      await deleteDoc(doc(db, NOTES, req.params.id, 'blocks', blockId));
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- ⭐ CORE: audio -> AI paragraph (append to THIS note) ----------
  app.post('/api/notes/:id/audio', async (req, res) => {
    try {
      const id = req.params.id;
      const { audioBase64, mimeType, instruction } = req.body || {};
      if (!audioBase64) return res.status(400).json({ error: 'No audio received' });
      const buf = Buffer.from(String(audioBase64), 'base64');
      if (!buf.length) return res.status(400).json({ error: 'Empty audio' });
      if (buf.length > 12 * 1024 * 1024) return res.status(413).json({ error: 'Audio too large (max 12MB)' });

      const { transcribeAudioBuffer } = await import('./waWebClient.js');
      const transcript = sstr(await transcribeAudioBuffer(buf, mimeType || 'audio/webm'), 4000).trim();
      if (!transcript) return res.status(422).json({ error: 'Could not understand the audio - please try again.' });

      const data = await loadNoteWithBlocks(db, id);
      if (!data) return res.status(404).json({ error: 'Note not found' });
      const note = data.note || {};
      const blocks = data.blocks || [];
      const tail = blocks.slice(-3).map((b) => sstr(b.text || '', 600)).filter(Boolean).join('\n---\n');

      const system = 'You are the note-writing brain inside a professional business notebook. ' +
        'You receive the tail of an existing note and the raw transcript of what the user just SPOKE, plus an optional instruction. ' +
        'Write ONLY the next paragraph(s) that belong in this note - continuous with the existing text, same language as the user spoke (Roman Urdu or English). ' +
        'NEVER use Devanagari/Hindi script. No headings, no labels, no quotes around the paragraph, no commentary - just the paragraph text. ' +
        'If the instruction says to make a list/to-do/steps, format it as short lines with "- " prefixes.';
      const user = 'Existing note tail:\n' + (tail || '(this is the beginning of the note)') +
        '\n\nRaw transcript of what the user just spoke:\n"' + transcript + '"' +
        '\n\nInstruction attached to this recording: ' + (instruction && String(instruction).trim() ? '"' + sstr(instruction, 300) + '"' : '(none)') +
        '\n\nWrite the next paragraph now.';

      const ai = await callNoteAI(db, system, user, note.model || 'qwen');
      const text = sstr((ai || transcript).trim(), 8000);

      const seq = await nextSeq(db, id);
      const block = {
        seq, type: 'paragraph', text,
        transcriptRaw: transcript.substring(0, 2000),
        instruction: sstr(instruction || '', 300),
        audioB64: String(audioBase64).substring(0, 650000),
        mimeType: mimeType || 'audio/webm',
        model: note.model || 'qwen', source: 'audio', status: 'done', versions: [], createdAt: Date.now()
      };
      const ref = await addDoc(collection(db, NOTES, id, 'blocks'), block);
      const patch = { preview: text.substring(0, 120), segmentCount: seq };
      if (!note.title || note.title === 'Untitled note') patch.title = text.substring(0, 60);
      await touchNote(db, id, patch);
      console.log('[NOTEBOOK] 🎤 AI paragraph appended to note ' + id + ' (' + text.length + ' chars)');
      res.json({ success: true, transcript, block: Object.assign({ id: ref.id }, block) });
    } catch (e) {
      console.error('[NOTEBOOK] audio failed:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ---------- ✨ Refine ONE paragraph (text or voice instruction) — keeps version history ----------
  app.post('/api/notes/:id/refine', async (req, res) => {
    try {
      const id = req.params.id;
      const { blockId, instruction, audioBase64, mimeType } = req.body || {};
      if (!blockId) return res.status(400).json({ error: 'Missing blockId' });
      let instr = sstr(instruction || '', 400).trim();
      if (!instr && audioBase64) {
        const { transcribeAudioBuffer } = await import('./waWebClient.js');
        instr = sstr(await transcribeAudioBuffer(Buffer.from(String(audioBase64), 'base64'), mimeType || 'audio/webm'), 400).trim();
      }
      if (!instr) return res.status(400).json({ error: 'Tell the AI what to change (text or voice)' });
      const ref = doc(db, NOTES, id, 'blocks', blockId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return res.status(404).json({ error: 'Block not found' });
      const cur = snap.data() || {};
      const noteSnap = await getDoc(doc(db, NOTES, id));
      const note = noteSnap.exists() ? (noteSnap.data() || {}) : {};
      const system = 'You are editing ONE paragraph of a business note. Rewrite the paragraph according to the instruction. ' +
        'Keep the language (Roman Urdu/English), NEVER use Devanagari. Output ONLY the rewritten paragraph text - no quotes, no commentary.';
      const user = 'Current paragraph:\n"' + sstr(cur.text || '', 4000) + '"\n\nInstruction: "' + instr + '"\n\nRewrite it now.';
      const ai = await callNoteAI(db, system, user, note.model || 'qwen');
      if (!ai) return res.status(502).json({ error: 'AI could not rewrite right now - try again.' });
      const versions = (Array.isArray(cur.versions) ? cur.versions : []).concat([{ text: sstr(cur.text || '', 8000), at: Date.now() }]).slice(-5);
      await setDoc(ref, { text: sstr(ai, 8000), versions, updatedAt: Date.now() }, { merge: true });
      await touchNote(db, id, {});
      res.json({ success: true, text: ai, instruction: instr });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- ✅ Extract action items -> AlignTasks ----------
  app.post('/api/notes/:id/extract-tasks', async (req, res) => {
    try {
      const id = req.params.id;
      const body = req.body || {};
      const data = await loadNoteWithBlocks(db, id);
      if (!data) return res.status(404).json({ error: 'Note not found' });

      if (body.apply) {
        const { parseBossWhen } = await import('./waWebClient.js');
        const results = [];
        for (const t of (Array.isArray(body.tasks) ? body.tasks : []).slice(0, 30)) {
          let whenMs = 0;
          const dueText = sstr(t.due || '', 60);
          if (dueText) { try { whenMs = parseBossWhen(dueText); } catch (e) { whenMs = 0; } }
          const r = await createNoteAlignTask(db, t, whenMs);
          results.push(Object.assign({ description: t.description, ok: r.ok, where: r.where }, r));
        }
        return res.json({ success: true, results });
      }

      const allText = (data.blocks || []).map((b) => sstr(b.text || '', 1500)).filter(Boolean).join('\n---\n').substring(0, 8000);
      if (!allText) return res.status(400).json({ error: 'The note has no text yet' });
      const system = 'You extract actionable tasks from business notes. Return ONLY a JSON array (no markdown fences, no commentary) of objects: ' +
        '[{"description":"clear task text","assignee":"person name or empty","due":"time text like tomorrow 9am or empty"}]. ' +
        'Only include REAL action items. Assignee only when the note clearly names a person for that task. Max 20 items.';
      const ai = await callNoteAI(db, system, 'Note content:\n' + allText, data.note.model || 'qwen');
      let tasks = [];
      try {
        const s = ai.indexOf('[');
        const e = ai.lastIndexOf(']');
        if (s >= 0 && e > s) tasks = JSON.parse(ai.substring(s, e + 1));
      } catch (err) { tasks = []; }
      if (!Array.isArray(tasks)) tasks = [];
      tasks = tasks.filter((t) => t && String(t.description || '').trim()).slice(0, 20);
      res.json({ success: true, tasks });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 📤 Push note text to WhatsApp ----------
  app.post('/api/notes/:id/push-whatsapp', async (req, res) => {
    try {
      const { target, text } = req.body || {};
      const msg = sstr(text || '', 3000).trim();
      if (!msg) return res.status(400).json({ error: 'Nothing to send' });
      const raw = sstr(target || '', 80).trim();
      if (!raw) return res.status(400).json({ error: 'Give a contact name or WhatsApp number' });
      let phone = raw.replace(/[^0-9]/g, '');
      if (!phone || phone.length < 8) {
        // resolve from the universal Contact Book by name
        const cb = await getDocs(collection(db, 'contactBook'));
        const q = raw.toLowerCase();
        let found = '';
        cb.forEach((d) => {
          if (found) return;
          const v = d.data() || {};
          const nm = String(v.name || '').toLowerCase();
          if (nm && (nm === q || nm.includes(q))) found = String(v.phone || d.id || '').replace(/[^0-9]/g, '');
        });
        if (!found) return res.status(404).json({ error: 'No contact matches "' + raw + '" - use a number or save the contact first.' });
        phone = found;
      }
      const { sendWaWebMessage } = await import('./waWebClient.js');
      await sendWaWebMessage(phone + '@s.whatsapp.net', msg);
      res.json({ success: true, to: '+' + phone });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- 📥 Import a WhatsApp chat into a note ----------
  app.post('/api/notes/import-whatsapp', async (req, res) => {
    try {
      const raw = sstr((req.body || {}).target || '', 80).trim();
      if (!raw) return res.status(400).json({ error: 'Give a chat name or number' });
      const { getWaWebChats, getWaWebMessages } = await import('./waWebClient.js');
      const chats = getWaWebChats() || [];
      const q = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
      const digits = raw.replace(/[^0-9]/g, '');
      let found = null;
      for (const c of chats) {
        const nm = String(c.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const ph = String(c.phone || c.id || '').replace(/[^0-9]/g, '');
        if ((digits && ph && ph.includes(digits)) || (q && nm && nm.includes(q))) { found = c; break; }
      }
      if (!found) return res.status(404).json({ error: 'No chat matches "' + raw + '"' });
      const msgs = await getWaWebMessages(found.id) || [];
      if (!msgs.length) return res.status(422).json({ error: 'That chat has no messages in the archive' });
      const recent = msgs.slice(-200);
      const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const title = 'WhatsApp: ' + (found.name || found.id) + ' — ' + dateStr;
      const noteRef = await addDoc(collection(db, NOTES), {
        title, preview: 'Imported WhatsApp conversation (' + recent.length + ' messages)', color: '#e8f5e9',
        pinned: false, archived: false, trashed: false, labels: ['WhatsApp'], model: 'qwen',
        segmentCount: 0, createdBy: 'dashboard', createdAt: Date.now(), updatedAt: Date.now()
      });
      let seq = 0;
      for (const m of recent) {
        seq++;
        const t = m.timestamp ? new Date(m.timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        const who = m.fromMe ? 'Me' : (m.senderName || found.name || 'Them');
        const body = (m.text || (m.mediaType ? '[' + m.mediaType + (m.mediaInfo && m.mediaInfo.caption ? ': ' + m.mediaInfo.caption : '') + ']' : '')).substring(0, 2000);
        await addDoc(collection(db, NOTES, noteRef.id, 'blocks'), {
          seq, type: 'paragraph', text: (t ? t + ' — ' : '') + who + ': ' + body,
          checked: false, versions: [], source: 'whatsapp-import', status: 'done', createdAt: Date.now()
        });
      }
      await setDoc(doc(db, NOTES, noteRef.id), { segmentCount: seq, updatedAt: Date.now() }, { merge: true });
      console.log('[NOTEBOOK] 📥 Imported ' + seq + ' messages from ' + found.name + ' into note ' + noteRef.id);
      res.json({ success: true, noteId: noteRef.id, count: seq });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- ⏰ Remind me about this note (delivered via WhatsApp like boss reminders) ----------
  app.post('/api/notes/:id/remind', async (req, res) => {
    try {
      const whenText = sstr((req.body || {}).whenText || '', 80).trim();
      if (!whenText) return res.status(400).json({ error: 'Say when (e.g. tomorrow 9am)' });
      const { parseBossWhen } = await import('./waWebClient.js');
      const runAt = parseBossWhen(whenText);
      if (!runAt || runAt < Date.now()) return res.status(400).json({ error: 'Could not understand the time - try "tomorrow 9am" or "in 30 minutes"' });
      const noteSnap = await getDoc(doc(db, NOTES, req.params.id));
      const title = noteSnap.exists() ? ((noteSnap.data() || {}).title || 'Note') : 'Note';
      const ref = doc(db, 'appData', 'bossReminders');
      const snap = await getDoc(ref);
      const items = snap.exists() ? (snap.data().items || []) : [];
      const reminder = { id: 'rem-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6), text: '📓 Note reminder: ' + sstr(title, 80), runAt, status: 'pending', createdAt: Date.now() };
      items.push(reminder);
      await setDoc(ref, { items: items.slice(-200) }, { merge: true });
      res.json({ success: true, reminder });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('[NOTEBOOK] 📓 Note Book API registered (notes, AI audio paragraphs, refine, AlignTasks extraction, WhatsApp push/import, reminders)');
}
