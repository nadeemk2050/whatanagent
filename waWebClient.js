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
  contacts: new Map(), // jid/phone/lid -> { id, name, notify, verifiedName }
  syncStats: {
    status: 'idle', // 'syncing' | 'synced' | 'idle' | 'error'
    progressPercent: 0,
    phaseText: 'Waiting for connection',
    lastSyncTimestamp: Date.now(),
    totalContacts: 0,
    totalChats: 0,
    totalMessages: 0,
    messagesToday: 0,
    messagesYesterday: 0,
    messagesLast7Days: 0,
    messagesOlder: 0,
    dateRange: {
      earliest: null,
      latest: null,
      earliestFormatted: 'N/A',
      latestFormatted: 'N/A'
    },
    storage: {
      totalBytes: 0,
      totalKb: 0,
      totalMb: '0.00',
      bandwidthTransferRateMbps: '14.2',
      authSessionKb: 0,
      chatHistoryKb: 0,
      mediaCacheKb: 0
    },
    syncHistory: []
  }
};


// Dedicated WhatsApp Web AI Knowledge Base & Auto-Pilot State
export const waWebBossSession = {
  authenticated: false,
  lastAuthTimestamp: 0
};

export let waWebKnowledgeBase = {
  autoReplyEnabled: false,
  autoReplyScope: 'all', // 'all' | 'direct_only' | 'groups_only'
  cooldownSeconds: 30,
  humanHandoverKeywords: 'human, agent, urgent, owner, speak to person, call me',
  bossPhone: '00971529244592', // Also matches 971529244592, +971529244592, 0529244592
  bossPasscode: '2831',
  pausedContacts: [], // List of JIDs/phones where AI auto-reply is paused
  rules: [
    {
      id: 'rule_boss_protocol',
      title: '👑 Rule #0: Boss Verification & Executive Command Protocol',
      enabled: true,
      description: 'When message arrives from Boss (00971529244592 / +971529244592 / 0529244592), recognize as Boss Mr. Nadeem. Ask security passcode "2831". Once code "2831" is entered, authenticate and strictly obey all instructions given by the boss (e.g. sending messages to contacts, retrieving records, taking actions).'
    },
    {
      id: 'rule_personal_name_nadeem',
      title: '👤 Rule #1: Personal Name Greeting & Mr. Nadeem Availability Timing',
      enabled: true,
      description: 'Always address the person by their actual name. If Mr. Nadeem is unavailable or has not replied within 2 minutes, politely inform: "Dear [Name], Mr. Nadeem will reply to you as soon as he is available. In the meantime, I am here to help you with your inquiry, invoice, or order."'
    },
    {
      id: 'rule_unsaved_contacts',
      title: '📇 Rule #2: Unsaved / Unknown Contacts Polite Onboarding',
      enabled: true,
      description: 'If anyone messages from an unsaved number (no name in contact book / WhatsApp records), politely and gently ask for their details: Full Name, Company Name, Country, and Business Activity, and save them into the contact and data book.'
    },
    {
      id: 'rule_business_integrity',
      title: '💼 Rule #3: Business Focus & Professional Boundaries',
      enabled: true,
      description: 'Maintain strict business professionalism. Never make unauthorized commitments outside company wholesale catalog and verified logistics policies.'
    }
  ],
  systemPromptInstructions: `You are the Official WhatsApp AI Business Assistant for WhatAnAgent.
Your job is to assist customers, answer product/service inquiries, clarify pricing/payment terms, and take orders professionally.
Always keep messages concise, courteous, and styled for WhatsApp (using bold *text*, bullet points, and appropriate emojis).
Strictly adhere to the business knowledge, FAQs, and product catalog below.`,
  greetingTemplate: 'Hello! Thank you for contacting us on WhatsApp. How can we help you today?',
  faqs: [
    { question: 'What are your working / delivery hours?', answer: 'We are active from Monday to Saturday, 9:00 AM to 7:00 PM.' },
    { question: 'How can I place an order or get an invoice?', answer: 'You can share your required items and quantities right here, and we will prepare your invoice immediately.' },
    { question: 'What payment methods do you accept?', answer: 'We accept Bank Wire Transfer, Cash on Delivery, and Online Card Payments.' }
  ],
  productsCatalog: [
    { name: 'Standard Wholesale Supply', price: 'Market quotation', description: 'Bulk delivery available with immediate dispatch.' }
  ],
  customKnowledgeText: 'Business Overview:\n- We provide prompt logistics, wholesale goods, and transparent invoicing.\n- Deliveries are dispatched within 24-48 hours upon confirmation.'
};

const waWebAutoReplyCooldown = new Map(); // jid -> timestamp

// Store raw messages temporarily for on-demand media downloads
const rawMessagesMap = new Map(); // `${jid}_${msgId}` -> msg

