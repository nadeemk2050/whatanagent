// ============================================================================
// 📡 OUTBOUND BANDWIDTH TRACKER
// ============================================================================
// Render bills "Service-Initiated" bandwidth = bytes YOUR SERVER SENDS OUT.
// This module patches the outbound transports (global fetch + node http/https)
// and counts those request bytes per destination host, so we can see exactly
// which service is eating the allowance (DashScope? Firestore? WhatsApp?).
//
// It only counts REQUEST bytes (what Render charges for). Response bytes are
// recorded separately as information only.
//
// Overhead is a counter increment — no buffering, no copies of the payload.
// ============================================================================

const MAX_RECENT = 200;
import httpMod from 'node:http';
import httpsMod from 'node:https';
import fsMod from 'node:fs';
import pathMod from 'node:path';
import osMod from 'node:os';

const state = {
  installedAt: 0,
  installed: false,
  totalOut: 0,
  totalIn: 0,
  calls: 0,
  byHost: Object.create(null),
  recent: [],
  errors: []
};

function bump(host, out, inp, kind, url) {
  const h = host || 'unknown';
  state.calls += 1;
  state.totalOut += out;
  state.totalIn += inp;
  const row = state.byHost[h] || (state.byHost[h] = { host: h, out: 0, in: 0, calls: 0 });
  row.out += out;
  row.in += inp;
  row.calls += 1;
  if (out >= 200 * 1024) {                       // only interesting (>=200 KB) calls
    state.recent.push({ host: h, out, kind, url: String(url || '').slice(0, 160), at: Date.now() });
    if (state.recent.length > MAX_RECENT) state.recent.shift();
  }
}

function hostOfUrl(u) {
  try { return new URL(String(u)).host; } catch (e) { return 'unknown'; }
}

function bodyBytes(body) {
  if (!body) return 0;
  try {
    if (typeof body === 'string') return Buffer.byteLength(body);
    if (Buffer.isBuffer(body)) return body.length;
    if (body instanceof Uint8Array) return body.byteLength;
    if (body instanceof ArrayBuffer) return body.byteLength;
    if (typeof body.size === 'number') return body.size;   // Blob / FormData
    return 0;
  } catch (e) { return 0; }
}

// --------------------------------------------------------------------------- fetch
function patchFetch() {
  if (typeof globalThis.fetch !== 'function') return;
  const orig = globalThis.fetch;
  if (orig.__bwPatched) return;

  const wrapped = async function (input, init) {
    let host = 'unknown';
    let out = 0;
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      host = hostOfUrl(url);
      if (init && init.body != null) out = bodyBytes(init.body);
    } catch (e) { /* never break the call */ }

    const res = await orig.call(this, input, init);
    let inp = 0;
    try { inp = Number(res.headers.get('content-length')) || 0; } catch (e) { /* header optional */ }
    try { bump(host, out, inp, 'fetch', typeof input === 'string' ? input : (input && input.url)); } catch (e) { /* counting is best effort */ }
    return res;
  };
  wrapped.__bwPatched = true;
  globalThis.fetch = wrapped;
}

// --------------------------------------------------------------------------- node http / https (axios, SDKs, raw requests)
function patchHttp(mod, kind) {
  try {
    const orig = mod.request;
    if (!orig || orig.__bwPatched) return;
    const wrapped = function (...args) {
      const req = orig.apply(this, args);
      let host = 'unknown';
      try {
        const a0 = args[0];
        if (typeof a0 === 'string') host = hostOfUrl(a0);
        else if (a0 && typeof a0 === 'object') host = a0.hostname || a0.host || 'unknown';
      } catch (e) { /* keep default */ }

      let out = 0;
      const ow = req.write;
      req.write = function (chunk, ...rest) {
        try { out += bodyBytes(chunk); } catch (e) { /* ignore */ }
        return ow.call(this, chunk, ...rest);
      };
      const oe = req.end;
      req.end = function (chunk, ...rest) {
        try {
          if (chunk && typeof chunk !== 'function') out += bodyBytes(chunk);
          bump(host, out, 0, kind, '');
        } catch (e) { /* ignore */ }
        return oe.call(this, chunk, ...rest);
      };
      return req;
    };
    wrapped.__bwPatched = true;
    mod.request = wrapped;
  } catch (e) {
    state.errors.push('patch ' + kind + ': ' + e.message);
  }
}

