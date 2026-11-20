// ============================================================================
// 🌐 GDrive Service Centre — HTTP surface
// ============================================================================
// Two very different audiences:
//
//   /gdrive/api/*        the owner's dashboard (this app)
//   /api/v1/gdrive/*     external client apps, authenticated with an API key
//
// The public API is the product: an app POSTs a file and gets a file_uuid in
// milliseconds, then GETs that uuid back at any time — from the VPS while it is
// fresh, from Google Drive forever after.
// ============================================================================
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import express from 'express';
import {
  listAccounts, getAccount, insertAccount, updateAccount, deleteAccount,
  listClients, getClient, getClientBySerial, insertClient, updateClient, deleteClient,
  getFile, insertFile, listFiles, updateFile, deleteFileRow, fileStats, clientStats,
  listAudit, audit, CACHE_ROOT, getSubfolder, saveSubfolder, listSubfolders
} from './db.mjs';
import {
  encryptSecret, decryptSecret, sha256, newApiKey, newSerial, keyHint,
  signFileLink, verifyFileLink
} from './crypto.mjs';
import { testCredentials, getQuota, ensureClientFolder, ensureFolder, folderInfo, deleteRemote, downloadRemote, invalidateDrive, folderUsage } from './drive.mjs';
import { storeUploadedFile, tmpDir, retryFile, localFileMatches } from './queue.mjs';
import { SEED_EMAIL } from './seed.mjs';

const PAGE_DIR = path.join(process.cwd(), 'public', 'gdrive-service');
const SCOPES = ['upload', 'read_upload', 'full'];
const SCOPE_LABEL = { upload: 'Upload only', read_upload: 'Read & upload', full: 'Full access' };

