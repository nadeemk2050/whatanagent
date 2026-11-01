// Server health for the dashboard: RAM, disk, CPU load, and "where is the space/RAM used".
// Quick numbers (summary) are a few file reads, so they are safe to poll every few seconds.
// du / ps are heavier, so they only run when the owner opens the details and are cached.
import os from 'os';
import fs from 'fs';
import { execFile } from 'child_process';

const IS_LINUX = process.platform === 'linux';

function run(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      // du exits non-zero when some folders are unreadable but still prints the rest
      resolve(String(stdout || ''));
    });
  });
}

function readMem() {
  if (IS_LINUX) {
    try {
      const t = fs.readFileSync('/proc/meminfo', 'utf8');
      const g = (k) => { const m = t.match(new RegExp('^' + k + ':\\s+(\\d+) kB', 'm')); return m ? Number(m[1]) * 1024 : 0; };
      const total = g('MemTotal');
      const avail = g('MemAvailable');
      const swapTotal = g('SwapTotal');
      const swapUsed = swapTotal - g('SwapFree');
      return { total, used: total - avail, available: avail, cache: g('Cached') + g('Buffers'), swapTotal, swapUsed };
    } catch (e) { /* fall through */ }
  }
  const total = os.totalmem();
  const free = os.freemem();
  return { total, used: total - free, available: free, cache: 0, swapTotal: 0, swapUsed: 0 };
}

async function readDisk() {
  if (IS_LINUX) {
    const out = await run('df', ['-kP', '/'], 5000);
    const line = out.trim().split('\n').pop().trim().split(/\s+/);
    if (line.length >= 5) {
      const total = Number(line[1]) * 1024;
      const used = Number(line[2]) * 1024;
      return { total, used, free: Number(line[3]) * 1024, mount: line[5] || '/' };
    }
  }
  try {
    const s = fs.statfsSync(process.cwd());
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { total, used: total - free, free, mount: process.cwd() };
  } catch (e) {
    return { total: 0, used: 0, free: 0, mount: '' };
  }
}

export async function getSummary() {
  const mem = readMem();
  const disk = await readDisk();
  const load = os.loadavg();
  const pm = process.memoryUsage();
  return {
    at: Date.now(),
    host: os.hostname(),
    platform: process.platform,
    cpus: os.cpus().length,
    load1: Number(load[0].toFixed(2)),
    load5: Number(load[1].toFixed(2)),
    uptimeSec: Math.round(os.uptime()),
    mem,
    disk,
    app: { rss: pm.rss, heapUsed: pm.heapUsed, uptimeSec: Math.round(process.uptime()) }
  };
}

const duCache = new Map();
const DU_TTL = 5 * 60 * 1000;

export function cleanDir(p) {
  let d = String(p || '/').trim();
  if (!d.startsWith('/') || d.includes('\0') || d.split('/').includes('..')) return '/';
  if (d.length > 1) d = d.replace(/\/+$/, '');
  return d;
}

// One level of "which folders hold the space" under dir (stays on this disk: -x).
export async function getDiskBreakdown(dir, force) {
  if (!IS_LINUX) return { dir, items: [], note: 'Folder sizes are only available on the Linux server.' };
  const d = cleanDir(dir);
  const hit = duCache.get(d);
  if (!force && hit && Date.now() - hit.at < DU_TTL) return hit.data;
  const out = await run('du', ['-x', '-k', '-d', '1', d], 25000);
  const items = [];
  let self = 0;
  for (const line of out.split('\n')) {
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const bytes = Number(m[1]) * 1024;
    if (m[2] === d || m[2] === d + '/') { self = bytes; continue; }
    items.push({ path: m[2], bytes });
  }
  items.sort((a, b) => b.bytes - a.bytes);
  const data = { dir: d, total: self, items: items.slice(0, 25), at: Date.now() };
  duCache.set(d, { at: Date.now(), data });
  if (duCache.size > 60) duCache.delete(duCache.keys().next().value);
  return data;
}

let psCache = { at: 0, data: null };

export async function getTopProcesses() {
  if (!IS_LINUX) return [];
  if (psCache.data && Date.now() - psCache.at < 10000) return psCache.data;
  const out = await run('ps', ['-eo', 'pid,rss,pcpu,comm,args', '--sort=-rss'], 5000);
  const rows = out.split('\n').slice(1).filter(Boolean).slice(0, 8).map((l) => {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s*(.*)$/);
    if (!m) return null;
    return { pid: Number(m[1]), rss: Number(m[2]) * 1024, cpu: Number(m[3]), name: m[4], cmd: m[5].slice(0, 90) };
  }).filter(Boolean);
  psCache = { at: Date.now(), data: rows };
  return rows;
}