export function installBandwidthTracker() {
  if (state.installed) return;
  try { patchFetch(); } catch (e) { state.errors.push('fetch: ' + e.message); }
  try { patchHttp(httpMod, 'http'); } catch (e) { state.errors.push('http: ' + e.message); }
  try { patchHttp(httpsMod, 'https'); } catch (e) { state.errors.push('https: ' + e.message); }
  state.installed = true;
  state.installedAt = Date.now();
}

// --------------------------------------------------------------------------- instance facts
// Tells you what plan/limits the process is really running under, and whether the
// WhatsApp session folder is on persistent storage (the thing that makes you re-scan QR).
export function instanceReport(authDir) {
  const mb = (n) => Math.round((n / (1024 * 1024)) * 10) / 10;
  const mem = process.memoryUsage();
  let cgroupLimitMB = null;
  try {
    if (fsMod.existsSync('/sys/fs/cgroup/memory.max')) {
      const v = fsMod.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
      cgroupLimitMB = v === 'max' ? null : Math.round(Number(v) / 1048576);
    } else if (fsMod.existsSync('/sys/fs/cgroup/memory/memory.limit_in_bytes')) {
      const v = Number(fsMod.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim());
      cgroupLimitMB = v > 1e15 ? null : Math.round(v / 1048576);
    }
  } catch (e) { /* not linux or not readable */ }

  let disk = { authDir: authDir || '', exists: false, files: 0, sizeMB: 0, writable: false };
  try {
    if (authDir && fsMod.existsSync(authDir)) {
      const files = fsMod.readdirSync(authDir);
      let total = 0;
      for (const f of files) { try { total += fsMod.statSync(pathMod.join(authDir, f)).size; } catch (e) { /* skip */ } }
      disk = { authDir, exists: true, files: files.length, sizeMB: mb(total), writable: true };
    }
  } catch (e) { disk.error = e.message; }

  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuCount: (osMod.cpus() || []).length,
    uptimeMinutes: Math.round(process.uptime() / 60),
    memory: {
      cgroupLimitMB,
      rssMB: mb(mem.rss),
      heapUsedMB: mb(mem.heapUsed),
      heapTotalMB: mb(mem.heapTotal),
      externalMB: mb(mem.external)
    },
    render: {
      isRender: String(process.env.RENDER || '').toLowerCase() === 'true' || !!process.env.RENDER_SERVICE_ID,
      serviceId: process.env.RENDER_SERVICE_ID || '',
      instanceId: process.env.RENDER_INSTANCE_ID || '',
      externalUrl: process.env.RENDER_EXTERNAL_URL || '',
      region: process.env.RENDER_REGION || ''
    },
    storage: disk,
    storageVerdict: disk.exists && disk.files > 0
      ? (String(process.env.RENDER || '').toLowerCase() === 'true'
        ? 'A Render disk is probably attached (session survives deploys). If the QR resets after every deploy, no disk is attached.'
        : 'Local disk — session persists across restarts.')
      : 'No WhatsApp session found yet — connect WhatsApp and scan the QR once.'
  };
}

// --------------------------------------------------------------------------- reporting
export function bandwidthReport({ top = 15 } = {}) {
  const hosts = Object.keys(state.byHost).map(h => state.byHost[h])
    .sort((a, b) => b.out - a.out);
  const mb = (n) => Math.round((n / (1024 * 1024)) * 100) / 100;
  return {
    installed: state.installed,
    since: state.installedAt,
    uptimeMinutes: state.installedAt ? Math.round((Date.now() - state.installedAt) / 60000) : 0,
    totalOutMB: mb(state.totalOut),
    totalInMB: mb(state.totalIn),
    calls: state.calls,
    byHost: hosts.slice(0, top).map(h => ({ host: h.host, outMB: mb(h.out), inMB: mb(h.in), calls: h.calls })),
    largest: state.recent.slice(-25).reverse().map(r => ({ host: r.host, outMB: mb(r.out), kind: r.kind, url: r.url, at: r.at })),
    errors: state.errors,
    note: 'Counts REQUEST bytes only (this is what Render bills as Service-Initiated). Firestore over gRPC/http2 may not be captured here.'
  };
}

export function resetBandwidth() {
  state.totalOut = 0; state.totalIn = 0; state.calls = 0;
  state.byHost = Object.create(null);
  state.recent = [];
}
