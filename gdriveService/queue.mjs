// ============================================================================
// 🔁 GDrive Service Centre — VPS cache, upload queue, retention cleaner
// ============================================================================
// The promise to client apps is: "upload finishes instantly". So the bytes land
// on the VPS and the HTTP call returns; a background worker pushes them to
// Google Drive with exponential backoff.
//
// The promise to the owner is: "nothing is deleted until Google is proven to
// have it". So a local copy is only removed after a live files.get confirms the
// remote file still exists and matches the checksum. That check runs twice:
// once right after upload (UPLOADED_VERIFIED) and again right before deleting
// (ARCHIVED_ON_GDRIVE).
// ============================================================================
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import db, {
  CACHE_ROOT, getAccount, updateAccount, updateFile, getFile, dueJobs,
  filesReadyForCleanup, audit, bumpClientUsage, listAccounts, updateClient
} from './db.mjs';
import { md5File, md5Hex } from './crypto.mjs';
import { uploadLocalFile, getRemoteFile, getQuota, ensureClientFolder } from './drive.mjs';

const WORKER_TICK_MS = Number(process.env.GDRIVE_WORKER_MS) || 3000;
const CLEAN_TICK_MS = Number(process.env.GDRIVE_CLEAN_MS) || 10 * 60 * 1000;
const HEALTH_TICK_MS = Number(process.env.GDRIVE_HEALTH_MS) || 30 * 60 * 1000;
const MAX_ATTEMPTS = Number(process.env.GDRIVE_MAX_ATTEMPTS) || 8;
const CONCURRENCY = Math.max(1, Math.min(Number(process.env.GDRIVE_CONCURRENCY) || 2, 8));

const running = new Set();
let workerTimer = null;
let cleanTimer = null;
let healthTimer = null;
let stopped = false;

const safeName = (v) => String(v || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 140) || 'file';
const extOf = (name) => (String(name || '').match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();

/** Where this file lives while it is on the VPS. */
export function cachePathFor(driveId, clientId, fileUuid, originalName) {
  const dir = path.join(CACHE_ROOT, String(driveId), String(clientId || 'shared'));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, fileUuid + extOf(originalName));
}

export const tmpDir = () => {
  const d = path.join(CACHE_ROOT, 'tmp');
  fs.mkdirSync(d, { recursive: true });
  return d;
};

/**
 * Move an uploaded temp file into the cache and describe it.
 * Returns { id, abs, size, md5 }.
 */
export async function storeUploadedFile(tempPath, originalName, driveId, clientId) {
  const id = crypto.randomUUID();
  const abs = cachePathFor(driveId, clientId, id, originalName);
  try {
    fs.renameSync(tempPath, abs);
  } catch (e) {
    // Different filesystem (or Windows): copy then remove.
    fs.copyFileSync(tempPath, abs);
    try { fs.unlinkSync(tempPath); } catch (e2) { /* ignore */ }
  }
  const stat = fs.statSync(abs);
  const md5 = await md5File(abs);
  return { id, abs, size: stat.size, md5 };
}

/** Exponential backoff: 5s, 15s, 45s, 2m, 6m, 15m, 30m, 60m. */
function backoffMs(attempts) {
  const base = 5000;
  const steps = [1, 3, 9, 24, 72, 180, 360, 720];
  const mult = steps[Math.min(Math.max(attempts - 1, 0), steps.length - 1)];
  return base * mult;
}

/** Claim a queued job so two workers cannot take the same file. */
function claimJob(id) {
  const res = db.prepare(`UPDATE gdrive_files SET status = 'UPLOADING'
    WHERE id = ? AND status = 'QUEUED'`).run(String(id));
  return Number(res && res.changes) > 0;
}

/**
 * Upload, and if Google says the target folder is gone (the owner deleted it in
 * Drive) recreate the client folder once and retry. Without this the queue would
 * burn every attempt against a folder that will never exist again.
 */
async function uploadIntoFolder(account, abs, file, folderId) {
  const name = safeName(file.original_name);
  try {
    return await uploadLocalFile(account, abs, name, file.mime, folderId);
  } catch (e) {
    if (!/notFound|not found|404/i.test(String((e && e.message) || e))) throw e;
    const fresh = await ensureClientFolder(account, file.client_name || 'App');
    updateFile(file.id, { gdrive_folder_id: fresh });
    if (file.client_id) {
      try { updateClient(file.client_id, { folder_id: fresh, folder_name: file.client_name || 'App' }); } catch (e2) { /* ignore */ }
    }
    audit({ drive_id: file.drive_id, client_id: file.client_id, action: 'folder.recreated', detail: file.client_name || '' });
    console.log('[GDRIVE] 🗂️ recreated the Drive folder for ' + (file.client_name || 'app') + ' — retrying the upload');
    return uploadLocalFile(account, abs, name, file.mime, fresh);
  }
}

