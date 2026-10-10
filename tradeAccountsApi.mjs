// ============================================================================
// 📊 TRADE ACCOUNTS DATA API — Purchases & Sales Ledger + AI Chat Trade Extractor
// ============================================================================
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  query, 
  orderBy, 
  limit, 
  where,
  writeBatch
} from 'firebase/firestore';
import { recordAiCall } from './aiTracker.mjs';

let tradeDb = null;
export function attachTradeDb(db) {
  if (db) tradeDb = db;
}

const COLLECTION_NAME = 'tradeAccountsData';
const DRAFTS_COLLECTION = 'tradeAccountsDrafts';

// Helper: Sanitize string
const sstr = (v, n = 300) => String(v == null ? '' : v).substring(0, n);
const num = (v, fallback = 0) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  const cleaned = String(v == null ? '' : v).replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : fallback;
};

// Normalize trade type from AI or user
export function parseTradeType(rawType, fallback = 'purchase') {
  const t = String(rawType || '').toLowerCase().trim();
  if (t === 'sale' || t === 'sold' || t === 'sell' || t === 'out' || t === 'sales') return 'sale';
  if (t === 'purchase' || t === 'buy' || t === 'bought' || t === 'in' || t === 'purchased') return 'purchase';
  return fallback;
}

// Sanitizer for Trade Entries
export function sanitizeTradeEntry(raw, existing = {}) {
  const type = parseTradeType(raw.type || existing.type, 'purchase');
  const date = sstr(raw.date || existing.date || new Date().toISOString().split('T')[0], 30);
  const itemName = sstr(raw.itemName || existing.itemName || 'TT', 120);
  const partyName = sstr(raw.partyName != null ? raw.partyName : (existing.partyName || ''), 120);
  const unit = sstr(raw.unit || existing.unit || 'PCS', 30).toUpperCase();
  const quantity = num(raw.quantity != null ? raw.quantity : existing.quantity, 0);
  const rate = num(raw.rate != null ? raw.rate : existing.rate, 0);
  const currency = sstr(raw.currency || existing.currency || 'AED', 10).toUpperCase();
  
  // Auto-calculated amount = quantity * rate, unless explicitly provided with override
  const calculatedAmount = Math.round((quantity * rate) * 100) / 100;
  const amount = raw.amount != null && !isNaN(parseFloat(raw.amount)) ? num(raw.amount) : calculatedAmount;
  
  const time = sstr(raw.time || existing.time || '', 30);
  const timestamp = sstr(raw.timestamp || existing.timestamp || (date + (time ? ' ' + time : '')), 50);
  const notes = sstr(raw.notes != null ? raw.notes : (existing.notes || ''), 500);
  const refNo = sstr(raw.refNo != null ? raw.refNo : (existing.refNo || ''), 60);

  return {
    type,
    date,
    time,
    timestamp,
    itemName,
    partyName,
    unit,
    quantity,
    rate,
    amount,
    currency,
    notes,
    refNo,
    createdAt: existing.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

// Sanitizer for Draft Trade Entries (Extracted from WhatsApp by AI)
export function sanitizeDraftTrade(raw, existing = {}) {
  const type = parseTradeType(raw.type || existing.type, 'purchase');
  const date = sstr(raw.date || existing.date || new Date().toISOString().split('T')[0], 30);
  const itemName = sstr(raw.itemName || existing.itemName || 'TT', 120);
  const partyName = sstr(raw.partyName != null ? raw.partyName : (existing.partyName || ''), 120);
  const unit = sstr(raw.unit || existing.unit || 'PCS', 30).toUpperCase();
  const quantity = num(raw.quantity != null ? raw.quantity : existing.quantity, 0);
  const rate = num(raw.rate != null ? raw.rate : existing.rate, 0);
  const currency = sstr(raw.currency || existing.currency || 'AED', 10).toUpperCase();
  
  const calculatedAmount = Math.round((quantity * rate) * 100) / 100;
  const amount = raw.amount != null && !isNaN(parseFloat(raw.amount)) ? num(raw.amount) : calculatedAmount;
  
  const time = sstr(raw.time || existing.time || '', 30);
  const timestamp = sstr(raw.timestamp || existing.timestamp || (date + (time ? ' ' + time : '')), 50);
  const notes = sstr(raw.notes != null ? raw.notes : (existing.notes || ''), 500);
  const refNo = sstr(raw.refNo != null ? raw.refNo : (existing.refNo || ''), 60);
  const evidenceQuote = sstr(raw.evidenceQuote != null ? raw.evidenceQuote : (existing.evidenceQuote || ''), 1000);
  const sourceChatId = sstr(raw.sourceChatId || existing.sourceChatId || '', 120);
  const sourceChatName = sstr(raw.sourceChatName || existing.sourceChatName || 'WhatsApp Chat', 150);
  const confidence = sstr(raw.confidence || existing.confidence || 'high', 20).toLowerCase();
  const status = sstr(raw.status || existing.status || 'pending', 20).toLowerCase();

  return {
    type,
    date,
    time,
    timestamp,
    itemName,
    partyName,
    unit,
    quantity,
    rate,
    amount,
    currency,
    notes,
    refNo,
    evidenceQuote,
    sourceChatId,
    sourceChatName,
    confidence,
    status,
    createdAt: existing.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

// In-Memory cache for speed
let inMemoryTrades = [];
let inMemoryDrafts = [];
let lastFetchAt = 0;
let lastDraftFetchAt = 0;
const CACHE_TTL_MS = 15000;

export async function fetchAllTradeEntries(forceFresh = false) {
  if (!tradeDb) return inMemoryTrades;
  if (!forceFresh && inMemoryTrades.length > 0 && (Date.now() - lastFetchAt) < CACHE_TTL_MS) {
    return inMemoryTrades;
  }

  try {
    const q = query(collection(tradeDb, COLLECTION_NAME), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => {
      list.push({ id: d.id, ...d.data() });
    });
    inMemoryTrades = list;
    lastFetchAt = Date.now();
    return list;
  } catch (err) {
    try {
      const snap = await getDocs(collection(tradeDb, COLLECTION_NAME));
      const list = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      inMemoryTrades = list;
      lastFetchAt = Date.now();
      return list;
    } catch (e2) {
      console.warn('[TRADE ACCOUNTS] Error fetching entries:', e2.message);
      return inMemoryTrades;
    }
  }
}

export async function fetchAllDraftEntries(forceFresh = false) {
  if (!tradeDb) return inMemoryDrafts;
  if (!forceFresh && inMemoryDrafts.length > 0 && (Date.now() - lastDraftFetchAt) < CACHE_TTL_MS) {
    return inMemoryDrafts;
  }

  try {
    const snap = await getDocs(collection(tradeDb, DRAFTS_COLLECTION));
    const list = [];
    snap.forEach(d => {
      const data = d.data() || {};
      if (data.status === 'pending' || !data.status) {
        list.push({ id: d.id, ...data });
      }
    });
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    inMemoryDrafts = list;
    lastDraftFetchAt = Date.now();
    return list;
  } catch (err) {
    console.warn('[TRADE ACCOUNTS] Error fetching drafts:', err.message);
    return inMemoryDrafts;
  }
}

// Compute Summary Calculations (Totals, Balances, Item Breakdowns)
export function computeTradeSummary(entries = []) {
  let totalPurchaseQty = 0;
  let totalPurchaseAmount = 0;
  let totalSaleQty = 0;
  let totalSaleAmount = 0;

  const itemBreakdown = {};

  for (const item of entries) {
    const qty = num(item.quantity, 0);
    const amt = num(item.amount, 0);
    const name = item.itemName || 'Unspecified';

    if (!itemBreakdown[name]) {
      itemBreakdown[name] = {
        itemName: name,
        purchaseQty: 0,
        purchaseAmount: 0,
        saleQty: 0,
        saleAmount: 0,
        netQty: 0,
        netAmount: 0
      };
    }

    if (item.type === 'purchase') {
      totalPurchaseQty += qty;
      totalPurchaseAmount += amt;
      itemBreakdown[name].purchaseQty += qty;
      itemBreakdown[name].purchaseAmount += amt;
    } else {
      totalSaleQty += qty;
      totalSaleAmount += amt;
      itemBreakdown[name].saleQty += qty;
      itemBreakdown[name].saleAmount += amt;
    }

    itemBreakdown[name].netQty = itemBreakdown[name].purchaseQty - itemBreakdown[name].saleQty;
    itemBreakdown[name].netAmount = itemBreakdown[name].saleAmount - itemBreakdown[name].purchaseAmount;
  }

  const netQtyBalance = totalPurchaseQty - totalSaleQty;
  const netCashBalance = totalSaleAmount - totalPurchaseAmount;

  return {
    totalPurchases: {
      count: entries.filter(e => e.type === 'purchase').length,
      quantity: Math.round(totalPurchaseQty * 1000) / 1000,
      amount: Math.round(totalPurchaseAmount * 100) / 100
    },
    totalSales: {
      count: entries.filter(e => e.type === 'sale').length,
      quantity: Math.round(totalSaleQty * 1000) / 1000,
      amount: Math.round(totalSaleAmount * 100) / 100
    },
    netPosition: {
      quantityBalance: Math.round(netQtyBalance * 1000) / 1000,
      cashBalance: Math.round(netCashBalance * 100) / 100,
      profitStatus: netCashBalance >= 0 ? 'Surplus / Profit' : 'Deficit / Invested'
    },
    items: Object.values(itemBreakdown)
  };
}

// AI Helper: Call Multi-Model LLM for trade scanning
async function callTradeExtractorAI(db, systemPrompt, userText, preferred = 'gemini') {
  let geminiKey = process.env.GEMINI_API_KEY || '';
  let deepseekKey = process.env.DEEPSEEK_API_KEY || '';
  let qwenKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || '';
  let qwenBase = String(process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  let qwenModel = process.env.QWEN_MODEL || 'qwen3.8-flash';
  let openaiKey = process.env.OPENAI_API_KEY || '';

  if (db) {
    try {
      const stSnap = await getDoc(doc(db, 'appData', 'settings'));
      if (stSnap.exists()) {
        const st = stSnap.data() || {};
        geminiKey = st.GEMINI_API_KEY || st.geminiApiKey || geminiKey;
        deepseekKey = st.DEEPSEEK_API_KEY || deepseekKey;
        qwenKey = st.QWEN_API_KEY || st.DASHSCOPE_API_KEY || qwenKey;
        qwenBase = String(st.QWEN_BASE_URL || qwenBase).replace(/\/+$/, '');
        qwenModel = st.QWEN_MODEL || qwenModel;
        openaiKey = st.OPENAI_API_KEY || openaiKey;
      }
    } catch (e) { /* ignore */ }
  }

  const modelsToTry = [];
  if (geminiKey) modelsToTry.push('gemini');
  if (qwenKey) modelsToTry.push('qwen');
  if (openaiKey) modelsToTry.push('openai');
  if (deepseekKey) modelsToTry.push('deepseek');

  if (modelsToTry.length === 0) {
    throw new Error('No AI API key found. Please configure Gemini, Qwen or OpenAI key.');
  }

  if (modelsToTry.includes(preferred)) {
    modelsToTry.splice(modelsToTry.indexOf(preferred), 1);
    modelsToTry.unshift(preferred);
  }

  for (const p of modelsToTry) {
    try {
      if (p === 'gemini') {
        const gm = 'gemini-2.5-flash';
        // thinkingBudget: 0 disables deep chain-of-thought delay, generating in 1-2s
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gm}:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nChat Conversation Content:\n${userText}` }] }],
            generationConfig: {
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          }),
          signal: AbortSignal.timeout(60000)
        });
        if (!r.ok) {
          const errBody = await r.text();
          console.warn(`[TRADE EXTRACTOR AI] Gemini HTTP ${r.status}:`, errBody.slice(0, 150));
          continue;
        }
        const j = await r.json();
        const t = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (t) {
          recordAiCall({ source: 'trade_extractor', model: gm, prompt: userText.slice(0, 150), response: t.slice(0, 150), success: true });
          return t;
        }
      } else if (p === 'qwen') {
        // enable_thinking: false turns off Alibaba reasoning tokens for instant completion
        const r = await fetch(`${qwenBase}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${qwenKey}` },
          body: JSON.stringify({
            model: qwenModel,
            temperature: 0.1,
            max_tokens: 3500,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }],
            enable_thinking: false
          }),
          signal: AbortSignal.timeout(60000)
        });
        if (!r.ok) {
          const errBody = await r.text();
          console.warn(`[TRADE EXTRACTOR AI] Qwen HTTP ${r.status}:`, errBody.slice(0, 150));
          continue;
        }
        const j = await r.json();
        const t = j?.choices?.[0]?.message?.content?.trim();
        if (t) {
          recordAiCall({ source: 'trade_extractor', model: qwenModel, prompt: userText.slice(0, 150), response: t.slice(0, 150), success: true });
          return t;
        }
      } else if (p === 'openai') {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.1,
            max_tokens: 3500,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }]
          }),
          signal: AbortSignal.timeout(60000)
        });
        if (!r.ok) continue;
        const j = await r.json();
        const t = j?.choices?.[0]?.message?.content?.trim();
        if (t) {
          recordAiCall({ source: 'trade_extractor', model: 'gpt-4o-mini', prompt: userText.slice(0, 150), response: t.slice(0, 150), success: true });
          return t;
        }
      } else if (p === 'deepseek') {
        const r = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
          body: JSON.stringify({
            model: 'deepseek-chat',
            temperature: 0.1,
            max_tokens: 3500,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }]
          }),
          signal: AbortSignal.timeout(60000)
        });
        if (!r.ok) continue;
        const j = await r.json();
        const t = j?.choices?.[0]?.message?.content?.trim();
        if (t) {
          recordAiCall({ source: 'trade_extractor', model: 'deepseek-chat', prompt: userText.slice(0, 150), response: t.slice(0, 150), success: true });
          return t;
        }
      }
    } catch (err) {
      console.warn(`[TRADE EXTRACTOR AI] Model ${p} attempt failed:`, err.message);
    }
  }

  throw new Error('All AI providers failed or timed out. Please try again with fewer messages or check API key.');
}

// Clean JSON response from AI
function cleanJsonOutput(raw) {
  let cleaned = String(raw || '').trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return cleaned.substring(firstBracket, lastBracket + 1);
  }
  return cleaned;
}

// Register Express routes for Trade Accounts
export function registerTradeAccountsRoutes(app, db) {
  attachTradeDb(db);

  // 1. GET all trade entries + summary
  app.get('/api/trade/entries', async (req, res) => {
    try {
      const { type, search, dateFrom, dateTo } = req.query;
      let list = await fetchAllTradeEntries(req.query.fresh === 'true');

      if (type && (type === 'purchase' || type === 'sale')) {
        list = list.filter(e => e.type === type);
      }

      if (dateFrom) {
        list = list.filter(e => (e.date || '') >= dateFrom);
      }
      if (dateTo) {
        list = list.filter(e => (e.date || '') <= dateTo);
      }

      if (search) {
        const q = String(search).toLowerCase().trim();
        list = list.filter(e => 
          (e.itemName && e.itemName.toLowerCase().includes(q)) ||
          (e.partyName && e.partyName.toLowerCase().includes(q)) ||
          (e.notes && e.notes.toLowerCase().includes(q)) ||
          (e.refNo && e.refNo.toLowerCase().includes(q))
        );
      }

      const purchases = list.filter(e => e.type === 'purchase');
      const sales = list.filter(e => e.type === 'sale');
      const summary = computeTradeSummary(list);

      res.json({
        ok: true,
        count: list.length,
        purchases,
        sales,
        summary
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 2. GET single summary
  app.get('/api/trade/summary', async (req, res) => {
    try {
      const list = await fetchAllTradeEntries();
      res.json({ ok: true, summary: computeTradeSummary(list) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 3. POST create new trade entry (Purchase or Sale)
  app.post('/api/trade/entries', async (req, res) => {
    try {
      if (!tradeDb) return res.status(503).json({ ok: false, error: 'Database unavailable' });
      const payload = sanitizeTradeEntry(req.body || {});
      const docRef = await addDoc(collection(tradeDb, COLLECTION_NAME), payload);
      
      const newEntry = { id: docRef.id, ...payload };
      inMemoryTrades.unshift(newEntry);
      lastFetchAt = Date.now();

      console.log(`[TRADE ACCOUNTS] ➕ Recorded ${payload.type.toUpperCase()}: ${payload.quantity} ${payload.unit} of ${payload.itemName} @ ${payload.rate} = ${payload.amount} ${payload.currency}`);

      res.json({ ok: true, entry: newEntry });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 4. PUT update existing trade entry
  app.put('/api/trade/entries/:id', async (req, res) => {
    try {
      if (!tradeDb) return res.status(503).json({ ok: false, error: 'Database unavailable' });
      const id = req.params.id;
      const ref = doc(tradeDb, COLLECTION_NAME, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return res.status(404).json({ ok: false, error: 'Entry not found' });

      const updated = sanitizeTradeEntry(req.body || {}, snap.data());
      await setDoc(ref, updated, { merge: true });

      const idx = inMemoryTrades.findIndex(e => e.id === id);
      if (idx >= 0) inMemoryTrades[idx] = { id, ...updated };
      lastFetchAt = Date.now();

      res.json({ ok: true, entry: { id, ...updated } });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 5. DELETE trade entry
  app.delete('/api/trade/entries/:id', async (req, res) => {
    try {
      if (!tradeDb) return res.status(503).json({ ok: false, error: 'Database unavailable' });
      const id = req.params.id;
      await deleteDoc(doc(tradeDb, COLLECTION_NAME, id));
      inMemoryTrades = inMemoryTrades.filter(e => e.id !== id);
      lastFetchAt = Date.now();

      console.log(`[TRADE ACCOUNTS] 🗑️ Deleted entry ${id}`);
      res.json({ ok: true, id });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==========================================================================
  // 📥 DRAFTS MANAGEMENT & WHATSAPP CHAT AI TRADE SCANNER
  // ==========================================================================

  // 6. GET list of WhatsApp chats for easy selector
  app.get('/api/trade/chats', async (req, res) => {
    try {
      const { getWaWebChats } = await import('./waWebClient.js');
      const list = getWaWebChats() || [];
      res.json({ ok: true, chats: list });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 7. GET all pending drafts
  app.get('/api/trade/drafts', async (req, res) => {
    try {
      const drafts = await fetchAllDraftEntries(req.query.fresh === 'true');
      res.json({ ok: true, drafts, count: drafts.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 8. POST Scan WhatsApp Chat / Group with AI to extract trade entries into Drafts
  app.post('/api/trade/scan-chat', async (req, res) => {
    try {
      const { chatId, chatName, messageLimit = 250, preferredModel = 'gemini' } = req.body || {};
      if (!chatId) {
        return res.status(400).json({ ok: false, error: 'Please select a WhatsApp chat or group' });
      }

      const { getWaWebMessages, getWaWebMessagesPage } = await import('./waWebClient.js');
      let messages = await getWaWebMessages(chatId);
      if ((!messages || messages.length === 0) && typeof getWaWebMessagesPage === 'function') {
        try {
          const pg = await getWaWebMessagesPage(chatId, 0, 500);
          if (pg && pg.messages && pg.messages.length > 0) {
            messages = pg.messages;
          }
        } catch (e2) { /* ignore */ }
      }

      if (!messages || messages.length === 0) {
        return res.status(422).json({ 
          ok: false, 
          error: 'No chat messages found in history for this contact/group. Please sync WhatsApp or send/receive a message first.' 
        });
      }

      // Slice the requested history (e.g. last 250 messages)
      const count = Math.max(10, Math.min(parseInt(messageLimit) || 250, 500));
      const recent = messages.slice(-count);

      // Build text conversation transcript (filtered for speed and accuracy)
      let transcript = '';
      const noisePattern = /^(\[sticker\]|[👍👌🙏❤️😂🔥✨👏🤝💯]+|hi|hello|salam|assalam|ok|k|ji|haan|theek|done|thanks|thank you)$/i;

      for (const m of recent) {
        let textContent = (m.text || (m.mediaInfo?.caption ? m.mediaInfo.caption : '')).trim();
        if (!textContent && m.mediaType && m.mediaType !== 'sticker') {
          textContent = `[${m.mediaType}]`;
        }
        if (!textContent || noisePattern.test(textContent)) continue;
        if (textContent.length > 500) textContent = textContent.slice(0, 500) + '...';

        const timeStr = m.timestamp ? new Date(m.timestamp).toISOString().replace('T', ' ').substring(0, 19) : 'Recent';
        const sender = m.fromMe ? 'Me (Company / Boss)' : (m.senderName || chatName || 'Client / Party');
        transcript += `[${timeStr}] ${sender}: ${textContent}\n`;
      }

      // Cap at 30,000 chars of recent messages for fast 1-2s response
      if (transcript.length > 30000) {
        transcript = transcript.slice(-30000);
      }

      if (!transcript.trim()) {
        return res.status(422).json({ ok: false, error: 'Chat has no readable text messages to analyze.' });
      }

      const systemPrompt = `You are an expert commercial metal, gold bullion, scrap, and TT transaction accountant.
Analyze the following WhatsApp conversation log from "${chatName || chatId}".
Carefully identify and extract ALL physical and financial trade transactions where goods or bullion were BOUGHT (Purchase) or SOLD (Sale).
Trades include: TT deals, Gold 995, Gold 9999, Kilo Bars, Tolas, Scrap Copper, Scrap Brass, Scrap Aluminium, Scrap Lead, Batteries, Zinc, Ingot, or any item deals agreed in chat.

For each trade transaction found, return a JSON object with this exact structure:
[
  {
    "type": "purchase" | "sale",
    "itemName": "TT" | "Gold 995" | "Scrap Copper" | (exact item name),
    "partyName": "...", (the counterparty name, client, or company),
    "unit": "PCS" | "KG" | "GMS" | "TOLAS" | "BARS" | "MT",
    "quantity": number,
    "rate": number, (price per unit)
    "amount": number, (total amount, quantity * rate)
    "currency": "AED" | "USD" | "INR" | "SAR",
    "date": "YYYY-MM-DD", (date from message timestamp or deal date)
    "time": "HH:MM:SS", (exact time from message timestamp e.g. "14:32:05" or "14:32")
    "timestamp": "YYYY-MM-DD HH:MM:SS", (full message timestamp e.g. "2026-10-08 14:32:05")
    "refNo": "...", (TT number, deal ref, booking id if any, else "")
    "notes": "...", (short explanation of terms/deal context)
    "evidenceQuote": "...", (the exact message sentence or quote from WhatsApp showing this deal)
    "confidence": "high" | "medium"
  }
]

RULES:
- "purchase" = We/Me bought or incoming stock acquired.
- "sale" = We/Me sold or outgoing stock supplied.
- Look for phrases like: "bought 5 pcs TT @ 3450", "sold 10 kg copper @ 32", "deal confirmed", "booking done", "rate locked", "send TT for 20 pcs", etc.
- Return ONLY the JSON array. Do NOT wrap in markdown formatting or explanations. If no trades exist, return [].`;

      console.log(`[TRADE EXTRACTOR] 🧠 Scanning ${recent.length} messages from "${chatName}" (${chatId}) using AI...`);
      
      const aiRawResponse = await callTradeExtractorAI(tradeDb, systemPrompt, transcript, preferredModel);
      const cleaned = cleanJsonOutput(aiRawResponse);
      
      let extractedList = [];
      try {
        extractedList = JSON.parse(cleaned);
        if (!Array.isArray(extractedList)) extractedList = [];
      } catch (pe) {
        console.warn('[TRADE EXTRACTOR] JSON parse fallback on AI output:', pe.message);
        extractedList = [];
      }

      // Save each extracted trade as a draft in Firestore
      const savedDrafts = [];
      for (const item of extractedList) {
        if (!item.itemName && !item.quantity && !item.amount) continue;
        
        let matchedTime = item.time || '';
        let matchedTimestamp = item.timestamp || '';

        // Deterministically match exact WhatsApp message timestamp from recent messages
        if (item.evidenceQuote) {
          const eqClean = String(item.evidenceQuote).toLowerCase().replace(/['"“”]/g, '').trim();
          const foundMsg = recent.find(m => {
            const txt = String(m.text || m.mediaInfo?.caption || '').toLowerCase().replace(/['"“”]/g, '').trim();
            return txt && (txt.includes(eqClean) || eqClean.includes(txt) || (eqClean.length > 8 && txt.includes(eqClean.slice(0, 16))));
          });
          if (foundMsg && foundMsg.timestamp) {
            const dt = new Date(foundMsg.timestamp);
            matchedTime = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            matchedTimestamp = dt.toISOString().replace('T', ' ').substring(0, 19);
          }
        }

        if (!matchedTimestamp && item.date) {
          matchedTimestamp = item.date + (matchedTime ? ' ' + matchedTime : '');
        }

        const draftPayload = sanitizeDraftTrade({
          ...item,
          time: matchedTime || item.time || '',
          timestamp: matchedTimestamp || item.timestamp || '',
          sourceChatId: chatId,
          sourceChatName: chatName || chatId,
          status: 'pending'
        });

        if (tradeDb) {
          const docRef = await addDoc(collection(tradeDb, DRAFTS_COLLECTION), draftPayload);
          savedDrafts.push({ id: docRef.id, ...draftPayload });
        } else {
          savedDrafts.push({ id: 'draft-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5), ...draftPayload });
        }
      }

      inMemoryDrafts = [...savedDrafts, ...inMemoryDrafts];
      lastDraftFetchAt = Date.now();

      console.log(`[TRADE EXTRACTOR] ✅ AI extracted ${savedDrafts.length} pending trade drafts from "${chatName}"`);

      res.json({
        ok: true,
        chatName: chatName || chatId,
        messagesAnalyzed: recent.length,
        draftsFound: savedDrafts.length,
        drafts: savedDrafts
      });
    } catch (e) {
      console.error('[TRADE EXTRACTOR ERROR]', e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 9. POST Approve Draft -> Move to Official Ledger (as Purchase or Sale)
  app.post('/api/trade/drafts/:id/approve', async (req, res) => {
    try {
      if (!tradeDb) return res.status(503).json({ ok: false, error: 'Database unavailable' });
      const draftId = req.params.id;
      const { confirmedType, overrides = {} } = req.body || {};

      const draftRef = doc(tradeDb, DRAFTS_COLLECTION, draftId);
      const draftSnap = await getDoc(draftRef);
      if (!draftSnap.exists()) {
        return res.status(404).json({ ok: false, error: 'Draft trade entry not found or already processed' });
      }

      const draftData = draftSnap.data() || {};
      
      // Merge draft with any overrides provided by the user/boss
      const tradePayload = sanitizeTradeEntry({
        type: confirmedType || overrides.type || draftData.type || 'purchase',
        date: overrides.date || draftData.date,
        time: overrides.time || draftData.time,
        timestamp: overrides.timestamp || draftData.timestamp,
        itemName: overrides.itemName || draftData.itemName,
        partyName: overrides.partyName || draftData.partyName,
        unit: overrides.unit || draftData.unit,
        quantity: overrides.quantity !== undefined ? overrides.quantity : draftData.quantity,
        rate: overrides.rate !== undefined ? overrides.rate : draftData.rate,
        amount: overrides.amount !== undefined ? overrides.amount : draftData.amount,
        currency: overrides.currency || draftData.currency,
        refNo: overrides.refNo || draftData.refNo,
        notes: (overrides.notes || draftData.notes || '') + (draftData.sourceChatName ? ` [Source: ${draftData.sourceChatName}]` : '')
      });

      // Add to official trade ledger
      const newEntryDoc = await addDoc(collection(tradeDb, COLLECTION_NAME), tradePayload);
      const officialEntry = { id: newEntryDoc.id, ...tradePayload };
      
      inMemoryTrades.unshift(officialEntry);
      lastFetchAt = Date.now();

      // Delete or mark draft as approved
      await deleteDoc(draftRef);
      inMemoryDrafts = inMemoryDrafts.filter(d => d.id !== draftId);
      lastDraftFetchAt = Date.now();

      console.log(`[TRADE ACCOUNTS] 👑 BOSS APPROVED DRAFT ${draftId} -> Created Official ${officialEntry.type.toUpperCase()} Entry (${officialEntry.id})`);

      res.json({
        ok: true,
        message: `Draft successfully approved and added to ${officialEntry.type.toUpperCase()} ledger!`,
        entry: officialEntry,
        draftId
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 10. POST Bulk Approve Drafts
  app.post('/api/trade/drafts/bulk-approve', async (req, res) => {
    try {
      if (!tradeDb) return res.status(503).json({ ok: false, error: 'Database unavailable' });
      const { draftIds = [], defaultType } = req.body || {};
      if (!Array.isArray(draftIds) || draftIds.length === 0) {
        return res.status(400).json({ ok: false, error: 'No draft IDs provided' });
      }

      const approvedEntries = [];
      for (const id of draftIds) {
        try {
          const draftRef = doc(tradeDb, DRAFTS_COLLECTION, id);
          const draftSnap = await getDoc(draftRef);
          if (draftSnap.exists()) {
            const d = draftSnap.data() || {};
            const payload = sanitizeTradeEntry({
              type: defaultType || d.type || 'purchase',
              date: d.date,
              time: d.time,
              timestamp: d.timestamp,
              itemName: d.itemName,
              partyName: d.partyName,
              unit: d.unit,
              quantity: d.quantity,
              rate: d.rate,
              amount: d.amount,
              currency: d.currency,
              refNo: d.refNo,
              notes: (d.notes || '') + (d.sourceChatName ? ` [Source: ${d.sourceChatName}]` : '')
            });
            const newDoc = await addDoc(collection(tradeDb, COLLECTION_NAME), payload);
            approvedEntries.push({ id: newDoc.id, ...payload });
            await deleteDoc(draftRef);
          }
        } catch (subErr) {
          console.warn(`[TRADE DRAFTS] Bulk approve error on ${id}:`, subErr.message);
        }
      }

      inMemoryDrafts = inMemoryDrafts.filter(d => !draftIds.includes(d.id));
      inMemoryTrades = [...approvedEntries, ...inMemoryTrades];
      lastFetchAt = Date.now();
      lastDraftFetchAt = Date.now();

      res.json({
        ok: true,
        approvedCount: approvedEntries.length,
        entries: approvedEntries
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 11. DELETE single draft (Dismiss / Reject)
  app.delete('/api/trade/drafts/:id', async (req, res) => {
    try {
      if (!tradeDb) return res.status(503).json({ ok: false, error: 'Database unavailable' });
      const id = req.params.id;
      await deleteDoc(doc(tradeDb, DRAFTS_COLLECTION, id));
      inMemoryDrafts = inMemoryDrafts.filter(d => d.id !== id);
      lastDraftFetchAt = Date.now();

      console.log(`[TRADE ACCOUNTS] 🗑️ Dismissed draft trade ${id}`);
      res.json({ ok: true, id, message: 'Draft dismissed' });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 12. DELETE all drafts (Clear queue)
  app.delete('/api/trade/drafts', async (req, res) => {
    try {
      if (!tradeDb) return res.status(503).json({ ok: false, error: 'Database unavailable' });
      const snap = await getDocs(collection(tradeDb, DRAFTS_COLLECTION));
      const batch = writeBatch(tradeDb);
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();

      inMemoryDrafts = [];
      lastDraftFetchAt = Date.now();

      res.json({ ok: true, message: 'All drafts cleared successfully' });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log('📊 [TRADE ACCOUNTS] Registered Purchases & Sales Ledger + AI Chat Trade Extractor API');
}
