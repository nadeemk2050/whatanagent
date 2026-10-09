// ======================== LIVE INTERACTIVE MEETING SESSIONS (SAVE & RESUME) ========================
// Phase 1: High-Performance, Chunked Discussion Checkpoints & Snapshots
// Isolated backend module for /api/live-meeting/session/*

import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, orderBy, limit, where, writeBatch } from 'firebase/firestore';
import { sendWaWebMessage } from './waWebClient.js';

const SESSIONS_COLLECTION = 'liveMeetingSessions';
const LIVE_ROOMS_COLLECTION = 'liveMeetingRooms';
const CHUNK_SIZE = 250 * 1024; // 250 KB per chunk (guarantees well below 1 MiB Firestore limit)

// Dubai timestamp helper
const dubaiStamp = (ms = Date.now()) => 
  new Intl.DateTimeFormat('sv-SE', { 
    timeZone: 'Asia/Dubai', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: false 
  }).format(new Date(ms)).replace(' ', 'T');

// Helper to chunk large string data into array of chunks
function splitIntoChunks(str, size = CHUNK_SIZE) {
  if (!str) return [];
  const chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}

// Check caller access to session
function hasSessionAccess(session, caller) {
  if (!session || !caller) return false;
  const uid = caller.uid || '';
  const email = (caller.email || '').toLowerCase().trim();
  const phone = (caller.phone || '').replace(/[^0-9]/g, '');

  if (session.ownerUid && session.ownerUid === uid) return true;
  if (session.ownerEmail && session.ownerEmail.toLowerCase().trim() === email) return true;

  if (Array.isArray(session.members)) {
    return session.members.some(m => {
      if (m.uid && m.uid === uid) return true;
      if (m.email && m.email.toLowerCase().trim() === email) return true;
      if (phone && m.phone && m.phone.replace(/[^0-9]/g, '') === phone) return true;
      return false;
    });
  }
  return false;
}

