// ============================================================================
// 🧹 WHATSAPP SESSION HOUSEKEEPING
// ============================================================================
// Baileys keeps one small JSON file per key. Over months this grows to tens of
// thousands of files (46k observed), which slows every directory scan and makes
// backups/deploys heavy.
//
// SAFETY RULES (this is the difference between "tidied" and "logged out"):
//   • creds.json is NEVER touched — it is the WhatsApp login itself.
//   • app-state-sync-* is NEVER touched — app state would desync.
//   • session-* and sender-key-* are NEVER touched by default — deleting an active
//     Signal session forces renegotiation and can drop messages.
//   • Only re-fetchable caches are pruned: lid-mapping, pre-key, device-list, tctoken.
//   • Files are MOVED to an archive folder, not deleted, so a mistake is reversible.
//   • The newest N files of every category are always kept, regardless of age.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

export const PRUNABLE = {
  'lid-mapping-': 'phone ↔ LID mapping cache (re-resolved on demand)',
  'pre-key-': 'one-time Signal pre-keys (consumed once used)',
  'device-list-': 'peer device list cache (refetched on demand)',
  'tctoken-': 'privacy tokens (short lived)'
};

const NEVER_TOUCH = (name) =>
  name === 'creds.json' ||
  name.startsWith('app-state-sync-key') ||
  name.startsWith('app-state-sync-version') ||
  name.startsWith('session-') ||
  name.startsWith('sender-key-');

const DEFAULTS = { keepDays: 7, keepNewestPerCategory: 2000, timeBudgetMs: 20000 };

export function analyzeSession(authDir) {
  const out = { authDir, exists: false, totalFiles: 0, totalMB: 0, categories: [], protected: { files: 0, mb: 0 } };
  if (!authDir || !fs.existsSync(authDir)) return out;
  out.exists = true;

  const groups = new Map();
  for (const prefix of Object.keys(PRUNABLE)) groups.set(prefix, []);
  const prot = [];

  let entries = [];
  try { entries = fs.readdirSync(authDir, { withFileTypes: true }); } catch (e) { out.error = e.message; return out; }

  for (const ent of entries) {
    if (!ent.isFile()) continue;
    out.totalFiles++;
    let size = 0, mtime = 0;
    try { const st = fs.statSync(path.join(authDir, ent.name)); size = st.size; mtime = st.mtimeMs; } catch (e) { continue; }
    out.totalMB += size;

    if (NEVER_TOUCH(ent.name)) { prot.push({ name: ent.name, size, mtime }); continue; }
    const prefix = Object.keys(PRUNABLE).find(p => ent.name.startsWith(p));
    if (prefix) groups.get(prefix).push({ name: ent.name, size, mtime });
  }

  const now = Date.now();
  out.protected = { files: prot.length, mb: round1(prot.reduce((n, f) => n + f.size, 0) / 1048576) };
  out.totalMB = round1(out.totalMB / 1048576);

  for (const [prefix, files] of groups) {
    files.sort((a, b) => b.mtime - a.mtime);
    const ageCount = files.filter(f => (now - f.mtime) > DEFAULTS.keepDays * 86400000).length;
    out.categories.push({
      prefix,
      meaning: PRUNABLE[prefix],
      files: files.length,
      mb: round1(files.reduce((n, f) => n + f.size, 0) / 1048576),
      olderThan7Days: ageCount,
      newestKept: Math.min(DEFAULTS.keepNewestPerCategory, files.length)
    });
  }
  return out;
}

function round1(n) { return Math.round(n * 10) / 10; }

// Moves old prunable files into ../auth_info_archive/<timestamp>/.
// Returns a report; safe to call repeatedly.
export function archiveOldSession(authDir, opts = {}) {
  const keepDays = Number(opts.keepDays) >= 0 ? Number(opts.keepDays) : DEFAULTS.keepDays;
  const keepNewest = Number(opts.keepNewestPerCategory) >= 0 ? Number(opts.keepNewestPerCategory) : DEFAULTS.keepNewestPerCategory;
  const budget = Number(opts.timeBudgetMs) || DEFAULTS.timeBudgetMs;
  const dryRun = opts.dryRun === true;

  const report = {
    ok: true, dryRun, keepDays, keepNewest,
    moved: 0, skippedProtected: 0, wouldMove: 0, bytesMoved: 0,
    archiveDir: '', timedOut: false, perCategory: {}, errors: []
  };
  if (!authDir || !fs.existsSync(authDir)) { report.ok = false; report.errors.push('auth folder not found'); return report; }

  const cutoff = Date.now() - keepDays * 86400000;
  const archiveDir = dryRun ? '' : path.join(path.dirname(authDir), 'auth_info_archive', new Date().toISOString().replace(/[:.]/g, '-'));
  if (!dryRun) {
    try { fs.mkdirSync(archiveDir, { recursive: true }); }
    catch (e) { report.ok = false; report.errors.push('cannot create archive: ' + e.message); return report; }
  }
  report.archiveDir = archiveDir;

  const started = Date.now();
  let entries = [];
  try { entries = fs.readdirSync(authDir, { withFileTypes: true }); } catch (e) { report.ok = false; report.errors.push(e.message); return report; }

  // Group candidates by prefix, then decide which survive (newest N always kept).
  const byPrefix = new Map();
  for (const prefix of Object.keys(PRUNABLE)) byPrefix.set(prefix, []);

  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (NEVER_TOUCH(ent.name)) { report.skippedProtected++; continue; }
    const prefix = Object.keys(PRUNABLE).find(p => ent.name.startsWith(p));
    if (!prefix) continue;
    let mtime = 0;
    try { mtime = fs.statSync(path.join(authDir, ent.name)).mtimeMs; } catch (e) { continue; }
    byPrefix.get(prefix).push({ name: ent.name, mtime });
  }

  for (const [prefix, files] of byPrefix) {
    files.sort((a, b) => b.mtime - a.mtime);         // newest first
    let movedHere = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const keepBecauseNewest = i < keepNewest;      // safety floor
      const oldEnough = f.mtime < cutoff;
      if (keepBecauseNewest || !oldEnough) continue;

      if (dryRun) { report.wouldMove++; movedHere++; continue; }

      if (Date.now() - started > budget) { report.timedOut = true; break; }
      try {
        const st = fs.statSync(path.join(authDir, f.name));
        fs.renameSync(path.join(authDir, f.name), path.join(archiveDir, f.name));
        report.moved++; movedHere++; report.bytesMoved += st.size;
      } catch (e) {
        if (report.errors.length < 5) report.errors.push(f.name + ': ' + e.message);
      }
    }
    report.perCategory[prefix] = movedHere;
    if (report.timedOut) break;
  }

  report.bytesMoved = round1(report.bytesMoved / 1048576);
  if (report.timedOut) report.note = 'Time budget reached — run again to continue.';
  return report;
}