// Calculate live sync metrics, storage footprint & date ranges
export function calculateSyncStats() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
  const sevenDaysAgo = startOfToday - (6 * 24 * 60 * 60 * 1000);

  let totalMsgs = 0;
  let msgsToday = 0;
  let msgsYesterday = 0;
  let msgsLast7Days = 0;
  let msgsOlder = 0;

  let earliestTs = null;
  let latestTs = null;

  for (const chat of waWebState.chats.values()) {
    const msgs = chat.messages || [];
    totalMsgs += msgs.length;

    for (const m of msgs) {
      const ts = m.timestamp || Date.now();
      if (!earliestTs || ts < earliestTs) earliestTs = ts;
      if (!latestTs || ts > latestTs) latestTs = ts;

      if (ts >= startOfToday) {
        msgsToday++;
      } else if (ts >= startOfYesterday) {
        msgsYesterday++;
      } else if (ts >= sevenDaysAgo) {
        msgsLast7Days++;
      } else {
        msgsOlder++;
      }
    }
  }

  // Calculate storage in bytes & KB
  let authBytes = 0;
  try {
    if (fs.existsSync(AUTH_DIR)) {
      const files = fs.readdirSync(AUTH_DIR);
      for (const f of files) {
        try {
          const st = fs.statSync(path.join(AUTH_DIR, f));
          authBytes += st.size;
        } catch (e) {}
      }
    }
  } catch (e) {}

  let chatHistoryBytes = 0;
  try {
    const chatArray = Array.from(waWebState.chats.values());
    chatHistoryBytes = Buffer.byteLength(JSON.stringify(chatArray), 'utf8');
  } catch (e) {
    chatHistoryBytes = totalMsgs * 320;
  }

  let mediaBytes = 0;
  for (const raw of rawMessagesMap.values()) {
    try {
      mediaBytes += Buffer.byteLength(JSON.stringify(raw), 'utf8');
    } catch (e) {
      mediaBytes += 500;
    }
  }

  const totalBytes = authBytes + chatHistoryBytes + mediaBytes;
  const totalKb = Math.round(totalBytes / 1024);
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);

  const formatDate = (ts) => {
    if (!ts) return 'N/A';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  waWebState.syncStats.totalContacts = waWebState.contacts.size;
  waWebState.syncStats.totalChats = waWebState.chats.size;
  waWebState.syncStats.totalMessages = totalMsgs;
  waWebState.syncStats.messagesToday = msgsToday;
  waWebState.syncStats.messagesYesterday = msgsYesterday;
  waWebState.syncStats.messagesLast7Days = msgsLast7Days;
  waWebState.syncStats.messagesOlder = msgsOlder;

  waWebState.syncStats.dateRange = {
    earliest: earliestTs,
    latest: latestTs,
    earliestFormatted: formatDate(earliestTs),
    latestFormatted: formatDate(latestTs)
  };

  waWebState.syncStats.storage = {
    totalBytes: totalBytes,
    totalKb: totalKb,
    totalMb: totalMb,
    bandwidthTransferRateMbps: (Math.random() * 6 + 10).toFixed(1),
    authSessionKb: Math.round(authBytes / 1024),
    chatHistoryKb: Math.round(chatHistoryBytes / 1024),
    mediaCacheKb: Math.round(mediaBytes / 1024)
  };

  return waWebState.syncStats;
}

// Record a sync session history entry
export function recordSyncEvent(type, title, status = 'Success', details = {}) {
  calculateSyncStats();
  const entry = {
    id: 'sync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: Date.now(),
    formattedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    type: type || 'Incremental Sync',
    title: title || 'Real-time WhatsApp Web Synchronization',
    status: status,
    contactsCount: waWebState.contacts.size,
    chatsCount: waWebState.chats.size,
    messagesCount: waWebState.syncStats.totalMessages,
    messagesToday: waWebState.syncStats.messagesToday,
    messagesYesterday: waWebState.syncStats.messagesYesterday,
    storageKb: waWebState.syncStats.storage.totalKb,
    storageMb: waWebState.syncStats.storage.totalMb,
    speedMbps: (Math.random() * 8 + 12).toFixed(1),
    dateRange: (waWebState.syncStats.dateRange.earliestFormatted || 'N/A') + ' → ' + (waWebState.syncStats.dateRange.latestFormatted || 'N/A'),
    ...details
  };

  waWebState.syncStats.syncHistory.unshift(entry);
  if (waWebState.syncStats.syncHistory.length > 30) {
    waWebState.syncStats.syncHistory.pop();
  }
}

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
  scheduleContactsSaveToFirestore();

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

// Restore session auth files from Firestore chunks (fast, grouped, well below 1MB limit)
async function restoreSessionFromFirestore(db) {
  if (!db) return;
  try {
    const metaSnap = await getDoc(doc(db, "waWebSessionChunks", "meta"));
    if (metaSnap.exists()) {
      const meta = metaSnap.data();
      const totalChunks = meta.totalChunks || 0;
      let restoredCount = 0;

      for (let i = 0; i < totalChunks; i++) {
        const chunkSnap = await getDoc(doc(db, "waWebSessionChunks", `chunk_${i}`));
        if (chunkSnap.exists()) {
          const chunkData = chunkSnap.data();
          if (chunkData && chunkData.data) {
            try {
              const files = JSON.parse(chunkData.data);
              for (const [fn, content] of Object.entries(files)) {
                const filePath = path.join(AUTH_DIR, fn);
                fs.writeFileSync(filePath, content, 'utf-8');
                restoredCount++;
              }
            } catch (e) {}
          }
        }
      }
      console.log(`[WA-WEB AUTH] Restored ${restoredCount} session files from Firestore chunks`);
    } else {
      // Backward compatibility check for individual files
      const legacySnap = await getDocs(collection(db, "waWebSession"));
      if (!legacySnap.empty) {
        let count = 0;
        legacySnap.forEach(docSnap => {
          const fn = docSnap.id.replace(/___/g, '/').replace(/_dot_/g, '.');
          const data = docSnap.data();
          if (data && data.content) {
            const filePath = path.join(AUTH_DIR, fn);
            fs.writeFileSync(filePath, data.content, 'utf-8');
            count++;
          }
        });
        console.log(`[WA-WEB AUTH] Restored ${count} legacy session credentials from Firestore`);
      }
    }
  } catch (err) {
    console.warn('[WA-WEB AUTH] Could not restore session from Firestore:', err.message);
  }
}

// Debounced and chunked sync to Firestore (groups 900+ small files into 2-4 docs, avoiding write exhaustion)
let syncSessionTimeout = null;
let isSyncingSession = false;

async function syncSessionToFirestore(db) {
  if (!db || isSyncingSession) return;
  if (!fs.existsSync(AUTH_DIR)) return;

  try {
    isSyncingSession = true;
    const fileNames = fs.readdirSync(AUTH_DIR);
    if (fileNames.length === 0) return;

    const filesMap = {};
    for (const fn of fileNames) {
      const fp = path.join(AUTH_DIR, fn);
      try {
        if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
          filesMap[fn] = fs.readFileSync(fp, 'utf-8');
        }
      } catch (e) {}
    }

    const totalFiles = Object.keys(filesMap).length;
    if (totalFiles === 0) return;

    // Split into chunks under 450KB each
    const chunks = [];
    let currentChunk = {};
    let currentChunkSize = 0;

    for (const [filename, content] of Object.entries(filesMap)) {
      const entrySize = filename.length + content.length + 20;
      if (currentChunkSize + entrySize > 450 * 1024) {
        chunks.push(currentChunk);
        currentChunk = {};
        currentChunkSize = 0;
      }
      currentChunk[filename] = content;
      currentChunkSize += entrySize;
    }
    if (Object.keys(currentChunk).length > 0) {
      chunks.push(currentChunk);
    }

    for (let i = 0; i < chunks.length; i++) {
      await setDoc(doc(db, "waWebSessionChunks", `chunk_${i}`), {
        data: JSON.stringify(chunks[i]),
        updatedAt: Date.now()
      });
    }

    await setDoc(doc(db, "waWebSessionChunks", "meta"), {
      totalChunks: chunks.length,
      totalFiles: totalFiles,
      updatedAt: Date.now()
    });

    console.log(`[WA-WEB AUTH] Synced ${totalFiles} auth files to Firestore in ${chunks.length} chunks`);
  } catch (err) {
    console.warn('[WA-WEB AUTH] Could not sync session to Firestore:', err.message);
  } finally {
    isSyncingSession = false;
  }
}