/** Absolute base URL for links handed to client apps. */
function publicBase(req) {
  const fixed = String(process.env.GDRIVE_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (fixed) return fixed;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  return proto + '://' + String(req.get('host') || 'localhost');
}

const sstr = (v, n = 200) => String(v == null ? '' : v).slice(0, n);
const safeName = (v) => String(v || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 140) || 'file';

/** RFC 5987 filename for the Content-Disposition header. */
function disposition(name) {
  const ascii = safeName(name).replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safeName(name))}`;
}

// ── rate limiting (per client, per minute, in memory) ───────────────────────
const rateBuckets = new Map();
function takeToken(client) {
  const limit = Math.max(1, Number(client.rate_limit) || 60);
  const now = Date.now();
  let bucket = rateBuckets.get(client.id);
  if (!bucket || now - bucket.start >= 60000) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(client.id, bucket);
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

// ── auth ────────────────────────────────────────────────────────────────────
function adminGuard(req, res, next) {
  const token = String(process.env.GDRIVE_ADMIN_TOKEN || '').trim();
  if (!token) return next();                       // unset = open, like the rest of this app
  const given = String(req.headers['x-gdrive-token'] || req.query.token || '').trim();
  if (given !== token) return res.status(401).json({ ok: false, error: 'Admin token required' });
  return next();
}

const SAFE_EQ = (a, b) => {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

function clientAuth(need) {
  return (req, res, next) => {
    const key = String(req.headers['x-api-key'] || '').trim();
    const serial = String(req.headers['x-client-serial'] || '').trim();
    if (!key || !serial) {
      return res.status(401).json({ ok: false, error: 'x-api-key and x-client-serial headers are required' });
    }
    const client = getClientBySerial(serial);
    if (!client) return res.status(401).json({ ok: false, error: 'Unknown client serial' });
    if (client.status !== 'active') return res.status(403).json({ ok: false, error: 'Client access is ' + client.status });
    if (client.expires_at && client.expires_at < Date.now()) {
      return res.status(403).json({ ok: false, error: 'Client key has expired' });
    }
    if (!SAFE_EQ(sha256(key), client.key_hash)) {
      audit({ drive_id: client.drive_id, client_id: client.id, action: 'auth.bad_key', ip: req.ip });
      return res.status(401).json({ ok: false, error: 'Invalid API key' });
    }

    const scope = client.scope || 'read_upload';
    const allowed =
      need === 'status' ||
      scope === 'full' ||
      (need === 'upload' && (scope === 'upload' || scope === 'read_upload')) ||
      (need === 'read' && scope === 'read_upload');
    if (!allowed) return res.status(403).json({ ok: false, error: 'This API key cannot ' + need });

    if (!takeToken(client)) return res.status(429).json({ ok: false, error: 'Rate limit reached, slow down' });

    const account = getAccount(client.drive_id);
    if (!account) return res.status(503).json({ ok: false, error: 'The Google Drive behind this key was removed' });
    if (account.status !== 'active') return res.status(503).json({ ok: false, error: 'This Google Drive is paused' });

    req.gdClient = client;
    req.gdAccount = account;
    updateClient(client.id, { last_used_at: Date.now() });
    return next();
  };
}

// ── serialisers (never leak secrets) ────────────────────────────────────────
function publicAccount(a, extra = {}) {
  if (!a) return null;
  return {
    id: a.id,
    alias: a.alias,
    email: a.email,
    root_folder_id: a.root_folder_id || '',
    retention_hours: a.retention_hours,
    quota_alert_gb: a.quota_alert_gb,
    status: a.status,
    last_health: a.last_health,
    last_error: a.last_error || '',
    last_checked_at: a.last_checked_at,
    quota_used: a.quota_used,
    quota_total: a.quota_total,
    has_credentials: !!(a.client_id && a.client_secret && a.refresh_token),
    client_id_hint: sstr(a.client_id, 40),
    created_at: a.created_at,
    ...extra
  };
}

function publicClient(c) {
  if (!c) return null;
  const expired = c.expires_at && c.expires_at < Date.now();
  return {
    id: c.id,
    drive_id: c.drive_id,
    name: c.name,
    serial: c.serial,
    key_hint: c.key_hint,
    folder_id: c.folder_id || '',
    folder_name: c.folder_name || c.name,
    folder_url: c.folder_id ? 'https://drive.google.com/drive/folders/' + c.folder_id : '',
    scope: c.scope,
    scope_label: SCOPE_LABEL[c.scope] || c.scope,
    rate_limit: c.rate_limit,
    expires_at: c.expires_at,
    expired: !!expired,
    status: expired && c.status === 'active' ? 'expired' : c.status,
    files_count: c.files_count,
    bytes_used: c.bytes_used,
    last_used_at: c.last_used_at,
    created_at: c.created_at
  };
}

function publicFile(f) {
  if (!f) return null;
  const local = localFileMatches(f);
  return {
    id: f.id,
    drive_id: f.drive_id,
    client_id: f.client_id,
    client_name: f.client_name || '',
    name: f.original_name,
    mime: f.mime,
    size: f.size,
    status: f.status,
    attempts: f.attempts,
    error: f.error || '',
    md5: f.md5 || '',
    gdrive_file_id: f.gdrive_file_id || '',
    gdrive_link: f.gdrive_file_id ? 'https://drive.google.com/file/d/' + f.gdrive_file_id + '/view' : '',
    local_present: local,
    local_path: f.local_path || '',
    downloads: f.downloads || 0,
    subfolder: f.subfolder || '',
    link: '/api/v1/gdrive/file/' + f.id + '?link=' + signFileLink(f.id),
    created_at: f.created_at,
    uploaded_at: f.uploaded_at,
    cleaned_at: f.cleaned_at
  };
}

// ── routes ──────────────────────────────────────────────────────────────────
export function registerGDriveServiceRoutes(app, multer) {
  const router = express.Router();

  // ── pages ────────────────────────────────────────────────────────────────
  const page = (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(PAGE_DIR, 'index.html'));
  };
  app.get('/gdrive-service', page);
  app.get('/gdrive-service/:driveId', page);
  app.get('/gdrive-service/static/:file', (req, res) => {
    const file = String(req.params.file || '');
    // One path segment, known extension, and it must really resolve inside PAGE_DIR.
    if (!/^[A-Za-z0-9._-]+\.(js|css|svg|png)$/i.test(file) || file.includes('..')) {
      return res.status(404).type('txt').send('Not found');
    }
    const abs = path.join(PAGE_DIR, file);
    if (!abs.startsWith(PAGE_DIR + path.sep) || !fs.existsSync(abs)) {
      return res.status(404).type('txt').send('Not found');
    }
    // These are hand-maintained files, not build output: never cache them forever.
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(abs);
  });

  // ── admin: system + accounts ─────────────────────────────────────────────
  router.get('/system', adminGuard, (req, res) => {
    res.json({
      ok: true,
      seed_email: SEED_EMAIL,
      cache_root: CACHE_ROOT,
      scopes: SCOPES.map((s) => ({ value: s, label: SCOPE_LABEL[s] })),
      retention_default: 24,
      admin_token_required: !!String(process.env.GDRIVE_ADMIN_TOKEN || '').trim()
    });
  });

  /** Test credentials WITHOUT saving them. */
  router.post('/accounts/test', adminGuard, express.json({ limit: '64kb' }), async (req, res) => {
    const body = req.body || {};
    try {
      const result = await testCredentials({
        client_id: body.client_id,
        client_secret: body.client_secret,
        refresh_token: body.refresh_token
      });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(400).json({ ok: false, error: sstr((e && e.message) || e, 300) });
    }
  });

  router.get('/accounts', adminGuard, (req, res) => {
    const rows = listAccounts().map((a) => publicAccount(a, {
      clients_active: clientStats(a.id).active,
      stats: fileStats(a.id)
    }));
    res.json({ ok: true, accounts: rows });
  });

  router.post('/accounts', adminGuard, express.json({ limit: '128kb' }), async (req, res) => {
    const body = req.body || {};
    const alias = sstr(body.alias, 80).trim();
    const email = sstr(body.email, 160).trim();
    const clientId = sstr(body.client_id, 200).trim();
    const clientSecret = sstr(body.client_secret, 400).trim();
    const refreshToken = sstr(body.refresh_token, 800).trim();
    if (!alias || !email || !clientId || !clientSecret || !refreshToken) {
      return res.status(400).json({ ok: false, error: 'Alias, email, client id, client secret and refresh token are required' });
    }
    try {
      const account = insertAccount({
        alias,
        email,
        client_id: clientId,
        client_secret: encryptSecret(clientSecret),
        refresh_token: encryptSecret(refreshToken),
        root_folder_id: sstr(body.root_folder_id, 120).trim(),
        retention_hours: Number(body.retention_hours) || 24,
        quota_alert_gb: Number(body.quota_alert_gb) || 0,
        status: body.status === 'inactive' ? 'inactive' : 'active'
      });
      audit({ drive_id: account.id, action: 'account.created', detail: alias + ' <' + email + '>' });
      // Read the live quota straight away so the dashboard is not blank.
      try {
        const quota = await getQuota(account);
        updateAccount(account.id, {
          quota_used: quota.used, quota_total: quota.total,
          last_health: 'connected', last_error: '', last_checked_at: Date.now()
        });
      } catch (e) { /* the health sweep will retry */ }
      res.json({ ok: true, account: publicAccount(getAccount(account.id)) });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr((e && e.message) || e, 300) });
    }
  });

  router.put('/accounts/:id', adminGuard, express.json({ limit: '128kb' }), (req, res) => {
    const account = getAccount(req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });
    const body = req.body || {};
    const patch = {};
    if (body.alias !== undefined) patch.alias = sstr(body.alias, 80).trim();
    if (body.email !== undefined) patch.email = sstr(body.email, 160).trim();
    if (body.root_folder_id !== undefined) patch.root_folder_id = sstr(body.root_folder_id, 120).trim();
    if (body.retention_hours !== undefined) patch.retention_hours = Math.max(1, Math.min(Number(body.retention_hours) || 24, 720));
    if (body.quota_alert_gb !== undefined) patch.quota_alert_gb = Math.max(0, Number(body.quota_alert_gb) || 0);
    if (body.status !== undefined) patch.status = body.status === 'inactive' ? 'inactive' : 'active';
    if (body.client_id) patch.client_id = sstr(body.client_id, 200).trim();
    if (body.client_secret) patch.client_secret = encryptSecret(sstr(body.client_secret, 400).trim());
    if (body.refresh_token) patch.refresh_token = encryptSecret(sstr(body.refresh_token, 800).trim());
    const updated = updateAccount(account.id, patch);
    if (patch.client_id || patch.client_secret || patch.refresh_token) invalidateDrive(account.id);
    audit({ drive_id: account.id, action: 'account.updated', detail: Object.keys(patch).join(',') });
    res.json({ ok: true, account: publicAccount(updated) });
  });

  router.delete('/accounts/:id', adminGuard, (req, res) => {
    const account = getAccount(req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });
    deleteAccount(account.id);
    invalidateDrive(account.id);
    audit({ action: 'account.deleted', detail: account.alias });
    res.json({ ok: true });
  });

  /** Re-test a saved account and refresh its quota. */
  router.post('/accounts/:id/test', adminGuard, async (req, res) => {
    const account = getAccount(req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });
    invalidateDrive(account.id);
    try {
      const result = await testCredentials({
        client_id: account.client_id,
        client_secret: decryptSecret(account.client_secret),
        refresh_token: decryptSecret(account.refresh_token)
      });
      const updated = updateAccount(account.id, {
        last_health: 'connected',
        last_error: '',
        last_checked_at: Date.now(),
        quota_used: result.quota.used,
        quota_total: result.quota.total
      });
      res.json({ ok: true, account: publicAccount(updated), quota: result.quota, drive_email: result.email });
    } catch (e) {
      const message = sstr((e && e.message) || e, 300);
      updateAccount(account.id, {
        last_health: /invalid_grant|unauthorized|401|invalid_client/i.test(message) ? 'expired' : 'error',
        last_error: message,
        last_checked_at: Date.now()
      });
      res.status(400).json({ ok: false, error: message });
    }
  });

  /** Everything the dedicated service page needs, in one call. */
  router.get('/accounts/:id/overview', adminGuard, (req, res) => {
    const account = getAccount(req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });
    res.json({
      ok: true,
      account: publicAccount(account),
      stats: fileStats(account.id),
      clients: listClients(account.id).map(publicClient),
      files: listFiles(account.id, 60).map(publicFile),
      audit: listAudit(account.id, null, 40)
    });
  });

  // ── admin: clients ───────────────────────────────────────────────────────
  router.get('/accounts/:id/clients', adminGuard, (req, res) => {
    const account = getAccount(req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });
    res.json({ ok: true, clients: listClients(account.id).map(publicClient) });
  });

  /**
   * "Apps in this drive" — per-app folder size, read live from Google Drive.
   * Pass ?live=0 to answer from the local counters (fast, no Drive calls).
   */
  router.get('/accounts/:id/apps', adminGuard, async (req, res) => {
    const account = getAccount(req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });

    const live = req.query.live !== '0';
    const apps = [];
    const clients = listClients(account.id).map(publicClient);

    // A drive-wide tracker (one client pointed at the shared root) must not count
    // the folders that belong to the other apps again.
    const ownedFolders = new Map();
    for (const c of clients) if (c.folder_id) ownedFolders.set(c.folder_id, c.id);

    for (const c of clients) {
      const row = Object.assign({}, c, {
        live: false,
        live_error: '',
        drive_files: 0,
        drive_bytes: 0,
        drive_folders: 0
      });
      if (live && c.folder_id) {
        try {
          const exclude = [];
          for (const [fid, ownerId] of ownedFolders) if (ownerId !== c.id) exclude.push(fid);
          const usage = await folderUsage(account, c.folder_id, { exclude });
          row.live = true;
          row.drive_files = usage.files;
          row.drive_bytes = usage.bytes;
          row.drive_folders = usage.folders;
        } catch (e) {
          row.live_error = sstr((e && e.message) || e, 200);
        }
      }
      apps.push(row);
    }

    const totals = apps.reduce((acc, r) => {
      acc.files += Number(r.drive_files) || 0;
      acc.bytes += Number(r.drive_bytes) || 0;
      acc.recorded_files += Number(r.files_count) || 0;
      acc.recorded_bytes += Number(r.bytes_used) || 0;
      return acc;
    }, { files: 0, bytes: 0, recorded_files: 0, recorded_bytes: 0 });

    res.json({ ok: true, live, apps, totals });
  });

  router.post('/accounts/:id/clients', adminGuard, express.json({ limit: '64kb' }), async (req, res) => {
    const account = getAccount(req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });

    const body = req.body || {};
    const name = sstr(body.name, 80).trim();
    if (!name) return res.status(400).json({ ok: false, error: 'Client app name is required' });

    // The folder is where this app's files actually land; it defaults to the app name.
    const folderName = sstr(body.folder_name, 80).replace(/[\\/]+/g, ' ').trim() || name;
    // An existing folder can be linked instead of created (used to track an app
    // that already writes to the drive with its own credentials).
    const existingFolderId = sstr(body.folder_id, 160).trim();

    const scope = SCOPES.includes(body.scope) ? body.scope : 'read_upload';
    const rateLimit = Math.max(1, Math.min(Number(body.rate_limit) || 60, 6000));

    let expiresAt = 0;
    if (body.expires_at !== undefined && body.expires_at !== null && body.expires_at !== '') {
      expiresAt = Number(body.expires_at) || 0;
    } else if (body.ttl_days !== undefined && body.ttl_days !== null && body.ttl_days !== '' && Number(body.ttl_days) > 0) {
      expiresAt = Date.now() + Number(body.ttl_days) * 24 * 3600 * 1000;
    }

    try {
      let folderId = '';
      let finalFolderName = folderName;

      if (existingFolderId) {
        const info = await folderInfo(account, existingFolderId);
        folderId = info.id;
        finalFolderName = info.name;
      } else {
        folderId = await ensureClientFolder(account, folderName);
      }

      const apiKey = newApiKey();
      const client = insertClient({
        drive_id: account.id,
        name,
        serial: newSerial(),
        key_hash: sha256(apiKey),
        key_hint: keyHint(apiKey),
        folder_id: folderId,
        folder_name: finalFolderName,
        scope,
        rate_limit: rateLimit,
        expires_at: expiresAt,
        status: 'active'
      });
      audit({ drive_id: account.id, client_id: client.id, action: 'client.created', detail: name + ' → folder "' + finalFolderName + '" (' + scope + ')' });
      // The plaintext key is returned exactly once.
      res.json({ ok: true, client: publicClient(client), api_key: apiKey });
    } catch (e) {
      res.status(400).json({ ok: false, error: sstr((e && e.message) || e, 300) });
    }
  });

  router.patch('/clients/:id', adminGuard, express.json({ limit: '32kb' }), (req, res) => {
    const client = getClient(req.params.id);
    if (!client) return res.status(404).json({ ok: false, error: 'Client not found' });
    const body = req.body || {};

    if (body.action === 'revoke') {
      updateClient(client.id, { status: 'revoked', revoked_at: Date.now() });
      audit({ drive_id: client.drive_id, client_id: client.id, action: 'client.revoked', detail: client.name });
      return res.json({ ok: true, client: publicClient(getClient(client.id)) });
    }
    if (body.action === 'activate') {
      updateClient(client.id, { status: 'active', revoked_at: 0 });
      audit({ drive_id: client.drive_id, client_id: client.id, action: 'client.activated', detail: client.name });
      return res.json({ ok: true, client: publicClient(getClient(client.id)) });
    }
    if (body.action === 'regenerate') {
      const apiKey = newApiKey();
      updateClient(client.id, { key_hash: sha256(apiKey), key_hint: keyHint(apiKey), status: 'active', revoked_at: 0 });
      audit({ drive_id: client.drive_id, client_id: client.id, action: 'client.key_regenerated', detail: client.name });
      return res.json({ ok: true, client: publicClient(getClient(client.id)), api_key: apiKey });
    }
    if (body.action === 'extend') {
      const days = Math.max(1, Math.min(Number(body.days) || 30, 3650));
      const base = Math.max(Date.now(), Number(client.expires_at) || 0);
      updateClient(client.id, { expires_at: base + days * 24 * 3600 * 1000 });
      audit({ drive_id: client.drive_id, client_id: client.id, action: 'client.extended', detail: days + ' days' });
      return res.json({ ok: true, client: publicClient(getClient(client.id)) });
    }

    const patch = {};
    if (body.name !== undefined) patch.name = sstr(body.name, 80).trim();
    if (body.scope !== undefined && SCOPES.includes(body.scope)) patch.scope = body.scope;
    if (body.rate_limit !== undefined) patch.rate_limit = Math.max(1, Math.min(Number(body.rate_limit) || 60, 6000));
    if (body.expires_at !== undefined) patch.expires_at = Number(body.expires_at) || 0;
    const updated = updateClient(client.id, patch);
    audit({ drive_id: client.drive_id, client_id: client.id, action: 'client.updated', detail: Object.keys(patch).join(',') });
    res.json({ ok: true, client: publicClient(updated) });
  });

  router.delete('/clients/:id', adminGuard, (req, res) => {
    const client = getClient(req.params.id);
    if (!client) return res.status(404).json({ ok: false, error: 'Client not found' });
    deleteClient(client.id);
    audit({ drive_id: client.drive_id, action: 'client.deleted', detail: client.name });
    res.json({ ok: true });
  });

  router.get('/clients/:id/audit', adminGuard, (req, res) => {
    const client = getClient(req.params.id);
    if (!client) return res.status(404).json({ ok: false, error: 'Client not found' });
    res.json({ ok: true, audit: listAudit(client.drive_id, client.id, 100) });
  });

  // ── admin: files / queue ─────────────────────────────────────────────────
  router.get('/accounts/:id/files', adminGuard, (req, res) => {
    const account = getAccount(req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });
    res.json({
      ok: true,
      stats: fileStats(account.id),
      files: listFiles(account.id, Number(req.query.limit) || 60).map(publicFile)
    });
  });

  /** Owner preview of the VPS copy (inline instead of a download). */
  router.get('/files/:uuid/peek', adminGuard, (req, res) => {
    const file = getFile(req.params.uuid);
    if (!file) return res.status(404).json({ ok: false, error: 'File not found' });
    if (!file.local_path || !fs.existsSync(file.local_path)) {
      if (file.gdrive_file_id) {
        return res.redirect(302, 'https://drive.google.com/file/d/' + encodeURIComponent(file.gdrive_file_id) + '/view');
      }
      return res.status(404).json({ ok: false, error: 'The local copy is gone and there is no Drive copy' });
    }
    res.setHeader('Content-Type', file.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline; filename="' + safeName(file.original_name).replace(/[^\x20-\x7e]/g, '_') + '"');
    res.setHeader('X-GDrive-Source', 'vps-cache');
    fs.createReadStream(file.local_path)
      .on('error', () => { try { res.destroy(); } catch (e) { /* ignore */ } })
      .pipe(res);
  });

  router.post('/files/:uuid/retry', adminGuard, (req, res) => {
    try {
      const file = retryFile(req.params.uuid);
      res.json({ ok: true, file: publicFile(file) });
    } catch (e) {
      res.status(400).json({ ok: false, error: sstr((e && e.message) || e, 200) });
    }
  });

  router.delete('/files/:uuid', adminGuard, async (req, res) => {
    const file = getFile(req.params.uuid);
    if (!file) return res.status(404).json({ ok: false, error: 'File not found' });
    const account = getAccount(file.drive_id);
    if (file.gdrive_file_id && account) {
      try { await deleteRemote(account, file.gdrive_file_id); }
      catch (e) { return res.status(502).json({ ok: false, error: 'Google refused the delete: ' + sstr((e && e.message) || e, 200) }); }
    }
    try { if (file.local_path && fs.existsSync(file.local_path)) fs.unlinkSync(file.local_path); } catch (e) { /* gone */ }
    deleteFileRow(file.id);
    audit({ drive_id: file.drive_id, client_id: file.client_id, action: 'file.deleted', detail: file.original_name });
    res.json({ ok: true });
  });

  app.use('/gdrive/api', router);

  // ── public API for client apps ───────────────────────────────────────────
  const publicRouter = express.Router();
  const maxMb = Math.max(1, Number(process.env.GDRIVE_MAX_UPLOAD_MB) || 200);
  const upload = multer({ dest: tmpDir(), limits: { fileSize: maxMb * 1024 * 1024 } });

  // Apps live on other domains (a static site, a desktop tool), so they call this
  // API cross-origin. Credentials travel in headers, never in cookies.
  publicRouter.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'x-api-key, x-client-serial, x-gdrive-folder, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'X-GDrive-Source, Content-Disposition');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });

  publicRouter.get('/health', (req, res) => res.json({ ok: true, service: 'gdrive-service-centre' }));

  /** Who does this key belong to? Used by an app's "Test connection" button. */
  publicRouter.get('/me', clientAuth('status'), (req, res) => {
    const c = req.gdClient;
    const a = req.gdAccount;
    res.json({
      ok: true,
      client: {
        id: c.id,
        name: c.name,
        serial: c.serial,
        scope: c.scope,
        folder_id: c.folder_id,
        folder_name: c.folder_name || c.name,
        rate_limit: c.rate_limit,
        expires_at: c.expires_at
      },
      drive: {
        alias: a.alias,
        email: a.email,
        retention_hours: a.retention_hours,
        quota_used: a.quota_used,
        quota_total: a.quota_total
      },
      subfolders: listSubfolders(c.id).map((s) => s.name)
    });
  });

  publicRouter.post('/file', clientAuth('upload'), upload.single('file'), async (req, res) => {
    const client = req.gdClient;
    const account = req.gdAccount;
    if (!req.file) return res.status(400).json({ ok: false, error: 'Attach the file as multipart field "file"' });

    try {
      let folderId = client.folder_id;
      if (!folderId) {
        folderId = await ensureClientFolder(account, client.folder_name || client.name);
        updateClient(client.id, { folder_id: folderId });
      }
      const appFolderId = folderId;

      // Optional subfolder inside the app folder: one per branch, project, month…
      const subfolder = sstr(
        (req.body && req.body.folder) || req.get('x-gdrive-folder') || '', 80
      ).replace(/[\\/]+/g, ' ').replace(/\s+/g, ' ').trim();

      if (subfolder) {
        const cached = getSubfolder(client.id, subfolder);
        if (cached && cached.folder_id) {
          folderId = cached.folder_id;
        } else {
          folderId = await ensureFolder(account, subfolder, appFolderId);
          saveSubfolder(client.id, subfolder, folderId);
          audit({ drive_id: account.id, client_id: client.id, action: 'subfolder.ready', detail: subfolder });
        }
      }

      const stored = await storeUploadedFile(req.file.path, req.file.originalname, account.id, client.id);
      const row = insertFile({
        id: stored.id,
        drive_id: account.id,
        client_id: client.id,
        client_name: client.name,
        original_name: sstr(req.file.originalname || 'file', 200),
        mime: sstr(req.file.mimetype || 'application/octet-stream', 120),
        size: stored.size,
        local_path: stored.abs,
        md5: stored.md5,
        gdrive_folder_id: folderId,
        subfolder
      });
      audit({ drive_id: account.id, client_id: client.id, action: 'file.received', detail: row.original_name, ip: req.ip });

      res.json({
        ok: true,
        file_uuid: row.id,
        name: row.original_name,
        size: row.size,
        status: row.status,
        folder: row.subfolder || '',
        // A plain link the calling app can put straight into an <a href>.
        url: publicBase(req) + '/api/v1/gdrive/file/' + row.id + '?link=' + signFileLink(row.id),
        expires_from_vps_at: Date.now() + (Number(account.retention_hours) || 24) * 3600 * 1000
      });
    } catch (e) {
      try { if (req.file && req.file.path) fs.unlinkSync(req.file.path); } catch (e2) { /* ignore */ }
      res.status(500).json({ ok: false, error: sstr((e && e.message) || e, 240) });
    }
  });

  /**
   * Read access: API headers for programs, or a signed ?link= for browsers.
   * The link only opens the file it was minted for — no key ever appears in a URL.
   */
  function readAuth(req, res, next) {
    if (req.headers['x-api-key'] || req.headers['x-client-serial']) {
      return clientAuth('read')(req, res, next);
    }
    const sig = String(req.query.link || '');
    if (!sig || !verifyFileLink(req.params.uuid, sig)) {
      return res.status(401).json({ ok: false, error: 'Send x-api-key + x-client-serial, or open a link signed for this file' });
    }
    const file = getFile(req.params.uuid);
    if (!file) return res.status(404).json({ ok: false, error: 'File not found' });
    const account = getAccount(file.drive_id);
    if (!account) return res.status(503).json({ ok: false, error: 'The Google Drive behind this file was removed' });
    req.gdFile = file;
    req.gdAccount = account;
    return next();
  }

  publicRouter.get('/file/:uuid', readAuth, async (req, res) => {
    const file = req.gdFile || getFile(req.params.uuid);
    if (!file || (req.gdClient && file.drive_id !== req.gdClient.drive_id)) {
      return res.status(404).json({ ok: false, error: 'File not found for this drive' });
    }
    updateFile(file.id, { downloads: (Number(file.downloads) || 0) + 1 });

    // 1. On the VPS → serve instantly.
    if (file.local_path && fs.existsSync(file.local_path)) {
      res.setHeader('Content-Type', file.mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', disposition(file.original_name));
      res.setHeader('X-GDrive-Source', 'vps-cache');
      return fs.createReadStream(file.local_path)
        .on('error', () => { try { res.destroy(); } catch (e) { /* ignore */ } })
        .pipe(res);
    }

    // 2. Archived → stream straight from Google.
    if (!file.gdrive_file_id) {
      return res.status(409).json({ ok: false, error: 'The local copy is gone and this file was never uploaded to Google Drive' });
    }
    try {
      const stream = await downloadRemote(req.gdAccount, file.gdrive_file_id);
      res.setHeader('Content-Type', file.mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', disposition(file.original_name));
      res.setHeader('X-GDrive-Source', 'google-drive');
      stream.on('error', () => { try { res.destroy(); } catch (e) { /* ignore */ } });
      stream.pipe(res);
    } catch (e) {
      res.status(502).json({ ok: false, error: 'Google Drive could not deliver the file: ' + sstr((e && e.message) || e, 160) });
    }
  });

  publicRouter.delete('/file/:uuid', clientAuth('delete'), async (req, res) => {
    const file = getFile(req.params.uuid);
    if (!file || file.drive_id !== req.gdClient.drive_id) {
      return res.status(404).json({ ok: false, error: 'File not found for this drive' });
    }
    try {
      if (file.gdrive_file_id) await deleteRemote(req.gdAccount, file.gdrive_file_id);
    } catch (e) {
      return res.status(502).json({ ok: false, error: 'Google refused the delete: ' + sstr((e && e.message) || e, 160) });
    }
    try { if (file.local_path && fs.existsSync(file.local_path)) fs.unlinkSync(file.local_path); } catch (e) { /* gone */ }
    deleteFileRow(file.id);
    audit({ drive_id: file.drive_id, client_id: file.client_id, action: 'file.deleted_by_client', detail: file.original_name, ip: req.ip });
    res.json({ ok: true });
  });

  app.use('/api/v1/gdrive', publicRouter);

  console.log('[GDRIVE] ☁️ API Service Centre ready — dashboard /gdrive-service, public API /api/v1/gdrive');
}
