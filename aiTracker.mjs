// ============================================================================
// 🛡️ AI ACTIVITY TRACKER & AUTO-FETCH KILL SWITCH
// ============================================================================
// Provides complete transparency and granular control over AI credit usage:
//   1. Master Stop Switch: Stops all background AI auto-fetching, auto-scraping,
//      and auto-learning across Gold Events, Contact Brains, and Schedulers.
//   2. AI Audit Log: Records every AI call (DeepSeek, Gemini, Qwen, OpenAI)
//      with exact timestamp, prompt snippet, response, tokens, and estimated USD cost.
//   3. Aggregated Analytics: Answers "What did which AI do?" with breakdowns
//      by provider (DeepSeek vs Gemini vs Qwen) and by feature area.
// ============================================================================

import { doc, getDoc, setDoc } from 'firebase/firestore';

let globalDb = null;
let aiAutoFetchStopped = false;
let stoppedMetadata = { at: 0, by: 'system' };
let memoryLogs = [];
const MAX_MEMORY_LOGS = 500;
let persistTimer = null;
let isLoaded = false;

const CONTROL_DOC = ['appData', 'aiControlState'];
const LOGS_DOC = ['appData', 'aiActivityLogs'];

// Estimated Pricing ($ per 1,000,000 tokens)
const MODEL_PRICING = {
  // DeepSeek
  'deepseek-chat': { inPerM: 0.14, outPerM: 0.28 },
  'deepseek-coder': { inPerM: 0.14, outPerM: 0.28 },
  'deepseek': { inPerM: 0.14, outPerM: 0.28 },

  // Google Gemini
  'gemini-2.5-flash': { inPerM: 0.075, outPerM: 0.30 },
  'gemini-1.5-flash': { inPerM: 0.075, outPerM: 0.30 },
  'gemini-3.6-flash': { inPerM: 0.075, outPerM: 0.30 },
  'gemini-1.5-pro': { inPerM: 1.25, outPerM: 5.00 },
  'gemini': { inPerM: 0.075, outPerM: 0.30 },

  // Alibaba Qwen (DashScope)
  'qwen3.8-flash': { inPerM: 0.20, outPerM: 0.40 },
  'qwen-plus': { inPerM: 0.40, outPerM: 1.20 },
  'qwen-max': { inPerM: 1.60, outPerM: 4.80 },
  'qwen': { inPerM: 0.30, outPerM: 0.60 },

  // OpenAI
  'gpt-4o': { inPerM: 2.50, outPerM: 10.00 },
  'gpt-4o-mini': { inPerM: 0.15, outPerM: 0.60 },
  'openai': { inPerM: 0.15, outPerM: 0.60 }
};

export function attachAiTrackerDb(db) {
  if (db) {
    globalDb = db;
    loadAiControlState().catch(err => console.warn('[AI TRACKER] Failed to load control state:', err.message));
  }
}

export async function loadAiControlState() {
  if (!globalDb) return;
  try {
    const snap = await getDoc(doc(globalDb, ...CONTROL_DOC));
    if (snap.exists()) {
      const data = snap.data() || {};
      aiAutoFetchStopped = !!data.stopped;
      stoppedMetadata = {
        at: data.stoppedAt || 0,
        by: data.stoppedBy || 'dashboard'
      };
    }
    
    // Also load recent logs from Firestore if memory is empty
    if (memoryLogs.length === 0) {
      const logSnap = await getDoc(doc(globalDb, ...LOGS_DOC));
      if (logSnap.exists()) {
        const d = logSnap.data() || {};
        if (Array.isArray(d.items)) {
          memoryLogs = d.items.slice(-MAX_MEMORY_LOGS);
        }
      }
    }
    isLoaded = true;
  } catch (e) {
    console.warn('[AI TRACKER] load error:', e.message);
  }
}

export function isAiAutoFetchStopped() {
  return aiAutoFetchStopped;
}