export function registerLiveMeetingSessionRoutes(app, db) {

  // 1. SAVE DISCUSSION (Manual Checkpoint or Debounced Autosave)
  app.post('/api/live-meeting/session/save', async (req, res) => {
    try {
      const {
        sessionId: providedSessionId,
        sourceRoomId,
        title,
        canvasData,
        calculations,
        checklists,
        polls,
        assignedMembers,
        messages,
        settings,
        isLocked,
        isCheckpoint,
        checkpointNote,
        caller // { uid, email, name }
      } = req.body || {};

      if (!caller || (!caller.uid && !caller.email)) {
        return res.status(401).json({ ok: false, error: 'Authentication required to save session' });
      }

      const sessionId = providedSessionId || ('SES-' + Math.floor(100000 + Math.random() * 900000));
      const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
      const existingSnap = await getDoc(sessionRef);
      const existing = existingSnap.exists() ? existingSnap.data() : null;

      // If exists, verify ownership or co-host role
      if (existing && !hasSessionAccess(existing, caller)) {
        return res.status(403).json({ ok: false, error: 'Unauthorized to modify this saved session' });
      }

      // Serialize and chunk canvasData to keep main doc feather-light
      const rawCanvasStr = typeof canvasData === 'string' ? canvasData : JSON.stringify(canvasData || {});
      const canvasChunks = splitIntoChunks(rawCanvasStr, CHUNK_SIZE);
      const totalBytes = Buffer.byteLength(rawCanvasStr, 'utf8');

      // Save chunks to subcollection
      const batch = writeBatch(db);
      canvasChunks.forEach((chunkText, idx) => {
        const chunkRef = doc(db, SESSIONS_COLLECTION, sessionId, 'chunks', `chunk_${idx}`);
        batch.set(chunkRef, { index: idx, data: chunkText, updatedAt: Date.now() });
      });
      await batch.commit();

      const sessionMeta = {
        sessionId,
        sourceRoomId: sourceRoomId || existing?.sourceRoomId || '',
        title: (title || existing?.title || 'Live Strategy Discussion').trim().substring(0, 100),
        ownerUid: existing?.ownerUid || caller.uid || '',
        ownerEmail: existing?.ownerEmail || caller.email || '',
        ownerName: existing?.ownerName || caller.name || caller.email.split('@')[0],
        members: existing?.members || [],
        calculations: Array.isArray(calculations) ? calculations : (existing?.calculations || []),
        checklists: Array.isArray(checklists) ? checklists : (existing?.checklists || []),
        polls: Array.isArray(polls) ? polls : (existing?.polls || []),
        assignedMembers: Array.isArray(assignedMembers) ? assignedMembers : (existing?.assignedMembers || []),
        messages: Array.isArray(messages) ? messages : (existing?.messages || []),
        settings: settings || existing?.settings || {},
        isLocked: !!isLocked,
        isCheckpoint: !!isCheckpoint,
        checkpointNote: (checkpointNote || '').trim().substring(0, 250),
        schemaVersion: 1,
        totalChunks: canvasChunks.length,
        canvasByteSize: totalBytes,
        savedAt: Date.now(),
        savedStamp: dubaiStamp(),
        savedBy: {
          uid: caller.uid || '',
          email: caller.email || '',
          name: caller.name || caller.email.split('@')[0]
        },
        createdAt: existing?.createdAt || Date.now()
      };

      await setDoc(sessionRef, sessionMeta, { merge: true });

      res.json({
        ok: true,
        sessionId,
        savedStamp: sessionMeta.savedStamp,
        totalChunks: canvasChunks.length,
        canvasByteSize: totalBytes,
        message: isCheckpoint ? '📌 Checkpoint saved successfully!' : '💾 Autosave synced.'
      });
    } catch (err) {
      console.error('[LIVE SESSIONS] Save error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 2. LIST SESSIONS (Accessible to caller: owned + shared)
  app.get('/api/live-meeting/session/list', async (req, res) => {
    try {
      const email = (req.query.email || req.query.userEmail || '').toLowerCase().trim();
      const uid = (req.query.uid || req.query.userId || '').trim();

      if (!email && !uid) {
        return res.status(401).json({ ok: false, error: 'Caller identity required' });
      }

      // Query latest sessions
      const q = query(collection(db, SESSIONS_COLLECTION), orderBy('savedAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      const sessions = [];

      snap.forEach(d => {
        const s = d.data();
        if (hasSessionAccess(s, { uid, email })) {
          const isOwner = (s.ownerUid && s.ownerUid === uid) || (s.ownerEmail && s.ownerEmail.toLowerCase().trim() === email);
          sessions.push({
            sessionId: s.sessionId,
            sourceRoomId: s.sourceRoomId,
            title: s.title,
            ownerName: s.ownerName,
            ownerEmail: s.ownerEmail,
            savedAt: s.savedAt,
            savedStamp: s.savedStamp,
            canvasByteSize: s.canvasByteSize || 0,
            tasksCount: Array.isArray(s.checklists) ? s.checklists.length : 0,
            calculationsCount: Array.isArray(s.calculations) ? s.calculations.length : 0,
            assignedMembersCount: Array.isArray(s.assignedMembers) ? s.assignedMembers.length : 0,
            isCheckpoint: !!s.isCheckpoint,
            checkpointNote: s.checkpointNote || '',
            isOwner,
            myRole: isOwner ? 'owner' : (s.members?.find(m => m.email?.toLowerCase() === email)?.role || 'viewer')
          });
        }
      });

      res.json({ ok: true, sessions });
    } catch (err) {
      console.error('[LIVE SESSIONS] List error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 3. GET FULL SESSION (Reassembles chunked canvasData)
  app.get('/api/live-meeting/session/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const email = (req.query.email || req.query.userEmail || '').toLowerCase().trim();
      const uid = (req.query.uid || req.query.userId || '').trim();

      const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) {
        return res.status(404).json({ ok: false, error: 'Saved session not found' });
      }

      const session = snap.data();
      // If caller identity provided, verify access
      if ((email || uid) && !hasSessionAccess(session, { uid, email })) {
        return res.status(403).json({ ok: false, error: 'Access denied to this saved session' });
      }

      // Reassemble chunked canvas data
      let reassembledCanvas = '';
      if (session.totalChunks > 0) {
        const chunksSnap = await getDocs(collection(db, SESSIONS_COLLECTION, sessionId, 'chunks'));
        const chunkList = [];
        chunksSnap.forEach(cd => chunkList.push(cd.data()));
        chunkList.sort((a, b) => (a.index || 0) - (b.index || 0));
        reassembledCanvas = chunkList.map(c => c.data || '').join('');
      }

      res.json({
        ok: true,
        session: {
          ...session,
          canvasData: reassembledCanvas
        }
      });
    } catch (err) {
      console.error('[LIVE SESSIONS] Get session error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 4. RESUME SESSION (Mode A: In-Place, Mode B: Fork as New Room)
  app.post('/api/live-meeting/session/resume', async (req, res) => {
    try {
      const { sessionId, mode, asFork, caller } = req.body || {}; // mode: 'inplace' | 'fork'
      const resumeMode = mode || (asFork ? 'fork' : 'inplace');
      if (!sessionId) return res.status(400).json({ ok: false, error: 'Session ID required' });
      if (!caller || (!caller.uid && !caller.email)) {
        return res.status(401).json({ ok: false, error: 'Authentication required' });
      }

      const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) return res.status(404).json({ ok: false, error: 'Session not found' });

      const session = snap.data();
      if (!hasSessionAccess(session, caller)) {
        return res.status(403).json({ ok: false, error: 'Access denied' });
      }

      // Reassemble canvas chunks
      let reassembledCanvas = '';
      if (session.totalChunks > 0) {
        const chunksSnap = await getDocs(collection(db, SESSIONS_COLLECTION, sessionId, 'chunks'));
        const chunkList = [];
        chunksSnap.forEach(cd => chunkList.push(cd.data()));
        chunkList.sort((a, b) => (a.index || 0) - (b.index || 0));
        reassembledCanvas = chunkList.map(c => c.data || '').join('');
      }

      let targetRoomId = session.sourceRoomId;
      const isFork = mode === 'fork' || !targetRoomId;

      if (isFork) {
        targetRoomId = 'ROOM-' + Math.floor(100000 + Math.random() * 900000);
      }

      const targetRoomRef = doc(db, LIVE_ROOMS_COLLECTION, targetRoomId);
      const existingRoomSnap = await getDoc(targetRoomRef);
      const existingRoomData = existingRoomSnap.exists() ? existingRoomSnap.data() : {};

      const hostName = isFork ? (caller.name || caller.email.split('@')[0]) : (existingRoomData.hostName || session.ownerName || caller.name || caller.email.split('@')[0]);
      const hostEmail = isFork ? caller.email : (existingRoomData.hostEmail || session.ownerEmail || caller.email || '');
      const hostUid = isFork ? caller.uid : (existingRoomData.hostUid || session.ownerUid || caller.uid || '');

      let membersList = session.assignedMembers || [];
      if (!membersList.some(m => (m.email && m.email === hostEmail) || (m.name && m.name === hostName))) {
        membersList.unshift({ name: hostName, email: hostEmail, uid: hostUid, role: 'host', duty: 'Session Leader & Executive Host', status: 'joined', assignedAt: Date.now() });
      }

      const restoredRoomData = {
        roomId: targetRoomId,
        title: session.title || 'Resumed Live Strategy Discussion',
        hostName,
        hostEmail,
        hostUid,
        hostToken: isFork ? ('token_' + Math.random().toString(36).substring(2, 15)) : (existingRoomData.hostToken || 'token_' + Math.random().toString(36).substring(2, 15)),
        status: 'active',
        isLocked: false,
        settings: session.settings || { allowGuestDraw: true, allowGuestCalculations: true },
        canvasData: reassembledCanvas,
        calculations: session.calculations || [],
        checklists: session.checklists || [],
        polls: session.polls || [],
        assignedMembers: membersList,
        activeMembers: [{ name: caller.name || caller.email.split('@')[0], role: 'host', lastSeen: Date.now() }],
        resumedFromSessionId: sessionId,
        resumedAt: Date.now(),
        resumedStamp: dubaiStamp(),
        createdAt: isFork ? Date.now() : (existingRoomData.createdAt || Date.now())
      };

      await setDoc(targetRoomRef, restoredRoomData, { merge: true });

      res.json({
        ok: true,
        roomId: targetRoomId,
        isFork,
        message: isFork ? `Restored as new room ${targetRoomId}` : `Resumed room ${targetRoomId} successfully`
      });
    } catch (err) {
      console.error('[LIVE SESSIONS] Resume error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 5. SHARE ACCESS (Grant / Update Role)
  app.post('/api/live-meeting/session/share', async (req, res) => {
    try {
      const { sessionId, targetUser, role, caller, dispatchWhatsApp } = req.body || {};
      if (!sessionId || !targetUser) return res.status(400).json({ ok: false, error: 'Missing parameters' });

      const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) return res.status(404).json({ ok: false, error: 'Session not found' });

      const session = snap.data();
      const isOwner = (session.ownerUid && session.ownerUid === caller?.uid) || 
                      (session.ownerEmail && session.ownerEmail.toLowerCase() === caller?.email?.toLowerCase());

      if (!isOwner) {
        return res.status(403).json({ ok: false, error: 'Only the session owner can manage access permissions' });
      }

      const members = Array.isArray(session.members) ? [...session.members] : [];
      const cleanTargetEmail = (targetUser.email || '').toLowerCase().trim();
      const cleanTargetPhone = (targetUser.phone || '').replace(/[^0-9]/g, '');

      const idx = members.findIndex(m => 
        (cleanTargetEmail && m.email?.toLowerCase() === cleanTargetEmail) ||
        (cleanTargetPhone && m.phone?.replace(/[^0-9]/g, '') === cleanTargetPhone)
      );

      const memberEntry = {
        uid: targetUser.uid || '',
        email: cleanTargetEmail,
        phone: cleanTargetPhone,
        name: targetUser.name || cleanTargetEmail.split('@')[0] || 'Team Collaborator',
        role: role || 'editor', // 'viewer' | 'editor' | 'co-host'
        grantedBy: caller.email,
        grantedAt: Date.now(),
        grantedStamp: dubaiStamp()
      };

      if (idx >= 0) {
        members[idx] = memberEntry;
      } else {
        members.push(memberEntry);
      }

      await setDoc(sessionRef, { members, updatedAt: Date.now() }, { merge: true });

      // Optional WhatsApp notification alert
      if (dispatchWhatsApp && cleanTargetPhone) {
        try {
          const origin = req.headers.origin || req.headers.host || 'http://localhost:3000';
          const cleanOrigin = origin.startsWith('http') ? origin : `https://${origin}`;
          const resumeLink = `${cleanOrigin}/live?resumeSession=${sessionId}`;
          const text = `📁 *WhatAnAgent — Saved Discussion Shared With You*\n\n` +
            `*Topic:* ${session.title}\n` +
            `*Shared By:* ${caller.name || caller.email}\n` +
            `*Your Role:* ${role.toUpperCase()}\n\n` +
            `👉 Open & Resume Discussion: ${resumeLink}`;

          await sendWaWebMessage(cleanTargetPhone + '@s.whatsapp.net', text);
        } catch (e) {
          console.warn('[LIVE SESSIONS] WhatsApp notice error:', e.message);
        }
      }

      res.json({ ok: true, members });
    } catch (err) {
      console.error('[LIVE SESSIONS] Share error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 6. REVOKE ACCESS
  app.post('/api/live-meeting/session/revoke', async (req, res) => {
    try {
      const { sessionId, targetEmail, targetPhone, caller } = req.body || {};
      const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) return res.status(404).json({ ok: false, error: 'Session not found' });

      const session = snap.data();
      const isOwner = (session.ownerUid && session.ownerUid === caller?.uid) || 
                      (session.ownerEmail && session.ownerEmail.toLowerCase() === caller?.email?.toLowerCase());

      if (!isOwner) return res.status(403).json({ ok: false, error: 'Only session owner can revoke access' });

      const members = (session.members || []).filter(m => {
        if (targetEmail && m.email?.toLowerCase() === targetEmail.toLowerCase()) return false;
        if (targetPhone && m.phone?.replace(/[^0-9]/g, '') === targetPhone.replace(/[^0-9]/g, '')) return false;
        return true;
      });

      await setDoc(sessionRef, { members, updatedAt: Date.now() }, { merge: true });
      res.json({ ok: true, members });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 7. RENAME SESSION
  app.post('/api/live-meeting/session/rename', async (req, res) => {
    try {
      const { sessionId, newTitle, caller } = req.body || {};
      if (!newTitle) return res.status(400).json({ ok: false, error: 'New title required' });

      const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) return res.status(404).json({ ok: false, error: 'Session not found' });

      const session = snap.data();
      if (!hasSessionAccess(session, caller)) return res.status(403).json({ ok: false, error: 'Access denied' });

      await setDoc(sessionRef, { title: newTitle.trim().substring(0, 100), updatedAt: Date.now() }, { merge: true });
      res.json({ ok: true, title: newTitle.trim() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 8. DELETE SESSION (Owner only - deletes metadata + chunk docs)
  app.post('/api/live-meeting/session/delete', async (req, res) => {
    try {
      const { sessionId, caller } = req.body || {};
      const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) return res.status(404).json({ ok: false, error: 'Session not found' });

      const session = snap.data();
      const isOwner = (session.ownerUid && session.ownerUid === caller?.uid) || 
                      (session.ownerEmail && session.ownerEmail.toLowerCase() === caller?.email?.toLowerCase());

      if (!isOwner) return res.status(403).json({ ok: false, error: 'Only the session owner can delete this discussion' });

      // Delete chunks
      const chunksSnap = await getDocs(collection(db, SESSIONS_COLLECTION, sessionId, 'chunks'));
      const batch = writeBatch(db);
      chunksSnap.forEach(d => batch.delete(d.ref));
      batch.delete(sessionRef);
      await batch.commit();

      res.json({ ok: true, message: 'Discussion session permanently deleted' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  console.log('📁 [LIVE SESSIONS] Registered Live Meeting Discussion Sessions (Save & Resume) API');
}
