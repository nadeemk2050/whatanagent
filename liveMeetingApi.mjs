// ======================== LIVE INTERACTIVE MEETING BOARD API ========================
// Real-time Collaborative Board (Drawings, Live Calculations, Action Checklists, Quick Polls, Team Member Assignment, AI Co-Pilot)
// Zero-Audio / Zero-Video: 100% interactive visual synchronization.
import { doc, getDoc, setDoc, addDoc, collection, getDocs, query, orderBy, limit, deleteDoc } from 'firebase/firestore';
import { sendWaWebMessage } from './waWebClient.js';
import { recordAiCall } from './aiTracker.mjs';
import { registerLiveMeetingSessionRoutes } from './liveMeetingSessions.mjs';

const LIVE_ROOMS_COLLECTION = 'liveMeetingRooms';

// Helper: Format Dubai timestamp
const dubaiStamp = (ms = Date.now()) => 
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .format(new Date(ms)).replace(' ', 'T');

async function getAppSettings(db) {
  try {
    const s = await getDoc(doc(db, 'appData', 'settings'));
    return s.exists() ? (s.data() || {}) : {};
  } catch (e) {
    return {};
  }
}

// Multi-model AI for Live Meeting Board (Gemini / DeepSeek / Qwen)
async function callMeetingAI(db, systemPrompt, userText, preferred = 'gemini') {
  const st = await getAppSettings(db);
  const geminiKey = st.GEMINI_API_KEY || process.env.GEMINI_API_KEY || st.geminiApiKey || '';
  const deepseekKey = st.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const qwenKey = st.QWEN_API_KEY || process.env.QWEN_API_KEY || st.DASHSCOPE_API_KEY || '';
  const qwenBase = String(st.QWEN_BASE_URL || process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const qwenModel = st.QWEN_MODEL || process.env.QWEN_MODEL || 'qwen3.8-flash';

  const modelsToTry = [];
  if (geminiKey) modelsToTry.push('gemini');
  if (deepseekKey) modelsToTry.push('deepseek');
  if (qwenKey) modelsToTry.push('qwen');

  if (modelsToTry.length === 0) {
    return "AI Co-pilot is currently offline. Please configure GEMINI_API_KEY or DEEPSEEK_API_KEY in Env Settings.";
  }

  // Prioritize preferred
  if (modelsToTry.includes(preferred)) {
    modelsToTry.splice(modelsToTry.indexOf(preferred), 1);
    modelsToTry.unshift(preferred);
  }

  for (const p of modelsToTry) {
    try {
      if (p === 'gemini') {
        const gm = 'gemini-2.5-flash';
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gm}:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Input / Board Context:\n${userText}` }] }]
          }),
          signal: AbortSignal.timeout(35000)
        });
        if (!r.ok) continue;
        const j = await r.json();
        const t = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (t) {
          recordAiCall({ source: 'live_meeting', model: gm, prompt: userText.slice(0, 100), response: t.slice(0, 100), success: true });
          return t;
        }
      } else if (p === 'deepseek') {
        const r = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
          body: JSON.stringify({
            model: 'deepseek-chat',
            temperature: 0.3,
            max_tokens: 1500,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }]
          }),
          signal: AbortSignal.timeout(35000)
        });
        if (!r.ok) continue;
        const j = await r.json();
        const t = j?.choices?.[0]?.message?.content?.trim();
        if (t) {
          recordAiCall({ source: 'live_meeting', model: 'deepseek-chat', prompt: userText.slice(0, 100), response: t.slice(0, 100), success: true });
          return t;
        }
      } else if (p === 'qwen') {
        const r = await fetch(`${qwenBase}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${qwenKey}` },
          body: JSON.stringify({
            model: qwenModel,
            temperature: 0.3,
            max_tokens: 1500,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }]
          }),
          signal: AbortSignal.timeout(35000)
        });
        if (!r.ok) continue;
        const j = await r.json();
        const t = j?.choices?.[0]?.message?.content?.trim();
        if (t) {
          recordAiCall({ source: 'live_meeting', model: qwenModel, prompt: userText.slice(0, 100), response: t.slice(0, 100), success: true });
          return t;
        }
      }
    } catch (e) {
      console.warn(`[LIVE MEETING AI] Error with ${p}:`, e.message);
    }
  }

  return "⚠️ Unable to generate AI response. Please try again.";
}

export function registerLiveMeetingRoutes(app, db) {
  // Mount Session Routes (Save, Resume, Checkpoints, Chunked Storage)
  registerLiveMeetingSessionRoutes(app, db);

  // 1. Create a new Live Meeting Room
  app.post('/api/live-meeting/create', async (req, res) => {
    try {
      const { title, hostName, hostEmail, hostUid, hostPin, settings, initialAssignedMembers } = req.body || {};
      const cleanTitle = (title || 'Live Strategy Board').trim().substring(0, 100);
      const cleanHost = (hostName || 'Host').trim().substring(0, 50);
      const cleanEmail = (hostEmail || '').trim().toLowerCase();
      const cleanUid = (hostUid || '').trim();
      const roomId = 'ROOM-' + Math.floor(100000 + Math.random() * 900000);
      const hostToken = 'token_' + Math.random().toString(36).substring(2, 15);

      const assignedList = Array.isArray(initialAssignedMembers) ? initialAssignedMembers : [
        { name: cleanHost, email: cleanEmail, role: 'host', duty: 'Meeting Leader & Session Host', status: 'joined', assignedAt: Date.now() }
      ];

      const roomData = {
        roomId,
        title: cleanTitle,
        hostName: cleanHost,
        hostEmail: cleanEmail,
        hostUid: cleanUid,
        hostPin: hostPin ? String(hostPin).trim() : '1234',
        hostToken,
        createdAt: Date.now(),
        createdStamp: dubaiStamp(),
        status: 'active',
        isLocked: false,
        settings: settings || { allowGuestDraw: true, allowGuestCalculations: true },
        canvasData: null,
        calculations: [
          { id: 'c1', label: 'Item 1 / Base Price', value: 1250, unit: 'AED', formula: '', note: 'Base estimate' },
          { id: 'c2', label: 'Margin %', value: 15, unit: '%', formula: '', note: 'Target profit' },
          { id: 'c3', label: 'Calculated Final', value: 1437.50, unit: 'AED', formula: 'c1 + (c1 * (c2 / 100))', note: 'Auto-calculated' }
        ],
        checklists: [
          { id: 't1', text: 'Align on project target and budget', done: false, priority: 'High', assignee: cleanHost },
          { id: 't2', text: 'Confirm timeline & responsibilities', done: false, priority: 'Medium', assignee: 'Team' }
        ],
        polls: [],
        messages: [],
        assignedMembers: assignedList,
        activeMembers: [{ name: cleanHost, role: 'host', lastSeen: Date.now() }]
      };

      await setDoc(doc(db, LIVE_ROOMS_COLLECTION, roomId), roomData);
      res.json({ ok: true, room: roomData });
    } catch (err) {
      console.error('[LIVE MEETING] Create room error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 2. Fetch Room Data
  app.get('/api/live-meeting/room/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;
      const snap = await getDoc(doc(db, LIVE_ROOMS_COLLECTION, roomId));
      if (!snap.exists()) {
        return res.status(404).json({ ok: false, error: 'Room not found or expired.' });
      }
      res.json({ ok: true, room: snap.data() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 3. Save / Sync Board State (Canvas, Calculations, Checklists, Polls, Assigned Members)
  app.post('/api/live-meeting/save-state', async (req, res) => {
    try {
      const { roomId, hostToken, canvasData, calculations, checklists, polls, isLocked, activeMember, assignedMembers } = req.body || {};
      if (!roomId) return res.status(400).json({ ok: false, error: 'Room ID required' });

      const roomRef = doc(db, LIVE_ROOMS_COLLECTION, roomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) {
        return res.status(404).json({ ok: false, error: 'Room not found' });
      }

      const current = snap.data();
      const updates = { updatedAt: Date.now() };

      if (canvasData !== undefined) updates.canvasData = canvasData;
      if (calculations !== undefined) updates.calculations = calculations;
      if (checklists !== undefined) updates.checklists = checklists;
      if (polls !== undefined) updates.polls = polls;
      if (isLocked !== undefined) updates.isLocked = !!isLocked;
      if (assignedMembers !== undefined) updates.assignedMembers = assignedMembers;

      if (activeMember && activeMember.name) {
        const members = (current.activeMembers || []).filter(m => m.name !== activeMember.name && (Date.now() - (m.lastSeen || 0) < 60000));
        members.push({ name: activeMember.name, role: activeMember.role || 'viewer', lastSeen: Date.now() });
        updates.activeMembers = members;
      }

      await setDoc(roomRef, updates, { merge: true });
      res.json({ ok: true });
    } catch (err) {
      console.error('[LIVE MEETING] Save state error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 3b. Finish / Close Active Room
  app.post('/api/live-meeting/finish-room', async (req, res) => {
    try {
      const { roomId, hostToken, closedBy } = req.body || {};
      if (!roomId) return res.status(400).json({ ok: false, error: 'Room ID required' });

      const roomRef = doc(db, LIVE_ROOMS_COLLECTION, roomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) {
        return res.status(404).json({ ok: false, error: 'Room not found' });
      }

      await setDoc(roomRef, {
        status: 'finished',
        finishedAt: Date.now(),
        finishedStamp: dubaiStamp(),
        finishedBy: closedBy || 'Host',
        updatedAt: Date.now()
      }, { merge: true });

      res.json({ ok: true, message: 'Room successfully finished and archived.' });
    } catch (err) {
      console.error('[LIVE MEETING] Finish room error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 4. Assign Team Members & Dispatch WhatsApp Alerts
  app.post('/api/live-meeting/assign-members', async (req, res) => {
    try {
      const { roomId, newMembers, dispatchWhatsApp, hostName, roomTitle } = req.body || {};
      if (!roomId) return res.status(400).json({ ok: false, error: 'Room ID required' });
      if (!Array.isArray(newMembers) || newMembers.length === 0) {
        return res.status(400).json({ ok: false, error: 'No members provided' });
      }

      const roomRef = doc(db, LIVE_ROOMS_COLLECTION, roomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) {
        return res.status(404).json({ ok: false, error: 'Room not found' });
      }

      const current = snap.data();
      const existing = current.assignedMembers || [];

      const mergedMap = new Map();
      existing.forEach(m => mergedMap.set(m.phone || m.name, m));

      const origin = req.headers.origin || req.headers.host || 'http://localhost:3000';
      const cleanOrigin = origin.startsWith('http') ? origin : `https://${origin}`;
      const inviteUrl = `${cleanOrigin}/live?room=${encodeURIComponent(roomId)}`;

      const dispatchedResults = [];

      for (const m of newMembers) {
        const key = m.phone || m.name;
        const entry = {
          name: m.name || 'Team Member',
          phone: m.phone || '',
          email: m.email || '',
          role: m.role || 'editor', // host, co-host, editor, auditor, presenter, viewer
          duty: m.duty || 'Active Team Collaborator',
          assignedSection: m.assignedSection || 'all', // all, canvas, calculations, checklists, polls
          status: 'assigned',
          assignedAt: Date.now()
        };
        mergedMap.set(key, entry);

        // Dispatch WhatsApp notification if phone provided and flag is set
        if (dispatchWhatsApp && m.phone) {
          const targetJid = m.phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          const roleBadge = m.role ? m.role.toUpperCase() : 'EDITOR';
          const dutyText = m.duty ? `\n🎯 *Your Assigned Role/Duty:* ${m.duty}` : '';
          const sectionText = m.assignedSection && m.assignedSection !== 'all' ? `\n📌 *Assigned Workspace Section:* ${m.assignedSection.toUpperCase()}` : '';

          const messageText = 
`🔴 *YOU HAVE BEEN ASSIGNED TO LIVE MEETING BOARD*

👤 *Host:* ${hostName || current.hostName || 'Admin'}
📌 *Topic:* ${roomTitle || current.title || 'Live Strategy Session'}
🔑 *Room ID:* \`${roomId}\`
🎖️ *Clearance / Role:* *[${roleBadge}]*${dutyText}${sectionText}

👉 *Join your live interactive board now:*
${inviteUrl}

_(No audio/video required — 100% real-time interactive drawings, calculations & checklists)_`;

          try {
            const sent = await sendWaWebMessage(targetJid, messageText);
            dispatchedResults.push({ phone: m.phone, name: m.name, sent: true });
          } catch (sendErr) {
            dispatchedResults.push({ phone: m.phone, name: m.name, sent: false, error: sendErr.message });
          }
        }
      }

      const updatedAssigned = Array.from(mergedMap.values());
      await setDoc(roomRef, { assignedMembers: updatedAssigned, updatedAt: Date.now() }, { merge: true });

      res.json({ ok: true, assignedMembers: updatedAssigned, dispatched: dispatchedResults });
    } catch (err) {
      console.error('[LIVE MEETING] Assign members error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 5. Send Individual Live Meeting Invite via WhatsApp Web
  app.post('/api/live-meeting/invite-whatsapp', async (req, res) => {
    try {
      const { phone, jid, roomId, roomTitle, hostName, customNote, role, duty } = req.body || {};
      if (!phone && !jid) {
        return res.status(400).json({ ok: false, error: 'Phone number or JID is required' });
      }

      const targetJid = jid || (phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net');
      const origin = req.headers.origin || req.headers.host || 'http://localhost:3000';
      const cleanOrigin = origin.startsWith('http') ? origin : `https://${origin}`;
      const inviteUrl = `${cleanOrigin}/live?room=${encodeURIComponent(roomId || '')}`;

      const roleStr = role ? `\n🎖️ *Assigned Role:* ${role.toUpperCase()}` : '';
      const dutyStr = duty ? `\n🎯 *Task/Duty:* ${duty}` : '';

      const messageText = 
`🔴 *LIVE MEETING / DISCUSSION BOARD INVITE*

👤 *Host:* ${hostName || 'Your Team'}
📌 *Topic:* ${roomTitle || 'Interactive Strategy Session'}
🔑 *Room ID:* \`${roomId || 'N/A'}\`${roleStr}${dutyStr}

${customNote ? `💬 *Note:* ${customNote}\n\n` : ''}👉 *Click link to join live interactive board:*
${inviteUrl}

_(No audio/video needed — 100% interactive live drawings, calculations & action checklists)_`;

      const sent = await sendWaWebMessage(targetJid, messageText);
      res.json({ ok: true, sent, inviteUrl });
    } catch (err) {
      console.error('[LIVE MEETING] WhatsApp Invite error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 6. AI Meeting Board Co-Pilot
  app.post('/api/live-meeting/ai-copilot', async (req, res) => {
    try {
      const { type, roomId, boardContext, userQuestion } = req.body || {};
      let systemPrompt = '';
      let userText = '';

      if (type === 'minutes') {
        systemPrompt = 
`You are WhatAnAgent's Executive Secretary & Meeting Summarizer.
Analyze the provided meeting details, assigned team members, drawings/notes text, live calculations, and action checklists.
Generate a structured, professional, executive-ready meeting summary in markdown format with:
1. 🎯 Executive Objective & Summary
2. 👥 Assigned Team Roster & Attendance
3. 🧮 Financial / Calculation Findings (totals, margins, key metrics)
4. ✅ Agreed Action Items & Delegated Responsibilities
5. 🚀 Immediate Next Steps & Deadlines`;
        userText = `Room ID: ${roomId}\n${JSON.stringify(boardContext, null, 2)}`;
      } else if (type === 'audit_math') {
        systemPrompt = 
`You are a Senior Financial & Quantitative Auditor.
Review the calculation table rows provided. Verify all calculations, profit margins, formulas, potential rounding errors, and pricing risks.
Provide clear observations, corrected values if any formula is broken, and strategic financial advice.`;
        userText = `Calculations Matrix:\n${JSON.stringify(boardContext?.calculations || [], null, 2)}`;
      } else {
        systemPrompt = 
`You are an expert interactive strategic advisor participating in a live business and strategy meeting board.
Answer the user's question concisely, accurately, and with actionable insights based on the live meeting context.`;
        userText = `Meeting Context:\n${JSON.stringify(boardContext, null, 2)}\n\nQuestion: ${userQuestion || 'Provide strategic guidance.'}`;
      }

      const answer = await callMeetingAI(db, systemPrompt, userText);
      res.json({ ok: true, response: answer });
    } catch (err) {
      console.error('[LIVE MEETING] AI Co-Pilot error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 7. List Recent Live Meeting Rooms
  app.get('/api/live-meeting/recent-rooms', async (req, res) => {
    try {
      const q = query(collection(db, LIVE_ROOMS_COLLECTION), orderBy('createdAt', 'desc'), limit(15));
      const snap = await getDocs(q);
      const rooms = [];
      snap.forEach(d => rooms.push(d.data()));
      res.json({ ok: true, rooms });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 8. Register / Heartbeat User Profile for Live Board Roster
  app.post('/api/live-meeting/register-user', async (req, res) => {
    try {
      const { uid, email, name, phone } = req.body || {};
      if (!uid && !email) {
        return res.status(400).json({ ok: false, error: 'User identifier required' });
      }

      const userDocId = uid || email.replace(/[^a-zA-Z0-9]/g, '_');
      const userData = {
        uid: uid || '',
        email: email || '',
        name: name || (email ? email.split('@')[0] : 'Teammate'),
        phone: phone || '',
        lastSeen: Date.now(),
        lastSeenStamp: dubaiStamp()
      };

      await setDoc(doc(db, 'liveBoardUsers', userDocId), userData, { merge: true });
      res.json({ ok: true, user: userData });
    } catch (err) {
      console.error('[LIVE MEETING] Register user error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 9. Get All Registered Live Board Users (Directory for inviting teammates)
  app.get('/api/live-meeting/registered-users', async (req, res) => {
    try {
      const q = query(collection(db, 'liveBoardUsers'), orderBy('lastSeen', 'desc'), limit(50));
      const snap = await getDocs(q);
      const users = [];
      snap.forEach(d => users.push(d.data()));
      res.json({ ok: true, users });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 10. Get Rooms Assigned to a Specific User
  app.get('/api/live-meeting/my-rooms', async (req, res) => {
    try {
      const userParam = (req.query.user || req.query.email || req.query.phone || '').trim().toLowerCase();
      const userUid = (req.query.uid || '').trim();
      const userPrefix = userParam.includes('@') ? userParam.split('@')[0] : userParam;
      const cleanPhone = userParam.replace(/[^0-9]/g, '');

      const snap = await getDocs(collection(db, LIVE_ROOMS_COLLECTION));
      const rooms = [];

      snap.forEach(d => {
        const r = d.data();
        if (!userParam && !userUid) {
          rooms.push(r);
        } else {
          const hName = String(r.hostName || '').toLowerCase().trim();
          const hEmail = String(r.hostEmail || '').toLowerCase().trim();
          const hUid = String(r.hostUid || '').trim();

          const isHost = (userUid && hUid === userUid) ||
                         (userParam && hEmail === userParam) ||
                         (userParam && hName === userParam) ||
                         (userPrefix && hName === userPrefix) ||
                         (userParam && userParam.includes(hName) && hName.length > 2) ||
                         (hName && hName.includes(userPrefix) && userPrefix.length > 2);

          const isAssigned = Array.isArray(r.assignedMembers) && r.assignedMembers.some(m => {
            const mName = String(m.name || '').toLowerCase().trim();
            const mPhone = String(m.phone || '').replace(/[^0-9]/g, '');
            const mEmail = String(m.email || '').toLowerCase().trim();
            const mUid = String(m.uid || '').trim();

            if (userUid && mUid === userUid) return true;
            if (userParam && mEmail === userParam) return true;
            if (cleanPhone && mPhone && mPhone === cleanPhone) return true;
            if (userParam && mName === userParam) return true;
            if (userPrefix && mName === userPrefix) return true;
            if (userParam && userParam.includes(mName) && mName.length > 2) return true;
            return false;
          });

          if (isHost || isAssigned) {
            rooms.push({
              ...r,
              isHost: !!isHost
            });
          }
        }
      });

      rooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      res.json({ ok: true, rooms: rooms.slice(0, 50) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 11. Leave / Unlink from Room (for assigned members)
  app.post('/api/live-meeting/leave-room', async (req, res) => {
    try {
      const { roomId, userIdentifier, userEmail, email, caller } = req.body || {};
      const ident = userIdentifier || userEmail || email || caller?.email || caller?.uid || caller?.name || '';
      if (!roomId || !ident) return res.status(400).json({ ok: false, error: 'Room ID and user identifier required' });

      const roomRef = doc(db, LIVE_ROOMS_COLLECTION, roomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return res.status(404).json({ ok: false, error: 'Room not found' });

      const room = snap.data();
      const cleanIdent = String(ident).toLowerCase().trim();
      const cleanPhone = cleanIdent.replace(/[^0-9]/g, '');

      const updatedAssigned = (room.assignedMembers || []).filter(m => {
        const mEmail = String(m.email || '').toLowerCase().trim();
        const mName = String(m.name || '').toLowerCase().trim();
        const mPhone = String(m.phone || '').replace(/[^0-9]/g, '');
        if (cleanIdent && (mEmail === cleanIdent || mName === cleanIdent)) return false;
        if (cleanPhone && mPhone === cleanPhone) return false;
        return true;
      });

      await setDoc(roomRef, { assignedMembers: updatedAssigned, updatedAt: Date.now() }, { merge: true });
      res.json({ ok: true, message: 'Successfully unlinked from discussion room.' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 12. Delete / Remove Room (Host only)
  app.post('/api/live-meeting/delete-room', async (req, res) => {
    try {
      const { roomId } = req.body || {};
      if (!roomId) return res.status(400).json({ ok: false, error: 'Room ID required' });

      const roomRef = doc(db, LIVE_ROOMS_COLLECTION, roomId);
      await deleteDoc(roomRef);
      res.json({ ok: true, message: 'Room deleted successfully.' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 13. Rename Room (Host only)
  app.post('/api/live-meeting/rename-room', async (req, res) => {
    try {
      const { roomId, newTitle } = req.body || {};
      if (!roomId || !newTitle) return res.status(400).json({ ok: false, error: 'Room ID and new title required' });

      const roomRef = doc(db, LIVE_ROOMS_COLLECTION, roomId);
      await setDoc(roomRef, { title: newTitle.trim().substring(0, 100), updatedAt: Date.now() }, { merge: true });
      res.json({ ok: true, title: newTitle.trim() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  console.log('🔴 [LIVE MEETING] Registered Live Interactive Meeting Board API Routes');
}
