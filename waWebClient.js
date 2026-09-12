import makeWASocketPkg, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadMediaMessage } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const makeWASocket = makeWASocketPkg.default || makeWASocketPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');

// Ensure auth dir exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// In-memory state
export const waWebState = {
  status: 'disconnected', // 'disconnected' | 'qr_ready' | 'connecting' | 'connected'
  qrCodeDataUrl: null,
  rawQr: null,
  user: null,
  error: null,
  chats: new Map(), // jid -> { id, name, phone, lastMessage, timestamp, unreadCount, isGroup, messages: [] }
  contacts: new Map() // jid/phone/lid -> { id, name, notify, verifiedName }
};

// Store raw messages temporarily for on-demand media downloads
const rawMessagesMap = new Map(); // `${jid}_${msgId}` -> msg

let sock = null;
let isInitializing = false;
let globalDb = null;
let historySaveTimeout = null;

// Helper to extract text, thumbnail, and media metadata without downloading heavy binary files
function parseMessageContent(msg) {
  if (!msg || !msg.message) return { text: '', mediaType: null, mediaInfo: null };
  const c = msg.message;

  if (c.conversation) return { text: c.conversation, mediaType: null, mediaInfo: null };
  if (c.extendedTextMessage) return { text: c.extendedTextMessage.text || '', mediaType: null, mediaInfo: null };

  if (c.imageMessage) {
    const thumb = c.imageMessage.jpegThumbnail ? Buffer.from(c.imageMessage.jpegThumbnail).toString('base64') : null;
    const caption = c.imageMessage.caption ? c.imageMessage.caption.trim() : '';
    return {
      text: caption ? `📷 ${caption}` : '📷 [Image]',
      mediaType: 'image',
      mediaInfo: {
        caption: caption,
        mimetype: c.imageMessage.mimetype || 'image/jpeg',
        thumbnail: thumb,
        fileLength: c.imageMessage.fileLength ? Number(c.imageMessage.fileLength) : null
      }
    };
  }

  if (c.videoMessage) {
    const thumb = c.videoMessage.jpegThumbnail ? Buffer.from(c.videoMessage.jpegThumbnail).toString('base64') : null;
    const caption = c.videoMessage.caption ? c.videoMessage.caption.trim() : '';
    return {
      text: caption ? `🎥 ${caption}` : '🎥 [Video]',
      mediaType: 'video',
      mediaInfo: {
        caption: caption,
        seconds: c.videoMessage.seconds || 0,
        mimetype: c.videoMessage.mimetype || 'video/mp4',
        thumbnail: thumb,
        fileLength: c.videoMessage.fileLength ? Number(c.videoMessage.fileLength) : null
      }
    };
  }

  if (c.audioMessage) {
    return {
      text: '🎵 [Voice/Audio Note]',
      mediaType: 'audio',
      mediaInfo: {
        seconds: c.audioMessage.seconds || 0,
        mimetype: c.audioMessage.mimetype || 'audio/ogg; codecs=opus',
        ptt: Boolean(c.audioMessage.ptt)
      }
    };
  }

  if (c.documentMessage) {
    const thumb = c.documentMessage.jpegThumbnail ? Buffer.from(c.documentMessage.jpegThumbnail).toString('base64') : null;
    const fileName = c.documentMessage.fileName || 'file';
    return {
      text: `📄 [Document: ${fileName}]`,
      mediaType: 'document',
      mediaInfo: {
        fileName: fileName,
        mimetype: c.documentMessage.mimetype || 'application/octet-stream',
        thumbnail: thumb,
        fileLength: c.documentMessage.fileLength ? Number(c.documentMessage.fileLength) : null
      }
    };
  }

  if (c.contactMessage) return { text: `👤 [Contact: ${c.contactMessage.displayName || 'Card'}]`, mediaType: 'contact', mediaInfo: null };
  if (c.locationMessage) return { text: '📍 [Location]', mediaType: 'location', mediaInfo: null };
  if (c.stickerMessage) return { text: '🎭 [Sticker]', mediaType: 'sticker', mediaInfo: null };
  if (c.ephemeralMessage) return parseMessageContent({ message: c.ephemeralMessage.message });
  if (c.viewOnceMessage) return parseMessageContent({ message: c.viewOnceMessage.message });
  if (c.viewOnceMessageV2) return parseMessageContent({ message: c.viewOnceMessageV2.message });

  return { text: '[Message]', mediaType: null, mediaInfo: null };
}