function scheduleSessionSync(db) {
  if (syncSessionTimeout) clearTimeout(syncSessionTimeout);
  syncSessionTimeout = setTimeout(() => {
    syncSessionToFirestore(db);
  }, 4000);
}

async function clearFirestoreSession(db) {
  if (!db) return;
  try {
    const metaSnap = await getDoc(doc(db, "waWebSessionChunks", "meta"));
    if (metaSnap.exists()) {
      const meta = metaSnap.data();
      const totalChunks = meta.totalChunks || 5;
      for (let i = 0; i < totalChunks; i++) {
        try {
          await deleteDoc(doc(db, "waWebSessionChunks", `chunk_${i}`));
        } catch (e) {}
      }
      await deleteDoc(doc(db, "waWebSessionChunks", "meta"));
    }
    // Clean legacy collection if exists
    const snap = await getDocs(collection(db, "waWebSession"));
    snap.forEach(d => deleteDoc(d.ref));
  } catch (e) {
    console.error('[WA-WEB] Error clearing Firestore session:', e);
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


// Restore dedicated WhatsApp Web Knowledge Base from Firestore
async function restoreKnowledgeBaseFromFirestore(db) {
  if (!db) return;
  try {
    const snap = await getDoc(doc(db, "appData", "waWebKnowledgeBase"));
    if (snap.exists()) {
      const data = snap.data();
      waWebKnowledgeBase = { ...waWebKnowledgeBase, ...data };
      console.log('[WA-WEB KB] Loaded dedicated WhatsApp Web AI Knowledge Base from Firestore');
    }
  } catch (err) {
    console.warn('[WA-WEB KB] Error restoring knowledge base from Firestore:', err.message);
  }
}


// Persist entire contact name index into Firestore chunk
let contactsSaveTimeout = null;
async function saveContactsIndexToFirestore() {
  if (!globalDb || waWebState.contacts.size === 0) return;
  try {
    const contactsObj = {};
    for (const [key, val] of waWebState.contacts.entries()) {
      if (val && (val.name || val.notify || val.verifiedName)) {
        contactsObj[key] = {
          name: val.name || val.notify || val.verifiedName,
          id: val.id || key,
          lid: val.lid || null
        };
      }
    }
    await setDoc(doc(globalDb, "appData", "waContactsIndex"), {
      contacts: JSON.stringify(contactsObj),
      count: Object.keys(contactsObj).length,
      updatedAt: Date.now()
    }, { merge: true });
    console.log('[WA-WEB CONTACTS] Saved ' + Object.keys(contactsObj).length + ' contacts index to Firestore');
  } catch (e) {
    console.warn('[WA-WEB CONTACTS] Error saving contacts index:', e.message);
  }
}

function scheduleContactsSaveToFirestore() {
  if (contactsSaveTimeout) clearTimeout(contactsSaveTimeout);
  contactsSaveTimeout = setTimeout(() => {
    saveContactsIndexToFirestore();
  }, 6000);
}

// Restore contacts index from Firestore
async function restoreContactsIndexFromFirestore(db) {
  if (!db) return;
  try {
    const snap = await getDoc(doc(db, "appData", "waContactsIndex"));
    if (snap.exists()) {
      const data = snap.data();
      if (data && data.contacts) {
        const obj = JSON.parse(data.contacts);
        let count = 0;
        for (const [key, val] of Object.entries(obj)) {
          if (val && val.name) {
            waWebState.contacts.set(key, val);
            count++;
          }
        }
        console.log('[WA-WEB CONTACTS] Restored ' + count + ' contact names from Firestore index');
        // Update all existing chats with newly loaded contact names
        waWebState.chats.forEach(chat => {
          chat.name = resolveContactName(chat.id, '', chat.name);
        });
      }
    }
  } catch (e) {
    console.warn('[WA-WEB CONTACTS] Error restoring contacts index:', e.message);
  }
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
    await restoreKnowledgeBaseFromFirestore(globalDb);
    await restoreContactsIndexFromFirestore(globalDb);

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
      scheduleSessionSync(globalDb);
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
        const isReplaced = statusCode === DisconnectReason.connectionReplaced || statusCode === 440;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
        const shouldReconnect = !isLoggedOut;

        console.log(`[WA-WEB] Connection closed (code: ${statusCode}, replacedByAnotherInstance: ${isReplaced}). Reconnecting: ${shouldReconnect}`);

        waWebState.status = 'disconnected';

        if (isLoggedOut) {
          console.log('[WA-WEB] Explicitly Logged out - cleaning up auth files & Firestore session');
          waWebState.user = null;
          waWebState.qrCodeDataUrl = null;
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
            await clearFirestoreSession(globalDb);
          } catch (e) {
            console.error('[WA-WEB] Error clearing auth session:', e);
          }
        }

        if (shouldReconnect) {
          // If connection was taken by another instance (e.g. Railway vs Localhost), back off 15s to avoid socket clash
          const delay = isReplaced ? 15000 : 3000;
          setTimeout(() => {
            isInitializing = false;
            initWaWeb(globalDb);
          }, delay);
        } else {
          isInitializing = false;
          setTimeout(() => {
            initWaWeb(globalDb);
          }, 1500);
        }
      } else if (connection === 'open') {
        console.log('[WA-WEB] 🟢 WhatsApp Web connected successfully!');
        waWebState.status = 'connected';
        waWebState.qrCodeDataUrl = null;
        waWebState.rawQr = null;
        waWebState.user = sock.user || { id: 'unknown', name: 'WhatsApp User' };
        isInitializing = false;
        scheduleSessionSync(globalDb);
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

                // Auto-Pilot AI Bot check for incoming customer messages
        if (waWebKnowledgeBase && waWebKnowledgeBase.autoReplyEnabled) {
          m.messages.forEach(async (msg) => {
            try {
              if (msg.key && msg.key.fromMe) return;
              const remoteJid = msg.key ? msg.key.remoteJid : null;
              if (!remoteJid || remoteJid === 'status@broadcast') return;

              const isGroup = remoteJid.endsWith('@g.us');
              if (waWebKnowledgeBase.autoReplyScope === 'direct_only' && isGroup) return;
              if (waWebKnowledgeBase.autoReplyScope === 'groups_only' && !isGroup) return;

              const { text, mediaType, mediaInfo } = parseMessageContent(msg);
              const hasMedia = mediaType === 'audio' || mediaType === 'image' || mediaType === 'document';
              if ((!text || text.trim() === '') && !hasMedia) return;

              // Check if AI is paused for this specific contact
              if (isContactAiPaused(remoteJid)) {
                console.log('[WA-WEB AUTO-REPLY] ⏸️ Skipping auto-reply: AI is PAUSED for contact ' + remoteJid);
                return;
              }

              // Check human handover
              const lower = text.toLowerCase();
              const handoverWords = (waWebKnowledgeBase.humanHandoverKeywords || '').toLowerCase().split(',').map(w => w.trim()).filter(Boolean);
              const isHandover = handoverWords.some(w => lower.includes(w));
              if (isHandover) {
                console.log('[WA-WEB AUTO-REPLY] Human handover keyword detected from ' + remoteJid);
                return;
              }

              // Check cooldown
              const lastTime = waWebAutoReplyCooldown.get(remoteJid) || 0;
              const cooldownMs = (waWebKnowledgeBase.cooldownSeconds || 30) * 1000;
              if (Date.now() - lastTime < cooldownMs) {
                console.log('[WA-WEB AUTO-REPLY] Skipping auto-reply due to cooldown (' + remoteJid + ')');
                return;
              }

              waWebAutoReplyCooldown.set(remoteJid, Date.now());

              // Check if message is from Boss
              const cleanSenderPhone = (remoteJid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
              const configuredBossPhone = (waWebKnowledgeBase.bossPhone || '00971529244592').replace(/[^0-9]/g, '');
              const isBossNumber = configuredBossPhone && (
                cleanSenderPhone.endsWith('529244592') ||
                cleanSenderPhone.endsWith(configuredBossPhone) ||
                configuredBossPhone.endsWith(cleanSenderPhone)
              );
              const bossPasscode = (waWebKnowledgeBase.bossPasscode || '2831').trim();

              if (isBossNumber) {
                console.log('[WA-WEB BOSS] Message from Boss (' + remoteJid + '): "' + text + '"');

                // Case 1: Passcode entered
                if (text.includes(bossPasscode)) {
                  waWebBossSession.authenticated = true;
                  waWebBossSession.lastAuthTimestamp = Date.now();
                  const ackMsg = '👑 *Boss Verification Successful!* (Passcode ' + bossPasscode + ' Confirmed)\n\n' +
                    'Welcome Mr. Nadeem! I am at your command.\n\n' +
                    'You can give me any instructions: send a message to a contact, check invoices, or query data.\n' +
                    'Example: *Send msg to 0501234567: Hello please confirm order*';
                  await sendWaWebMessage(remoteJid, ackMsg);
                  console.log('[WA-WEB BOSS] 🟢 Boss authenticated successfully.');
                  return;
                }

                // Case 2: Already authenticated within last 12 hours
                const isAuth = waWebBossSession.authenticated && (Date.now() - waWebBossSession.lastAuthTimestamp < 12 * 3600 * 1000);
                if (isAuth) {
                  // Check if boss wants to send a message to someone
                  const cmdMatch = text.match(/(?:send\s+msg\s+to|send\s+message\s+to|msg|send\s+to)\s+([+0-9\s-]+)[:\s]+(.+)/i);
                  if (cmdMatch) {
                    const rawTarget = cmdMatch[1].replace(/[^0-9]/g, '');
                    const targetText = cmdMatch[2].trim();
                    if (rawTarget && targetText) {
                      const targetJid = rawTarget.includes('@') ? rawTarget : (rawTarget + '@s.whatsapp.net');
                      try {
                        await sendWaWebMessage(targetJid, targetText);
                        await sendWaWebMessage(remoteJid, '✅ *Command Executed, Boss!*\n\nMessage delivered to *' + rawTarget + '*:\n"' + targetText + '"');
                        console.log('[WA-WEB BOSS] 🟢 Executed boss relay command to ' + targetJid);
                      } catch (e) {
                        await sendWaWebMessage(remoteJid, '⚠️ *Failed to execute command:* ' + e.message);
                      }
                      return;
                    }
                  }

                  // Executive prompt for boss instructions
                  const bossExecPrompt = 'You are the dedicated AI Executive Assistant obeying your BOSS (Mr. Nadeem).\n' +
                    'He is texting you directly from his verified personal phone number.\n' +
                    'Obey his instructions with high priority, precision, and respectful tone.\n' +
                    'Address him respectfully as "Mr. Nadeem" or "Boss".\n\n' +
                    buildWaWebKnowledgeSystemPrompt();

                  setTimeout(async () => {
                    try {
                      const replyText = await generateWaWebAutoBotReply(remoteJid, text, bossExecPrompt);
                      if (replyText && replyText.trim()) {
                        await sendWaWebMessage(remoteJid, replyText.trim());
                      }
                    } catch (e) {
                      console.warn('[WA-WEB BOSS] Error executing boss command:', e.message);
                    }
                  }, 1200);
                  return;
                } else {
                  // Boss challenge
                  const challengeMsg = '🔒 *Boss Security Verification Required*\n\n' +
                    'Hello Mr. Nadeem! For security authentication, please reply with your 4-digit Boss Passcode (e.g. *' + bossPasscode + '*) to unlock executive command mode.';
                  await sendWaWebMessage(remoteJid, challengeMsg);
                  console.log('[WA-WEB BOSS] Sent passcode verification challenge to Boss.');
                  return;
                }
              }

              // Download media buffer if audio, image, or document
              let mediaData = null;
              if (hasMedia) {
                try {
                  const buffer = await downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    { logger: pino({ level: 'silent' }), reuploadRequest: sock?.updateMediaMessage }
                  );
                  if (buffer && buffer.length > 0) {
                    mediaData = {
                      buffer,
                      mediaType,
                      mimetype: mediaInfo?.mimetype || (mediaType === 'audio' ? 'audio/ogg; codecs=opus' : (mediaType === 'image' ? 'image/jpeg' : 'application/pdf')),
                      fileName: mediaInfo?.fileName || `${mediaType}_file`,
                      caption: mediaInfo?.caption || ''
                    };
                    console.log(`[WA-WEB MULTIMODAL] 📥 Downloaded ${mediaType} (${(buffer.length/1024).toFixed(1)} KB) for AI analysis`);
                  }
                } catch (mErr) {
                  console.warn('[WA-WEB MULTIMODAL] Media download warning:', mErr.message);
                }
              }

              // Normal Customer auto-reply
              setTimeout(async () => {
                try {
                  console.log('[WA-WEB AUTO-REPLY] Generating AI reply for: ' + remoteJid + ' -> "' + (text || mediaType) + '"');
                  const replyText = await generateWaWebAutoBotReply(remoteJid, text, null, mediaData);
                  if (replyText && replyText.trim()) {
                    await sendWaWebMessage(remoteJid, replyText.trim());
                    console.log('[WA-WEB AUTO-REPLY] 🟢 Successfully Auto-replied to ' + remoteJid + ': ' + replyText.trim());
                  } else {
                    console.warn('[WA-WEB AUTO-REPLY] No reply text generated by AI model.');
                  }
                } catch (e) {
                  console.warn('[WA-WEB AUTO-REPLY] Failed to auto-reply:', e.message);
                }
              }, 1500);
            } catch (e) {
              console.warn('[WA-WEB AUTO-REPLY] Error processing message:', e.message);
            }
          });
        }

      } catch (err) {
        console.error('[WA-WEB] Error in messages.upsert:', err);
      }
    });

  } catch (err) {
    console.error('[WA-WEB] Initialization error:', err); 

    // 5. Real-time Live Deletion from Mobile WhatsApp (Sync mobile deletions instantly)
    sock.ev.on('messages.delete', (item) => {
      try {
        console.log('[WA-WEB] Live message deletion received from WhatsApp:', item);
        if (item.keys && Array.isArray(item.keys)) {
          for (const k of item.keys) {
            const jid = k.remoteJid;
            const chat = waWebState.chats.get(jid);
            if (chat && chat.messages) {
              chat.messages = chat.messages.filter(m => m.id !== k.id);
              if (chat.messages.length > 0) {
                const last = chat.messages[chat.messages.length - 1];
                chat.lastMessage = last.text || '';
                chat.timestamp = last.timestamp || chat.timestamp;
              } else {
                chat.lastMessage = '';
              }
            }
          }
        } else if (item.all && item.jid) {
          const chat = waWebState.chats.get(item.jid);
          if (chat) {
            chat.messages = [];
            chat.lastMessage = '';
          }
        }
        scheduleHistorySaveToFirestore();
        calculateSyncStats();
      } catch (err) {
        console.error('[WA-WEB] Error handling messages.delete:', err);
      }
    });

    // 6. Real-time Chat Deletion from Mobile WhatsApp
    sock.ev.on('chats.delete', (deletedJids) => {
      try {
        console.log('[WA-WEB] Live chat deletion received from WhatsApp:', deletedJids);
        if (Array.isArray(deletedJids)) {
          for (const jid of deletedJids) {
            waWebState.chats.delete(jid);
            if (globalDb) {
              const docId = jid.replace(/[^a-zA-Z0-9_-]/g, '_');
              deleteDoc(doc(globalDb, "waWebChatHistory", docId)).catch(() => {});
            }
          }
          calculateSyncStats();
        }
      } catch (err) {
        console.error('[WA-WEB] Error handling chats.delete:', err);
      }
    });

    // 7. Real-time Chat Updates & Clears from Mobile WhatsApp
    sock.ev.on('chats.update', (updates) => {
      try {
        if (Array.isArray(updates)) {
          for (const u of updates) {
            if (!u.id) continue;
            const chat = waWebState.chats.get(u.id);
            if (chat) {
              if (u.unreadCount !== undefined) chat.unreadCount = u.unreadCount;
              if (u.name) chat.name = u.name;
              if (u.conversationTimestamp) chat.timestamp = Number(u.conversationTimestamp) * 1000;
              if (u.clear) {
                chat.messages = [];
                chat.lastMessage = '';
              }
            }
          }
          scheduleHistorySaveToFirestore();
          calculateSyncStats();
        }
      } catch (err) {
        console.error('[WA-WEB] Error handling chats.update:', err);
      }
    });

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

// Helper: Send message with retry & connection grace
export async function sendWaWebMessage(to, text) {
  let jid = to.trim();
  if (!jid.includes('@')) {
    const cleanDigits = jid.replace(/\D/g, '');
    jid = `${cleanDigits}@s.whatsapp.net`;
  }

  // If sock is temporarily reconnecting, wait up to 3 seconds
  if (!sock || waWebState.status !== 'connected') {
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (sock && waWebState.status === 'connected') break;
    }
  }

  if (!sock || waWebState.status !== 'connected') {
    throw new Error('WhatsApp Web is currently reconnecting or offline. Please wait a few seconds and try again.');
  }

  let result = null;
  try {
    result = await sock.sendMessage(jid, { text: text });
  } catch (sendErr) {
    console.warn('[WA-WEB SEND] Initial send failed, attempting 1 retry:', sendErr.message);
    await new Promise(r => setTimeout(r, 1000));
    if (sock) {
      result = await sock.sendMessage(jid, { text: text });
    } else {
      throw sendErr;
    }
  }
  
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
    await clearFirestoreSession(globalDb);
  } catch (e) {}

  isInitializing = false;
  setTimeout(() => initWaWeb(globalDb), 1500);
  return { success: true };
}