async function processJob(file) {
  const account = getAccount(file.drive_id);
  if (!account || account.status !== 'active') {
    updateFile(file.id, { status: 'QUEUED', next_attempt_at: Date.now() + 5 * 60 * 1000, error: 'drive is inactive' });
    return;
  }

  let folderId = file.gdrive_folder_id || '';
  try {
    if (!folderId) {
      folderId = await ensureClientFolder(account, file.client_name || 'App');
      updateFile(file.id, { gdrive_folder_id: folderId });
      if (file.client_id) {
        try { updateClient(file.client_id, { folder_id: folderId, folder_name: file.client_name || 'App' }); } catch (e) { /* ignore */ }
      }
    }

    const abs = String(file.local_path || '');
    if (!abs || !fs.existsSync(abs)) throw new Error('the local file disappeared before upload');

    const uploaded = await uploadIntoFolder(account, abs, file, folderId);
    const remoteId = uploaded && uploaded.id;
    if (!remoteId) throw new Error('Google returned no file id');

    // ── Step 1: verify the remote copy really exists and matches ──────────────
    const remote = await getRemoteFile(account, remoteId);
    if (!remote || !remote.id) throw new Error('uploaded file cannot be read back from Drive');

    const localMd5 = file.md5 || await md5File(abs);
    const remoteMd5 = String(remote.md5Checksum || '').toLowerCase();
    const remoteSize = Number(remote.size);
    const localSize = Number(file.size);

    if (remoteSize && localSize && remoteSize !== localSize) {
      throw new Error('size mismatch after upload (local ' + localSize + ' / drive ' + remoteSize + ')');
    }
    if (remoteMd5 && localMd5 && remoteMd5 !== String(localMd5).toLowerCase()) {
      throw new Error('checksum mismatch after upload');
    }

    const now = Date.now();
    updateFile(file.id, {
      status: 'UPLOADED_VERIFIED',
      gdrive_file_id: remoteId,
      md5: localMd5,
      uploaded_at: now,
      verified_at: now,
      attempts: Number(file.attempts) + 1,
      error: ''
    });
    if (file.client_id) {
      try { bumpClientUsage(file.client_id, file.size); } catch (e) { /* ignore */ }
    }
    audit({ drive_id: file.drive_id, client_id: file.client_id, action: 'upload.verified', detail: file.original_name });
    console.log('[GDRIVE] ✅ uploaded + verified ' + safeName(file.original_name) + ' (' + Math.round((file.size || 0) / 1024) + ' KB)');
  } catch (e) {
    const attempts = Number(file.attempts) + 1;
    const message = String((e && e.message) || e).slice(0, 300);
    const dead = attempts >= MAX_ATTEMPTS;

    updateFile(file.id, {
      status: dead ? 'FAILED' : 'QUEUED',
      attempts: attempts,
      next_attempt_at: dead ? 0 : Date.now() + backoffMs(attempts),
      error: message
    });
    if (dead) {
      audit({ drive_id: file.drive_id, client_id: file.client_id, action: 'upload.failed', detail: file.original_name + ' — ' + message });
      console.warn('[GDRIVE] ❌ gave up on ' + safeName(file.original_name) + ': ' + message);
    } else {
      console.warn('[GDRIVE] ↻ retry ' + attempts + '/' + MAX_ATTEMPTS + ' for ' + safeName(file.original_name) + ': ' + message);
    }
  }
}

async function workerTick() {
  if (stopped) return;
  try {
    const free = CONCURRENCY - running.size;
    if (free <= 0) return;
    const jobs = dueJobs(free);
    for (const job of jobs) {
      if (running.size >= CONCURRENCY) break;
      if (running.has(job.id)) continue;
      if (!claimJob(job.id)) continue;
      running.add(job.id);
      processJob(job)
        .catch((e) => console.warn('[GDRIVE] worker error:', (e && e.message) || e))
        .finally(() => running.delete(job.id));
    }
  } catch (e) {
    console.warn('[GDRIVE] worker tick failed:', (e && e.message) || e);
  }
}

/**
 * Step 2 of the retention promise: before deleting the local file, ask Google
 * whether the file is still there and still the same size. Only then delete.
 */