// Helper to resolve contact name cleanly from contacts map and pushName
function resolveContactName(jid, pushName = '', fallbackName = '') {
  if (!jid) return fallbackName || 'WhatsApp User';
  const cleanPhone = jid.split('@')[0].split(':')[0];

  const c = waWebState.contacts.get(jid) ||
            waWebState.contacts.get(`${cleanPhone}@s.whatsapp.net`) ||
            waWebState.contacts.get(cleanPhone);

  if (c && (c.name || c.notify || c.verifiedName)) {
    return c.name || c.notify || c.verifiedName;
  }
  if (pushName && pushName.trim() && !/^\d+$/.test(pushName.trim())) {
    return pushName.trim();
  }
  if (fallbackName && fallbackName.trim() && !/^\d+$/.test(fallbackName.trim())) {
    return fallbackName.trim();
  }
  return `+${cleanPhone}`;
}

// Register contact into internal index (maps multiple formats: full JID, clean phone, LID)
function registerContact(c) {
  if (!c || !c.id) return;
  const id = c.id;
  const name = c.name || c.notify || c.verifiedName || '';
  if (!name) return;

  waWebState.contacts.set(id, c);
  const cleanPhone = id.split('@')[0].split(':')[0];
  waWebState.contacts.set(cleanPhone, c);
  waWebState.contacts.set(`${cleanPhone}@s.whatsapp.net`, c);
  if (c.lid) waWebState.contacts.set(c.lid, c);

  // Update existing chat name if it was just showing numbers
  const chat = waWebState.chats.get(id) || waWebState.chats.get(`${cleanPhone}@s.whatsapp.net`);
  if (chat && (!chat.name || chat.name.startsWith('+') || /^\d+$/.test(chat.name))) {
    chat.name = name;
  }
}

// Upsert a single message into the chat store (filters past 7 days on initial sync)
function upsertMessageToChat(msg, isHistorySync = false) {
  if (!msg || !msg.key || !msg.message) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid === 'status@broadcast') return;

  const timestamp = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  // If history sync, only retain messages from last 7 days
  if (isHistorySync && timestamp < sevenDaysAgo) return;

  const fromMe = Boolean(msg.key.fromMe);
  const pushName = msg.pushName || '';
  if (pushName && !fromMe) {
    registerContact({ id: jid, notify: pushName });
  }

  const { text, mediaType, mediaInfo } = parseMessageContent(msg);
  const cleanPhone = jid.split('@')[0].split(':')[0];
  const name = resolveContactName(jid, pushName);
  const isGroup = jid.endsWith('@g.us');
  const msgId = msg.key.id;

  // Store raw message for on-demand downloading
  rawMessagesMap.set(`${jid}_${msgId}`, msg);
  if (rawMessagesMap.size > 1000) {
    const firstKey = rawMessagesMap.keys().next().value;
    rawMessagesMap.delete(firstKey);
  }

  let chat = waWebState.chats.get(jid);
  if (!chat) {
    chat = {
      id: jid,
      name: name,
      phone: cleanPhone,
      isGroup: isGroup,
      unreadCount: fromMe ? 0 : 1,
      lastMessage: text,
      timestamp: timestamp,
      messages: []
    };
    waWebState.chats.set(jid, chat);
  } else {
    if (!chat.name || chat.name.startsWith('+') || /^\d+$/.test(chat.name)) {
      chat.name = name;
    }
    if (timestamp >= (chat.timestamp || 0)) {
      chat.lastMessage = text;
      chat.timestamp = timestamp;
    }
    if (!fromMe && !isHistorySync) {
      chat.unreadCount = (chat.unreadCount || 0) + 1;
    }
  }

  // Deduplicate messages in history
  const exists = chat.messages.some(m => m.id === msgId);
  if (!exists) {
    chat.messages.push({
      id: msgId,
      fromMe: fromMe,
      senderName: fromMe ? 'You' : (pushName || name),
      text: text,
      timestamp: timestamp,
      mediaType: mediaType,
      mediaInfo: mediaInfo
    });

    chat.messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    if (chat.messages.length > 200) {
      chat.messages.shift();
    }
  }

  scheduleHistorySaveToFirestore();
}