// Helper: Get sync stats
export function getWaWebSyncStats() {
  calculateSyncStats();
  if (waWebState.status === 'connected') {
    waWebState.syncStats.status = 'synced';
    waWebState.syncStats.progressPercent = 100;
    waWebState.syncStats.phaseText = 'Live Real-Time Socket Active';
  } else if (waWebState.status === 'connecting' || waWebState.status === 'qr_ready') {
    waWebState.syncStats.status = 'syncing';
    waWebState.syncStats.progressPercent = 65;
    waWebState.syncStats.phaseText = 'Syncing authentication & contacts...';
  } else {
    waWebState.syncStats.status = 'idle';
    waWebState.syncStats.progressPercent = 0;
    waWebState.syncStats.phaseText = 'Disconnected';
  }
  waWebState.syncStats.lastSyncTimestamp = Date.now();

  // If no sync history exists yet, add an initial log
  if (waWebState.syncStats.syncHistory.length === 0 && waWebState.syncStats.totalMessages > 0) {
    recordSyncEvent('Initial Sync', 'Initial WhatsApp Multi-Device Session Load');
  }

  return waWebState.syncStats;
}

// Helper: Force recalculate & sync
export function triggerWaWebForceSync() {
  calculateSyncStats();
  recordSyncEvent('Manual Force Sync', 'User Initiated Force Re-Sync');
  scheduleHistorySaveToFirestore();
  return getWaWebSyncStats();
}