async function cleanupTick() {
  if (stopped) return;
  try {
    const due = filesReadyForCleanup(20);
    for (const file of due) {
      const account = getAccount(file.drive_id);
      if (!account) continue;

      try {
        if (!file.gdrive_file_id) throw new Error('no remote file id stored');
        const remote = await getRemoteFile(account, file.gdrive_file_id);
        if (!remote || !remote.id || remote.trashed) throw new Error('the Drive copy is missing or trashed');

        if (remote.size && file.size && Number(remote.size) !== Number(file.size)) {
          throw new Error('the Drive copy changed size (' + remote.size + ' vs ' + file.size + ')');
        }
        if (remote.md5Checksum && file.md5 && String(remote.md5Checksum).toLowerCase() !== String(file.md5).toLowerCase()) {
          throw new Error('the Drive copy checksum no longer matches');
        }

        try {
          if (file.local_path && fs.existsSync(file.local_path)) fs.unlinkSync(file.local_path);
        } catch (e) {
          console.warn('[GDRIVE] could not delete local copy ' + file.local_path + ': ' + ((e && e.message) || e));
          continue;   // leave the row as-is; try again next tick
        }

        updateFile(file.id, { status: 'ARCHIVED_ON_GDRIVE', local_path: '', cleaned_at: Date.now(), error: '' });
        audit({ drive_id: file.drive_id, client_id: file.client_id, action: 'cleanup.archived', detail: file.original_name });
        console.log('[GDRIVE] 🧹 freed the VPS copy of ' + safeName(file.original_name) + ' (Drive copy verified)');
      } catch (e) {
        const message = String((e && e.message) || e).slice(0, 300);
        // Keep the file: it is the only certain copy until Google is verified.
        updateFile(file.id, { next_attempt_at: Date.now() + 30 * 60 * 1000, error: 'cleanup blocked: ' + message });
        console.warn('[GDRIVE] ⚠️ cleanup skipped for ' + safeName(file.original_name) + ': ' + message);
      }
    }
  } catch (e) {
    console.warn('[GDRIVE] cleanup tick failed:', (e && e.message) || e);
  }
}

async function healthTick() {
  if (stopped) return;
  for (const account of listAccounts()) {
    try {
      const quota = await getQuota(account);
      updateAccount(account.id, {
        last_health: 'connected',
        last_error: '',
        last_checked_at: Date.now(),
        quota_used: quota.used,
        quota_total: quota.total
      });
    } catch (e) {
      const message = String((e && e.message) || e).slice(0, 300);
      updateAccount(account.id, {
        last_health: /invalid_grant|invalid_client|unauthorized|401/i.test(message) ? 'expired' : 'error',
        last_error: message,
        last_checked_at: Date.now()
      });
    }
  }
}

export function startGDriveWorkers() {
  if (workerTimer) return;
  stopped = false;
  workerTimer = setInterval(workerTick, WORKER_TICK_MS);
  cleanTimer = setInterval(cleanupTick, CLEAN_TICK_MS);
  healthTimer = setInterval(healthTick, HEALTH_TICK_MS);
  for (const t of [workerTimer, cleanTimer, healthTimer]) {
    if (typeof t.unref === 'function') t.unref();
  }
  setTimeout(() => { workerTick(); }, 5000);
  setTimeout(() => { healthTick(); }, 15000);
  console.log('[GDRIVE] ⚙️ service workers started — upload queue every ' + (WORKER_TICK_MS / 1000) +
    's, retention sweep every ' + Math.round(CLEAN_TICK_MS / 60000) + ' min, concurrency ' + CONCURRENCY);
}

export function stopGDriveWorkers() {
  stopped = true;
  clearInterval(workerTimer); clearInterval(cleanTimer); clearInterval(healthTimer);
  workerTimer = cleanTimer = healthTimer = null;
}

/** Manual retry from the UI: reset a FAILED (or stuck) job. */
export function retryFile(id) {
  const file = getFile(id);
  if (!file) throw new Error('File not found');
  if (!file.local_path || !fs.existsSync(file.local_path)) {
    throw new Error('The local copy is gone; this file can only be read from Google Drive now');
  }
  updateFile(id, { status: 'QUEUED', attempts: 0, next_attempt_at: Date.now(), error: '' });
  return getFile(id);
}

/** Integrity helper used by the admin page. */
export function localFileMatches(file) {
  try {
    if (!file || !file.local_path || !fs.existsSync(file.local_path)) return false;
    const stat = fs.statSync(file.local_path);
    return !file.size || stat.size === Number(file.size);
  } catch (e) { return false; }
}

export { md5Hex };

// Kept for the test suite and for a manual kick from the console.
export { workerTick as runWorkerOnce, cleanupTick as runCleanupOnce };