// Restore session auth files from Firestore collection (sub-documents avoid 1MB document limit)
async function restoreSessionFromFirestore(db) {
  if (!db) return;
  try {
    const snap = await getDocs(collection(db, "waWebSession"));
    if (!snap.empty) {
      let count = 0;
      snap.forEach(docSnap => {
        const fn = docSnap.id.replace(/___/g, '/').replace(/_dot_/g, '.');
        const data = docSnap.data();
        if (data && data.content) {
          const filePath = path.join(AUTH_DIR, fn);
          fs.writeFileSync(filePath, data.content, 'utf-8');
          count++;
        }
      });
      console.log(`[WA-WEB AUTH] Restored ${count} session credentials from Firestore collection`);
    }
  } catch (err) {
    console.warn('[WA-WEB AUTH] Could not restore session from Firestore:', err.message);
  }
}

// Sync session auth files to Firestore collection (each file has its own document)
async function syncSessionToFirestore(db) {
  if (!db) return;
  try {
    if (!fs.existsSync(AUTH_DIR)) return;
    const fileNames = fs.readdirSync(AUTH_DIR);
    for (const fn of fileNames) {
      const fp = path.join(AUTH_DIR, fn);
      if (fs.statSync(fp).isFile()) {
        const content = fs.readFileSync(fp, 'utf-8');
        const docId = fn.replace(/\./g, '_dot_').replace(/\//g, '___');
        await setDoc(doc(db, "waWebSession", docId), { content, updatedAt: Date.now() }, { merge: true });
      }
    }
  } catch (err) {
    console.warn('[WA-WEB AUTH] Could not sync session to Firestore:', err.message);
  }
}

// Save text-only 7-day conversation history + lightweight thumbnails to Firestore collection
async function saveHistoryToFirestore() {
  if (!globalDb) return;
  try {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const chats = Array.from(waWebState.chats.values())
      .filter(c => (c.messages && c.messages.length > 0) || (c.timestamp && c.timestamp >= sevenDaysAgo))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 50); // top 50 active chats

    for (const c of chats) {
      const recentMsgs = (c.messages || []).filter(m => (m.timestamp || 0) >= sevenDaysAgo);
      const docId = c.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      await setDoc(doc(globalDb, "waWebChatHistory", docId), {
        id: c.id,
        name: c.name || resolveContactName(c.id),
        phone: c.phone || c.id.split('@')[0],
        isGroup: c.isGroup || false,
        lastMessage: c.lastMessage || '',
        timestamp: c.timestamp || Date.now(),
        unreadCount: c.unreadCount || 0,
        messages: recentMsgs.map(m => ({
          id: m.id,
          fromMe: m.fromMe,
          senderName: m.senderName,
          text: m.text || '',
          timestamp: m.timestamp,
          mediaType: m.mediaType || null,
          mediaInfo: m.mediaInfo ? {
            thumbnail: m.mediaInfo.thumbnail || null,
            caption: m.mediaInfo.caption || '',
            fileName: m.mediaInfo.fileName || '',
            mimetype: m.mediaInfo.mimetype || '',
            seconds: m.mediaInfo.seconds || 0
          } : null
        })),
        updatedAt: Date.now()
      }, { merge: true });
    }
  } catch (err) {
    console.warn('[WA-WEB HISTORY] Error saving text history to Firestore:', err.message);
  }
}

function scheduleHistorySaveToFirestore() {
  if (historySaveTimeout) clearTimeout(historySaveTimeout);
  historySaveTimeout = setTimeout(() => {
    saveHistoryToFirestore();
  }, 5000);
}