export async function setAiAutoFetchStopped(stopped, user = 'dashboard') {
  aiAutoFetchStopped = !!stopped;
  stoppedMetadata = {
    at: Date.now(),
    by: user
  };

  // Record an audit entry
  recordAiCall({
    provider: 'system',
    model: 'control-switch',
    area: 'Master AI Auto-Fetch Control',
    isAutoFetch: false,
    prompt: stopped ? 'User activated KILL SWITCH: Stopped all AI auto-fetching and auto-scraping.' : 'User RESUMED AI auto-fetching and auto-scraping.',
    response: stopped ? '🛑 All background AI loops, scrapers, and auto-learning are now BLOCKED.' : '🟢 Background AI auto-fetching is now ACTIVE.',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    status: stopped ? 'blocked' : 'success',
    durationMs: 0
  });

  if (globalDb) {
    try {
      await setDoc(doc(globalDb, ...CONTROL_DOC), {
        stopped: aiAutoFetchStopped,
        stoppedAt: stoppedMetadata.at,
        stoppedBy: stoppedMetadata.by,
        updatedAt: Date.now()
      }, { merge: true });
    } catch (e) {
      console.warn('[AI TRACKER] Failed to persist control state:', e.message);
    }
  }

  return {
    ok: true,
    stopped: aiAutoFetchStopped,
    stoppedAt: stoppedMetadata.at,
    stoppedBy: stoppedMetadata.by
  };
}

export function calculateEstimatedCost(provider, model, tokensIn = 0, tokensOut = 0) {
  const modKey = String(model || '').toLowerCase();
  const provKey = String(provider || '').toLowerCase();

  let rates = MODEL_PRICING[modKey] || MODEL_PRICING[provKey] || { inPerM: 0.20, outPerM: 0.50 };

  const inCost = (tokensIn / 1000000) * rates.inPerM;
  const outCost = (tokensOut / 1000000) * rates.outPerM;
  return Number((inCost + outCost).toFixed(6));
}

export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  // Standard approximation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

export function recordAiCall(entry) {
  try {
    const now = Date.now();
    const provider = String(entry.provider || 'unknown').toLowerCase();
    const model = String(entry.model || 'unknown');
    const area = String(entry.area || 'General AI');
    const isAutoFetch = !!entry.isAutoFetch;
    const status = entry.status || (entry.error ? 'failed' : 'success');

    let tokensIn = Number(entry.tokensIn) || 0;
    let tokensOut = Number(entry.tokensOut) || 0;

    if (!tokensIn && entry.prompt) {
      tokensIn = estimateTokens(typeof entry.prompt === 'string' ? entry.prompt : JSON.stringify(entry.prompt));
    }
    if (!tokensOut && entry.response) {
      tokensOut = estimateTokens(typeof entry.response === 'string' ? entry.response : JSON.stringify(entry.response));
    }

    let costUsd = Number(entry.costUsd);
    if (isNaN(costUsd) || costUsd <= 0) {
      if (status === 'blocked') {
        costUsd = 0;
      } else {
        costUsd = calculateEstimatedCost(provider, model, tokensIn, tokensOut);
      }
    }

    // Format prompt/response snippets cleanly (limit size to prevent memory bloat)
    let promptText = '';
    if (typeof entry.prompt === 'string') {
      promptText = entry.prompt;
    } else if (entry.prompt) {
      try { promptText = JSON.stringify(entry.prompt); } catch (_) { promptText = String(entry.prompt); }
    }
    if (promptText.length > 2000) promptText = promptText.substring(0, 2000) + '... [truncated]';

    let responseText = '';
    if (typeof entry.response === 'string') {
      responseText = entry.response;
    } else if (entry.response) {
      try { responseText = JSON.stringify(entry.response); } catch (_) { responseText = String(entry.response); }
    }
    if (responseText.length > 3000) responseText = responseText.substring(0, 3000) + '... [truncated]';

    const logItem = {
      id: 'ai-' + now + '-' + Math.random().toString(36).substring(2, 7),
      timestamp: now,
      provider,
      model,
      area,
      isAutoFetch,
      status, // 'success' | 'failed' | 'blocked'
      error: entry.error ? String(entry.error).substring(0, 300) : '',
      tokensIn,
      tokensOut,
      totalTokens: tokensIn + tokensOut,
      costUsd,
      durationMs: Number(entry.durationMs) || 0,
      prompt: promptText,
      response: responseText,
      metadata: entry.metadata || {}
    };

    memoryLogs.push(logItem);
    if (memoryLogs.length > MAX_MEMORY_LOGS) {
      memoryLogs = memoryLogs.slice(-MAX_MEMORY_LOGS);
    }

    // Schedule debounced persist to Firestore
    schedulePersistLogs();

    return logItem;
  } catch (err) {
    console.warn('[AI TRACKER] recordAiCall error:', err.message);
    return null;
  }
}