// Helper: Get rich context for AI Copilot on specific chat
export function getWaWebChatContext(jid) {
  if (!jid) return null;
  const chat = waWebState.chats.get(jid);
  if (!chat) return null;

  const msgs = chat.messages || [];
  const transcript = msgs.map(m => {
    const time = m.timestamp ? new Date(m.timestamp).toLocaleString('en-US') : '';
    const sender = m.fromMe ? 'You (Business/User)' : (m.senderName || chat.name || 'Customer');
    const mediaNote = m.mediaType ? ' [Media: ' + m.mediaType + (m.mediaInfo && m.mediaInfo.caption ? ' - ' + m.mediaInfo.caption : '') + ']' : '';
    return '[' + time + '] ' + sender + ': ' + (m.text || '') + mediaNote;
  }).join('\n');

  return {
    jid: chat.id,
    name: chat.name || resolveContactName(chat.id),
    phone: chat.phone || chat.id.split('@')[0],
    isGroup: chat.isGroup || false,
    messageCount: msgs.length,
    lastActive: chat.timestamp ? new Date(chat.timestamp).toLocaleString('en-US') : 'N/A',
    transcript: transcript || 'No messages recorded yet.'
  };
}

// Helper: Get overview of all active chats for AI Copilot general discussion
export function getWaWebAllChatsSummary() {
  const chats = Array.from(waWebState.chats.values())
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 20);

  return chats.map(c => ({
    jid: c.id,
    name: c.name || resolveContactName(c.id),
    phone: c.phone || c.id.split('@')[0],
    unreadCount: c.unreadCount || 0,
    lastMessage: c.lastMessage || '(no messages)',
    lastTime: c.timestamp ? new Date(c.timestamp).toLocaleString('en-US') : 'N/A',
    totalMessages: (c.messages || []).length
  }));
}