// Restore text-only chat history from Firestore on startup
async function restoreHistoryFromFirestore(db) {
  if (!db) return;
  try {
    const snap = await getDocs(collection(db, "waWebChatHistory"));
    if (!snap.empty) {
      snap.forEach(docSnap => {
        const ch = docSnap.data();
        if (ch.id && !waWebState.chats.has(ch.id)) {
          waWebState.chats.set(ch.id, {
            id: ch.id,
            name: ch.name || resolveContactName(ch.id),
            phone: ch.phone || ch.id.split('@')[0],
            isGroup: ch.isGroup || false,
            unreadCount: ch.unreadCount || 0,
            lastMessage: ch.lastMessage || '',
            timestamp: ch.timestamp || Date.now(),
            messages: ch.messages || []
          });
        }
      });
      console.log(`[WA-WEB HISTORY] Restored ${snap.size} text chats from Firestore`);
    }

    // Also load contact names from app contactBook
    const cbSnap = await getDoc(doc(db, "appData", "contacts"));
    if (cbSnap.exists()) {
      const contactsData = cbSnap.data();
      Object.entries(contactsData).forEach(([phone, info]) => {
        const contactName = info.leadName || info.manualName || '';
        if (contactName) {
          registerContact({ id: `${phone}@s.whatsapp.net`, name: contactName });
        }
      });
    }
  } catch (err) {
    console.warn('[WA-WEB HISTORY] Could not restore chat history from Firestore:', err.message);
  }
}