function schedulePersistLogs() {
  if (persistTimer || !globalDb) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      if (globalDb && memoryLogs.length > 0) {
        await setDoc(doc(globalDb, ...LOGS_DOC), {
          items: memoryLogs.slice(-300), // Keep latest 300 in Firestore
          updatedAt: Date.now()
        }, { merge: true });
      }
    } catch (e) {
      console.warn('[AI TRACKER] Failed to persist logs to Firestore:', e.message);
    }
  }, 3000);
}

export function getAiSummaryStats() {
  const stats = {
    stopped: aiAutoFetchStopped,
    stoppedAt: stoppedMetadata.at,
    stoppedBy: stoppedMetadata.by,
    totalCalls: memoryLogs.length,
    successfulCalls: 0,
    failedCalls: 0,
    blockedCalls: 0,
    autoFetchCalls: 0,
    manualCalls: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    byProvider: {},
    byArea: {}
  };

  for (const item of memoryLogs) {
    if (item.status === 'success') stats.successfulCalls++;
    else if (item.status === 'blocked') stats.blockedCalls++;
    else if (item.status === 'failed') stats.failedCalls++;

    if (item.isAutoFetch) stats.autoFetchCalls++;
    else stats.manualCalls++;

    stats.totalTokens += (item.totalTokens || 0);
    stats.totalCostUsd += (item.costUsd || 0);

    // Group by Provider
    const p = item.provider || 'unknown';
    if (!stats.byProvider[p]) {
      stats.byProvider[p] = { count: 0, costUsd: 0, tokens: 0, blocked: 0 };
    }
    stats.byProvider[p].count++;
    stats.byProvider[p].costUsd += (item.costUsd || 0);
    stats.byProvider[p].tokens += (item.totalTokens || 0);
    if (item.status === 'blocked') stats.byProvider[p].blocked++;

    // Group by Area
    const a = item.area || 'General';
    if (!stats.byArea[a]) {
      stats.byArea[a] = { count: 0, costUsd: 0, tokens: 0, blocked: 0 };
    }
    stats.byArea[a].count++;
    stats.byArea[a].costUsd += (item.costUsd || 0);
    stats.byArea[a].tokens += (item.totalTokens || 0);
    if (item.status === 'blocked') stats.byArea[a].blocked++;
  }

  // Format decimals cleanly
  stats.totalCostUsd = Number(stats.totalCostUsd.toFixed(5));
  for (const k of Object.keys(stats.byProvider)) {
    stats.byProvider[k].costUsd = Number(stats.byProvider[k].costUsd.toFixed(5));
  }
  for (const k of Object.keys(stats.byArea)) {
    stats.byArea[k].costUsd = Number(stats.byArea[k].costUsd.toFixed(5));
  }

  return stats;
}

export function getAiActivityLog(options = {}) {
  const limit = Math.min(500, Math.max(1, Number(options.limit) || 150));
  const providerFilter = options.provider ? String(options.provider).toLowerCase() : '';
  const areaFilter = options.area ? String(options.area).toLowerCase() : '';
  const queryFilter = options.q ? String(options.q).toLowerCase() : '';

  let filtered = memoryLogs.slice();

  if (providerFilter && providerFilter !== 'all') {
    filtered = filtered.filter(it => it.provider === providerFilter);
  }
  if (areaFilter && areaFilter !== 'all') {
    filtered = filtered.filter(it => String(it.area || '').toLowerCase().includes(areaFilter));
  }
  if (queryFilter) {
    filtered = filtered.filter(it => 
      String(it.prompt || '').toLowerCase().includes(queryFilter) ||
      String(it.response || '').toLowerCase().includes(queryFilter) ||
      String(it.model || '').toLowerCase().includes(queryFilter) ||
      String(it.area || '').toLowerCase().includes(queryFilter)
    );
  }

  // Return reverse chronological (newest first)
  const items = filtered.slice(-limit).reverse();
  const stats = getAiSummaryStats();

  return {
    ok: true,
    stopped: aiAutoFetchStopped,
    stoppedAt: stoppedMetadata.at,
    stoppedBy: stoppedMetadata.by,
    totalInLog: memoryLogs.length,
    returnedCount: items.length,
    stats,
    logs: items
  };
}

export async function clearAiActivityLog() {
  memoryLogs = [];
  if (globalDb) {
    try {
      await setDoc(doc(globalDb, ...LOGS_DOC), { items: [], updatedAt: Date.now() });
    } catch (e) {
      console.warn('[AI TRACKER] clear log error:', e.message);
    }
  }
  return { ok: true, message: 'AI activity log cleared' };
}