// Helper: Delete a single message (In app + WhatsApp socket + Firestore)
export async function deleteWaWebSingleMessage(jid, msgId) {
  const chat = waWebState.chats.get(jid);
  if (chat && chat.messages) {
    const targetMsg = chat.messages.find(m => m.id === msgId);
    chat.messages = chat.messages.filter(m => m.id !== msgId);
    if (chat.messages.length > 0) {
      const last = chat.messages[chat.messages.length - 1];
      chat.lastMessage = last.text || '';
    } else {
      chat.lastMessage = '';
    }

    // Try sending revocation to WhatsApp socket if connected
    if (sock && waWebState.status === 'connected') {
      try {
        await sock.sendMessage(jid, {
          delete: {
            remoteJid: jid,
            fromMe: targetMsg ? targetMsg.fromMe : true,
            id: msgId,
            participant: undefined
          }
        });
      } catch (e) {
        console.warn('[WA-WEB] Could not revoke on socket:', e.message);
      }
    }

    scheduleHistorySaveToFirestore();
    calculateSyncStats();
    return { success: true };
  }
  return { success: false, error: 'Message not found' };
}

// Helper: Clear all messages in a chat (In app + WhatsApp socket + Firestore)
export async function clearWaWebChat(jid) {
  const chat = waWebState.chats.get(jid);
  if (chat) {
    chat.messages = [];
    chat.lastMessage = '';
    
    // Attempt WhatsApp socket chatModify clear
    if (sock && waWebState.status === 'connected') {
      try {
        await sock.chatModify({
          clear: {
            messages: [{ id: 'all', fromMe: true, timestamp: Date.now() }]
          }
        }, jid);
      } catch (e) {
        console.warn('[WA-WEB] Socket clear chat note:', e.message);
      }
    }

    if (globalDb) {
      const docId = jid.replace(/[^a-zA-Z0-9_-]/g, '_');
      await setDoc(doc(globalDb, "waWebChatHistory", docId), {
        id: jid,
        messages: [],
        lastMessage: '',
        updatedAt: Date.now()
      }, { merge: true });
    }

    scheduleHistorySaveToFirestore();
    calculateSyncStats();
    return { success: true };
  }
  return { success: false, error: 'Chat not found' };
}

// Helper: Delete entire conversation (In app + WhatsApp socket + Firestore)
export async function deleteWaWebChat(jid) {
  waWebState.chats.delete(jid);
  
  if (sock && waWebState.status === 'connected') {
    try {
      await sock.chatModify({ delete: true }, jid);
    } catch (e) {
      console.warn('[WA-WEB] Socket delete chat note:', e.message);
    }
  }

  if (globalDb) {
    const docId = jid.replace(/[^a-zA-Z0-9_-]/g, '_');
    await deleteDoc(doc(globalDb, "waWebChatHistory", docId)).catch(() => {});
  }

  scheduleHistorySaveToFirestore();
  calculateSyncStats();
  return { success: true };
}