export async function initWaWeb(db = null) {
  if (db) globalDb = db;
  if (isInitializing) return;
  isInitializing = true;
  waWebState.error = null;

  try {
    // 1. Restore previous session auth & text history from Firestore
    await restoreSessionFromFirestore(globalDb);
    await restoreHistoryFromFirestore(globalDb);

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    
    let version;
    try {
      const v = await fetchLatestBaileysVersion();
      version = v.version;
    } catch (e) {
      version = [2, 3000, 1015901307];
    }

    waWebState.status = 'connecting';

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['WhatAnAgent Web', 'Chrome', '1.0.0'],
      syncFullHistory: true
    });

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      await syncSessionToFirestore(globalDb);
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        waWebState.rawQr = qr;
        try {
          waWebState.qrCodeDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            width: 300,
            color: { dark: '#111b21', light: '#ffffff' }
          });
          waWebState.status = 'qr_ready';
          console.log('[WA-WEB] QR Code generated and ready to scan');
        } catch (err) {
          console.error('[WA-WEB] Error generating QR data URL:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[WA-WEB] Connection closed (code: ${statusCode}). Reconnecting: ${shouldReconnect}`);

        waWebState.status = 'disconnected';
        waWebState.user = null;
        waWebState.qrCodeDataUrl = null;

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('[WA-WEB] Logged out - cleaning up auth files & Firestore session');
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
            if (globalDb) {
              const snap = await getDocs(collection(globalDb, "waWebSession"));
              snap.forEach(d => deleteDoc(d.ref));
            }
          } catch (e) {
            console.error('[WA-WEB] Error clearing auth session:', e);
          }
        }

        if (shouldReconnect) {
          setTimeout(() => {
            isInitializing = false;
            initWaWeb(globalDb);
          }, 3000);
        } else {
          isInitializing = false;
        }
      } else if (connection === 'open') {
        console.log('[WA-WEB] 🟢 WhatsApp Web connected successfully!');
        waWebState.status = 'connected';
        waWebState.qrCodeDataUrl = null;
        waWebState.rawQr = null;
        waWebState.user = sock.user || { id: 'unknown', name: 'WhatsApp User' };
        isInitializing = false;
        await syncSessionToFirestore(globalDb);
      }
    });

    // 1. Initial messaging history sync (Contacts + Chats + Last 7 Days messages)
    sock.ev.on('messaging-history.set', (history) => {
      try {
        const { chats, contacts, messages } = history;
        console.log(`[WA-WEB HISTORY] Syncing: ${contacts?.length || 0} contacts, ${chats?.length || 0} chats, ${messages?.length || 0} messages`);

        if (contacts && Array.isArray(contacts)) {
          contacts.forEach(c => registerContact(c));
        }

        if (chats && Array.isArray(chats)) {
          chats.forEach(ch => {
            if (ch.id && ch.id !== 'status@broadcast') {
              const cleanPhone = ch.id.split('@')[0].split(':')[0];
              const name = ch.name || resolveContactName(ch.id);
              let existing = waWebState.chats.get(ch.id);
              if (!existing) {
                existing = {
                  id: ch.id,
                  name: name,
                  phone: cleanPhone,
                  isGroup: ch.id.endsWith('@g.us'),
                  unreadCount: ch.unreadCount || 0,
                  lastMessage: '',
                  timestamp: ch.conversationTimestamp ? Number(ch.conversationTimestamp) * 1000 : Date.now(),
                  messages: []
                };
                waWebState.chats.set(ch.id, existing);
              } else {
                if (name && !name.startsWith('+')) existing.name = name;
              }
            }
          });
        }

        if (messages && Array.isArray(messages)) {
          messages.forEach(m => upsertMessageToChat(m, true));
        }

        // Re-resolve chat names across all chats
        waWebState.chats.forEach(chat => {
          chat.name = resolveContactName(chat.id, '', chat.name);
        });

        scheduleHistorySaveToFirestore();

      } catch (err) {
        console.error('[WA-WEB] Error in messaging-history.set:', err);
      }
    });

    // 2. Contacts events
    sock.ev.on('contacts.set', ({ contacts }) => {
      if (contacts && Array.isArray(contacts)) {
        contacts.forEach(c => registerContact(c));
      }
    });

    sock.ev.on('contacts.upsert', (contacts) => {
      if (contacts && Array.isArray(contacts)) {
        contacts.forEach(c => registerContact(c));
      }
    });

    sock.ev.on('contacts.update', (contacts) => {
      contacts.forEach(c => {
        if (c.id) {
          const prev = waWebState.contacts.get(c.id) || {};
          const merged = { ...prev, ...c };
          registerContact(merged);
        }
      });
    });

    // 3. Chats events
    sock.ev.on('chats.set', ({ chats }) => {
      if (chats && Array.isArray(chats)) {
        chats.forEach(ch => {
          if (ch.id && ch.id !== 'status@broadcast') {
            const cleanPhone = ch.id.split('@')[0].split(':')[0];
            const name = ch.name || resolveContactName(ch.id);
            let existing = waWebState.chats.get(ch.id);
            if (!existing) {
              existing = {
                id: ch.id,
                name: name,
                phone: cleanPhone,
                isGroup: ch.id.endsWith('@g.us'),
                unreadCount: ch.unreadCount || 0,
                lastMessage: '',
                timestamp: ch.conversationTimestamp ? Number(ch.conversationTimestamp) * 1000 : Date.now(),
                messages: []
              };
              waWebState.chats.set(ch.id, existing);
            }
          }
        });
      }
    });

    sock.ev.on('chats.upsert', (chats) => {
      if (chats && Array.isArray(chats)) {
        chats.forEach(ch => {
          if (ch.id && ch.id !== 'status@broadcast') {
            const cleanPhone = ch.id.split('@')[0].split(':')[0];
            const name = ch.name || resolveContactName(ch.id);
            let existing = waWebState.chats.get(ch.id);
            if (!existing) {
              existing = {
                id: ch.id,
                name: name,
                phone: cleanPhone,
                isGroup: ch.id.endsWith('@g.us'),
                unreadCount: ch.unreadCount || 0,
                lastMessage: '',
                timestamp: ch.conversationTimestamp ? Number(ch.conversationTimestamp) * 1000 : Date.now(),
                messages: []
              };
              waWebState.chats.set(ch.id, existing);
            }
          }
        });
      }
    });

    // 4. Live messages incoming
    sock.ev.on('messages.upsert', async (m) => {
      try {
        if (!m.messages || m.messages.length === 0) return;
        m.messages.forEach(msg => upsertMessageToChat(msg, false));
      } catch (err) {
        console.error('[WA-WEB] Error in messages.upsert:', err);
      }
    });

  } catch (err) {
    console.error('[WA-WEB] Initialization error:', err);
    waWebState.status = 'disconnected';
    waWebState.error = err.message;
    isInitializing = false;
  }
}

