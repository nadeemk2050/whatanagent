// ============================================================================
// 📊 TRADE ACCOUNTS DATA API — Purchases & Sales Ledger (TT, Gold, Items)
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

let tradeDb = null;
export function attachTradeDb(db) {
  if (db) tradeDb = db;
}

const COLLECTION_NAME = 'tradeAccountsData';

// Helper: Sanitize string
const sstr = (v, n = 300) => String(v == null ? '' : v).substring(0, n);
const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

// Sanitizer for Trade Entries
export function sanitizeTradeEntry(raw, existing = {}) {
  const type = (raw.type || existing.type || 'purchase').toLowerCase() === 'sale' ? 'sale' : 'purchase';
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
  
  const notes = sstr(raw.notes != null ? raw.notes : (existing.notes || ''), 500);
  const refNo = sstr(raw.refNo != null ? raw.refNo : (existing.refNo || ''), 60);

  return {
    type,
    date,
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

// In-Memory cache for speed
let inMemoryTrades = [];
let lastFetchAt = 0;
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
    // Fallback if orderBy date index is missing
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

  console.log('📊 [TRADE ACCOUNTS] Registered Trade Accounts Data (Purchases & Sales Ledger) API');
}