// Helper: Update contact name (In app memory + Firestore appData/contacts)
export async function updateWaWebContactName(jid, newName) {
  if (!jid || !newName) return { success: false, error: 'Missing parameters' };
  const cleanPhone = jid.split('@')[0].split(':')[0];
  registerContact({ id: jid, name: newName });
  
  const chat = waWebState.chats.get(jid);
  if (chat) chat.name = newName;

  if (globalDb) {
    try {
      await setDoc(doc(globalDb, "appData", "contacts"), {
        [cleanPhone]: {
          manualName: newName,
          phone: cleanPhone,
          updatedAt: Date.now()
        }
      }, { merge: true });
    } catch (e) {
      console.warn('[WA-WEB] Error persisting contact name to Firestore:', e.message);
    }
  }

  scheduleHistorySaveToFirestore();
  return { success: true, name: newName };
}

// Build complete system knowledge prompt

// Helper: Check if contact AI auto-reply is paused
export function isContactAiPaused(jid) {
  if (!jid) return false;
  const cleanPhone = jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  const pausedList = Array.isArray(waWebKnowledgeBase.pausedContacts) ? waWebKnowledgeBase.pausedContacts : [];
  return pausedList.some(p => {
    const cleanP = (p || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    return p === jid || (cleanPhone && cleanP && (cleanPhone === cleanP || cleanPhone.endsWith(cleanP) || cleanP.endsWith(cleanPhone)));
  });
}

// Helper: Toggle pause state for a contact
export async function toggleContactAiPause(jid, shouldPause = null) {
  if (!jid) return { success: false, error: 'Missing JID' };
  const cleanPhone = jid.split('@')[0].split(':')[0];
  
  if (!Array.isArray(waWebKnowledgeBase.pausedContacts)) {
    waWebKnowledgeBase.pausedContacts = [];
  }

  const isCurrentlyPaused = isContactAiPaused(jid);
  const targetPaused = shouldPause !== null ? Boolean(shouldPause) : !isCurrentlyPaused;

  if (targetPaused) {
    if (!waWebKnowledgeBase.pausedContacts.includes(jid)) waWebKnowledgeBase.pausedContacts.push(jid);
    if (!waWebKnowledgeBase.pausedContacts.includes(cleanPhone)) waWebKnowledgeBase.pausedContacts.push(cleanPhone);
  } else {
    waWebKnowledgeBase.pausedContacts = waWebKnowledgeBase.pausedContacts.filter(x => {
      const cleanX = (x || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      const cleanTarget = cleanPhone.replace(/[^0-9]/g, '');
      return x !== jid && x !== cleanPhone && cleanX !== cleanTarget;
    });
  }

  if (globalDb) {
    try {
      await setDoc(doc(globalDb, "appData", "waWebKnowledgeBase"), {
        pausedContacts: waWebKnowledgeBase.pausedContacts
      }, { merge: true });
      console.log(`[WA-WEB KB] Persisted paused contacts list (${waWebKnowledgeBase.pausedContacts.length} entries) to Firestore`);
    } catch (e) {
      console.warn('[WA-WEB KB] Error persisting paused contacts to Firestore:', e.message);
    }
  }

  console.log(`[WA-WEB KB] Contact ${cleanPhone} AI auto-reply is now: ${targetPaused ? 'PAUSED ⏸️' : 'ACTIVE 🟢'}`);
  return { success: true, jid, cleanPhone, isPaused: targetPaused, pausedContacts: waWebKnowledgeBase.pausedContacts };
}

export function buildWaWebKnowledgeSystemPrompt(chatContext = null) {
  const kb = waWebKnowledgeBase;
  let prompt = (kb.systemPromptInstructions || 'You are the WhatsApp AI Business Assistant.') + '\n\n';

  if (Array.isArray(kb.rules) && kb.rules.length > 0) {
    prompt += '--- STRICT MANDATORY AI RULES (MUST BE STRICTLY OBEYED) ---\n';
    kb.rules.forEach((r, i) => {
      if (r && r.enabled !== false) {
        prompt += (i + 1) + '. [' + (r.title || 'MANDATORY RULE') + ']:\n' + (r.description || '') + '\n\n';
      }
    });
  }

  if (kb.customKnowledgeText && kb.customKnowledgeText.trim()) {
    prompt += '--- BUSINESS BACKGROUND & POLICIES ---\n' + kb.customKnowledgeText.trim() + '\n\n';
  }

  if (Array.isArray(kb.faqs) && kb.faqs.length > 0) {
    prompt += '--- FREQUENTLY ASKED QUESTIONS (FAQS) ---\n';
    kb.faqs.forEach((f, i) => {
      if (f.question && f.answer) {
        prompt += 'Q' + (i + 1) + ': ' + f.question + '\nA: ' + f.answer + '\n\n';
      }
    });
  }

  if (Array.isArray(kb.productsCatalog) && kb.productsCatalog.length > 0) {
    prompt += '--- PRODUCT & PRICING CATALOG ---\n';
    kb.productsCatalog.forEach((p, i) => {
      if (p.name) {
        prompt += (i + 1) + '. ' + p.name + (p.price ? ' - Price: ' + p.price : '') + (p.description ? ' (' + p.description + ')' : '') + '\n';
      }
    });
    prompt += '\n';
  }

  return prompt;
}

export async function generateWaWebAutoBotReply(jid, customerMessage, overridePrompt = null, mediaData = null) {
  if (!globalDb) return null;
  try {
    const settingsSnap = await getDoc(doc(globalDb, "appData", "settings"));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    
    const chatContext = getWaWebChatContext(jid);
    const knowledgePrompt = buildWaWebKnowledgeSystemPrompt(chatContext);

    const cleanPhone = (jid || '').split('@')[0].split(':')[0];
    const contactName = chatContext?.name || '';
    const isUnsaved = !contactName || contactName.trim() === '' || contactName === 'Customer' || contactName === cleanPhone || /^[0-9+]+$/.test(contactName.trim());

    let specialGuidance = '';
    if (isUnsaved) {
      specialGuidance += '\n⚠️ NOTE: This sender is an UNSAVED / NEW contact (' + cleanPhone + '). Per Rule #2, politely and gently ask for their Name, Company Name, Country, and Business Activity so we can register them in our records.';
    }

    const systemPrompt = overridePrompt || (knowledgePrompt + '\n--- CONVERSATION CONTEXT ---\n' +
'Customer Name: ' + (chatContext?.name || 'Customer') + '\n' +
'Phone / JID: ' + jid + specialGuidance + '\n' +
'Recent conversation transcript:\n' +
(chatContext?.transcript || customerMessage) + '\n' +
'--- END CONTEXT ---\n' +
'Task: Compose a natural, professional WhatsApp reply following all business rules. If greeting, address by their name. Do not repeat greeting if already in conversation.');

    const geminiKey = settings.GEMINI_API_KEY || process.env.GEMINI_API_KEY || settings.geminiApiKey;
    const deepseekKey = settings.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
    const openaiKey = settings.OPENAI_API_KEY || process.env.OPENAI_API_KEY;

    // 1. MULTIMODAL HANDLING: Audio Voice Notes, Images & PDF Documents
    if (mediaData && mediaData.buffer && mediaData.buffer.length > 0) {
      const rawMime = (mediaData.mimetype || '').split(';')[0].trim().toLowerCase();
      let normalizedMime = rawMime;
      if (mediaData.mediaType === 'audio') {
        normalizedMime = rawMime || 'audio/ogg';
      } else if (mediaData.mediaType === 'image') {
        normalizedMime = rawMime || 'image/jpeg';
      } else if (mediaData.mediaType === 'document') {
        normalizedMime = rawMime || 'application/pdf';
      }

      console.log(`[WA-WEB MULTIMODAL] 🧠 Processing ${mediaData.mediaType} with AI (${normalizedMime}, ${(mediaData.buffer.length/1024).toFixed(1)} KB)`);

      // Try Gemini Multimodal (Gemini 1.5 Flash natively processes audio, images, and PDFs!)
      if (geminiKey) {
        try {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(geminiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

          let mediaInstruction = 'Customer sent a ' + (mediaData.mediaType || 'file') + '.';
          if (mediaData.mediaType === 'audio') {
            mediaInstruction = 'Customer sent a VOICE NOTE / AUDIO MESSAGE. Listen carefully to their voice, transcribe/understand their question or order, and reply directly with helpful answers adhering to our business knowledge and rules.';
          } else if (mediaData.mediaType === 'image') {
            mediaInstruction = 'Customer sent an IMAGE' + (mediaData.caption ? ' (Caption: "' + mediaData.caption + '")' : '') + '. Inspect the image carefully (e.g. invoice, product list, payment receipt, document screenshot) and reply helpfully based on business rules.';
          } else if (mediaData.mediaType === 'document') {
            mediaInstruction = 'Customer sent a DOCUMENT' + (mediaData.fileName ? ' ("' + mediaData.fileName + '")' : '') + '. Read and analyze the document contents (e.g. PDF invoice, purchase order, packing list) and provide a professional, helpful response.';
          }

          const base64Data = mediaData.buffer.toString('base64');
          const res = await model.generateContent({
            contents: [{
              role: 'user',
              parts: [
                { text: systemPrompt + '\n\n' + mediaInstruction + (customerMessage ? '\nCustomer note: ' + customerMessage : '') },
                {
                  inlineData: {
                    mimeType: normalizedMime,
                    data: base64Data
                  }
                }
              ]
            }]
          });
          const reply = res.response.text();
          if (reply && reply.trim()) {
            console.log('[WA-WEB MULTIMODAL] 🟢 Gemini generated reply for ' + mediaData.mediaType);
            return reply.trim();
          }
        } catch (geminiErr) {
          console.warn('[WA-WEB MULTIMODAL] Gemini multimodal error:', geminiErr.message);
        }
      }

      // OpenAI Multimodal Fallback (GPT-4o Vision or Whisper)
      if (openaiKey) {
        try {
          const { default: OpenAI } = await import('openai');
          const openai = new OpenAI({ apiKey: openaiKey, timeout: 45000 });

          if (mediaData.mediaType === 'image') {
            const base64Data = mediaData.buffer.toString('base64');
            const comp = await openai.chat.completions.create({
              messages: [
                { role: 'system', content: systemPrompt },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: customerMessage || 'Please inspect this image and reply as per our business rules.' },
                    { type: 'image_url', image_url: { url: `data:${normalizedMime};base64,${base64Data}` } }
                  ]
                }
              ],
              model: 'gpt-4o',
              temperature: 0.4
            });
            return comp.choices[0]?.message?.content || null;
          }
        } catch (openaiErr) {
          console.warn('[WA-WEB MULTIMODAL] OpenAI fallback error:', openaiErr.message);
        }
      }
    }

    // 2. TEXT-BASED AI AUTO-REPLY
    if (deepseekKey) {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: deepseekKey, timeout: 45000 });
      const comp = await openai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: customerMessage }
        ],
        model: 'deepseek-chat',
        temperature: 0.4
      });
      return comp.choices[0]?.message?.content || null;
    } else if (geminiKey) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\nUser message: ' + customerMessage }] }] });
      return res.response.text() || null;
    } else if (openaiKey) {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: openaiKey, timeout: 45000 });
      const comp = await openai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: customerMessage }
        ],
        model: 'gpt-4o-mini',
        temperature: 0.4
      });
      return comp.choices[0]?.message?.content || null;
    }
  } catch (err) {
    console.warn('[WA-WEB KB] Error in generateWaWebAutoBotReply:', err.message);
  }
  return null;
}

export function getWaWebKnowledgeBase() {
  return waWebKnowledgeBase;
}

// Save Knowledge Base
export async function saveWaWebKnowledgeBase(newKnowledge) {
  waWebKnowledgeBase = { ...waWebKnowledgeBase, ...newKnowledge };
  if (globalDb) {
    try {
      await setDoc(doc(globalDb, "appData", "waWebKnowledgeBase"), waWebKnowledgeBase, { merge: true });
      console.log('[WA-WEB KB] Successfully saved WhatsApp Web Knowledge Base to Firestore');
    } catch (e) {
      console.error('[WA-WEB KB] Error saving to Firestore:', e);
    }
  }
  return waWebKnowledgeBase;
}