// Helper: Download full media on-demand when clicked
export async function downloadWaWebMedia(jid, msgId) {
  if (!sock) throw new Error('WhatsApp Web not connected');
  const rawMsg = rawMessagesMap.get(`${jid}_${msgId}`);
  if (!rawMsg) throw new Error('Message media is no longer in temporary memory cache');

  try {
    const buffer = await downloadMediaMessage(
      rawMsg,
      'buffer',
      {},
      {
        logger: pino({ level: 'silent' }),
        reuploadRequest: sock.updateMediaMessage
      }
    );

    const { mediaType, mediaInfo } = parseMessageContent(rawMsg);
    return {
      buffer,
      mimetype: mediaInfo?.mimetype || 'application/octet-stream',
      fileName: mediaInfo?.fileName || `media_${msgId}`
    };
  } catch (err) {
    throw new Error('Failed to download media: ' + err.message);
  }
}

// Helper: Get status & user details
export function getWaWebStatus() {
  const userPhone = waWebState.user?.id ? waWebState.user.id.split(':')[0].split('@')[0] : null;
  return {
    status: waWebState.status,
    user: waWebState.user ? {
      phone: userPhone,
      name: waWebState.user.name || `+${userPhone}`
    } : null,
    qr: waWebState.qrCodeDataUrl,
    error: waWebState.error,
    chatCount: waWebState.chats.size
  };
}

// Helper: Get chat list sorted by latest activity
export function getWaWebChats() {
  const list = Array.from(waWebState.chats.values()).map(c => ({
    id: c.id,
    name: c.name || resolveContactName(c.id, '', c.phone),
    phone: c.phone || c.id.split('@')[0].split(':')[0],
    isGroup: c.isGroup || false,
    lastMessage: c.lastMessage || '',
    timestamp: c.timestamp || Date.now(),
    unreadCount: c.unreadCount || 0
  }));

  list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return list;
}

// Helper: Get message history for a chat
export function getWaWebMessages(jid) {
  const chat = waWebState.chats.get(jid);
  if (!chat) return [];
  chat.unreadCount = 0;
  return chat.messages || [];
}

// Helper: Send message
export async function sendWaWebMessage(to, text) {
  if (waWebState.status !== 'connected' || !sock) {
    throw new Error('WhatsApp Web is not connected. Please scan QR code first.');
  }

  let jid = to.trim();
  if (!jid.includes('@')) {
    const cleanDigits = jid.replace(/\D/g, '');
    jid = `${cleanDigits}@s.whatsapp.net`;
  }

  const result = await sock.sendMessage(jid, { text: text });
  
  // Also store in local history
  let chat = waWebState.chats.get(jid);
  const timestamp = Date.now();
  const cleanPhone = jid.split('@')[0].split(':')[0];
  const name = resolveContactName(jid, '', cleanPhone);

  if (!chat) {
    chat = {
      id: jid,
      name: name,
      phone: cleanPhone,
      isGroup: jid.endsWith('@g.us'),
      unreadCount: 0,
      lastMessage: text,
      timestamp: timestamp,
      messages: []
    };
    waWebState.chats.set(jid, chat);
  } else {
    chat.lastMessage = text;
    chat.timestamp = timestamp;
  }

  chat.messages.push({
    id: result?.key?.id || `out_${Date.now()}`,
    fromMe: true,
    senderName: 'You',
    text: text,
    timestamp: timestamp,
    mediaType: null,
    mediaInfo: null
  });

  scheduleHistorySaveToFirestore();

  return { success: true, messageId: result?.key?.id };
}

// Helper: Logout & reset
export async function logoutWaWeb() {
  try {
    if (sock) {
      await sock.logout();
    }
  } catch (e) {}

  waWebState.status = 'disconnected';
  waWebState.qrCodeDataUrl = null;
  waWebState.rawQr = null;
  waWebState.user = null;
  waWebState.chats.clear();
  waWebState.contacts.clear();

  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    if (globalDb) {
      const snap = await getDocs(collection(globalDb, "waWebSession"));
      snap.forEach(d => deleteDoc(d.ref));
    }
  } catch (e) {}

  isInitializing = false;
  setTimeout(() => initWaWeb(globalDb), 1500);
  return { success: true };
}
