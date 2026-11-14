// ============================================================================
// 🚢 Containers & Lots — file service, hosted inside WHATANAGENT
// ============================================================================
// WHY THIS EXISTS
// The Containers & Lots app (proformatrackerpro.web.app) keeps every business
// RECORD in the browser's own SQLite + a Firestore mirror. Nothing important
// lives on a server. The only server-side work is moving FILE BYTES to Google
// Drive, plus reading a BL PDF with AI.
//
// That used to run on a Render free instance, which sleeps: the first call
// after a sleep took ~33 seconds. This module puts the same service on the
// always-on Tencent VPS that already runs WHATANAGENT, so Drive calls are hot
// and no second server is needed.
//
// ROUTES (all under /candl/api, kept apart from WHATANAGENT's own /api):
//   GET  /warmup                    tiny keep-alive/health probe
//   GET  /gdrive/status             connected? re-authorise link
//   GET  /gdrive/auth               start Google OAuth
//   GET  /gdrive/callback           finish Google OAuth
//   POST /gdrive/upload             bytes -> Drive, returns file rows
//   POST /containers/:id/photos     container photo bytes -> Drive
//   POST /payments/:id/photos       payment voucher photo bytes -> Drive
//   GET  /files/thumbnail/:id       WebP thumbnail (images + PDF first page)
//   POST /files/delete              delete a Drive file
//   POST /files/rename              rename a Drive file
//   POST /files/replace             replace a Drive file (upload + delete old)
//   POST /bl/extract                read a BL PDF -> structured fields
//
// It is deliberately STATELESS: no SQLite, no records. The old backend looked
// files up in its own database, which never contained the browser-stored
// records, so delete/rename/replace answered "Record not found". Here the
// caller passes the Drive id it already knows (`file_id` / `folder_id`).
// ============================================================================
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const gdrive = require('./candlGdrive.cjs');
const { makeThumbnail, thumbCacheGet, thumbCacheSet, thumbCacheDelete } = require('./candlThumbnails.cjs');

const PREFIX = '/candl/api';
const UPLOAD_DIR = path.join(os.tmpdir(), 'whatanagent-candl-uploads');

/** A Drive folder id we can actually use (the legacy code marked fake ids with "folder_"). */
const realFolderId = (v) => {
  const s = String(v == null ? '' : v).trim();
  return s && !s.startsWith('folder_') ? s : null;
};

const safeName = (n) => String(n || 'file').replace(/[\\/:*?"<>|]+/g, '_').replace(/^\.+/, '').slice(0, 180) || 'file';

function unlinkQuiet(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
}

// Drive readiness is checked once a minute instead of on every upload, and a failure is
// returned as 503 — never faked. The old code invented "file_xxxx" ids when Drive was down,
// so photos looked saved while nothing reached Google Drive.
let driveOkUntil = 0;
let driveReason = '';
async function driveReady() {
  if (Date.now() < driveOkUntil) return { ok: true };
  if (driveOkUntil && Date.now() < driveOkUntil + 60000 * 5 && driveReason) {
    return { ok: false, reason: driveReason };
  }
  try {
    const conn = await gdrive.checkConnection();
    if (conn.connected) { driveOkUntil = Date.now() + 60000; driveReason = ''; return { ok: true }; }
    driveOkUntil = Date.now() - 1;
    driveReason = conn.reason || 'Google Drive is not connected.';
  } catch (e) {
    driveOkUntil = Date.now() - 1;
    driveReason = String(e.message || e);
  }
  return { ok: false, reason: driveReason };
}

function downloadToBuffer(fileId) {
  return new Promise((resolve, reject) => {
    gdrive.getFileStream(fileId).then((stream) => {
      if (!stream) return reject(new Error('no stream'));
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    }).catch(reject);
  });
}

/**
 * Find or create the Drive folder for a proforma.
 * The client normally sends the folder id it saved on the record; creating one
 * is only a fallback for the very first upload of a fresh proforma.
 */
async function resolveProformaFolder(body = {}) {
  const known = realFolderId(body.proforma_folder_id) || realFolderId(body.folder_id);
  if (known) return known;
  const label = 'PI-' + (body.proforma_number || body.proforma_id || 'General') + ' - ' + (body.customer_name || 'Documents');
  const root = await gdrive.getOrCreateRootFolder();
  return realFolderId(await gdrive.createFolder(label.slice(0, 160), root));
}

/** Extracted photo rows carry the folder id so the client can reuse it next time. */
async function uploadPhotoBatch(req, { folderKey, recordKey, folderLabelFallback }) {
  const files = req.files || [];
  if (!files.length) return { error: 'No files uploaded', status: 400 };

  let folderId =
    realFolderId(req.body[folderKey]) ||
    realFolderId(req.body.proforma_folder_id) ||
    realFolderId(req.body.folder_id);
  if (!folderId) {
    const parent = await resolveProformaFolder(req.body);
    const label = folderLabelFallback || ('Batch-' + Date.now());
    folderId = parent ? realFolderId(await gdrive.createFolder(String(label).slice(0, 160), parent)) : null;
  }

  const photos = [];
  for (const file of files) {
    try {
      if (!folderId) throw new Error('Google Drive folder unavailable');
      const info = await gdrive.uploadFile(file.path, file.originalname, file.mimetype, folderId);
      photos.push({
        id: photos.length + 1,
        [recordKey]: req.params.id,
        gdrive_file_id: info.id,
        gdrive_file_name: file.originalname,
        gdrive_folder_id: folderId,
        webViewLink: info.webViewLink || '#'
      });
    } catch (e) {
      console.warn('[CANDL] photo upload failed:', e.message);
    } finally {
      unlinkQuiet(file.path);
    }
  }
  return { photos, folderId };
}

export function registerCandlRoutes(app, multer, opts = {}) {
  if (!multer) throw new Error('registerCandlRoutes needs multer');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + safeName(file.originalname))
  });
  const upload = multer({ storage, limits: { fileSize: 40 * 1024 * 1024, files: 30 } });

  // Keep-alive probe: the web app pings this on load to wake the backend.
  app.get(PREFIX + '/warmup', (req, res) => res.json({ ok: true, ts: Date.now(), service: 'candl-files' }));

  // ── Google Drive connection ───────────────────────────────────────────────
  app.get(PREFIX + '/gdrive/status', async (req, res) => {
    try {
      const conn = await gdrive.checkConnection();
      res.json({
        isMockMode: gdrive.isMockMode(),
        connected: conn.connected,
        reason: conn.reason,
        authUrl: gdrive.getAuthUrl() || null
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get(PREFIX + '/gdrive/auth', (req, res) => {
    const url = gdrive.getAuthUrl();
    if (!url) return res.status(400).send('OAuth2 client not configured in backend.');
    res.redirect(url);
  });

  app.get(PREFIX + '/gdrive/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing authorization code');
    try {
      await gdrive.storeToken(code);
      res.send('<div style="font-family:sans-serif;text-align:center;padding:3rem;background:#0F172A;color:#F1F5F9;min-height:100vh">'
        + '<h2 style="color:#10B981">Google Drive Authorized</h2>'
        + '<p style="color:#94A3B8">Offline access is configured. You may close this window.</p></div>');
    } catch (error) {
      res.status(500).send('Authentication failed: ' + error.message);
    }
  });

  // ── Upload bytes to Drive (no records are created here) ───────────────────
  app.post(PREFIX + '/gdrive/upload', upload.any(), async (req, res) => {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No files to upload' });
    const ready = await driveReady();
    if (!ready.ok) { files.forEach(f => unlinkQuiet(f.path)); return res.status(503).json({ error: ready.reason }); }
    try {
      const folderId = await resolveProformaFolder(req.body);
      const rows = [];
      for (const file of files) {
        try {
          if (!folderId) throw new Error('Google Drive folder unavailable');
          const info = await gdrive.uploadFile(file.path, file.originalname, file.mimetype, folderId);
          rows.push({
            gdrive_file_id: info.id,
            gdrive_file_name: info.name || file.originalname,
            webViewLink: info.webViewLink || '#',
            mimeType: info.mimeType || file.mimetype || 'application/octet-stream',
            gdrive_folder_id: folderId
          });
        } finally {
          unlinkQuiet(file.path);
        }
      }
      res.status(201).json({ ok: true, folder_id: folderId, files: rows });
    } catch (e) {
      files.forEach(f => unlinkQuiet(f.path));
      res.status(500).json({ error: e.message });
    }
  });

  // ── Container / payment photos ────────────────────────────────────────────
  app.post([PREFIX + '/containers/:id/photos'], upload.array('photos', 30), async (req, res) => {
    const ready = await driveReady();
    if (!ready.ok) { (req.files || []).forEach(f => unlinkQuiet(f.path)); return res.status(503).json({ error: ready.reason }); }
    try {
      const label = 'Container-' + (req.body.container_number || req.params.id);
      const out = await uploadPhotoBatch(req, { folderKey: 'container_folder_id', recordKey: 'container_id', folderLabelFallback: label });
      if (out.error) return res.status(out.status).json({ error: out.error });
      res.status(201).json({ message: out.photos.length + ' photo(s) added successfully', photos: out.photos, folder_id: out.folderId });
    } catch (e) {
      (req.files || []).forEach(f => unlinkQuiet(f.path));
      res.status(500).json({ error: 'Failed to upload photos: ' + e.message });
    }
  });

  app.post([PREFIX + '/payments/:id/photos'], upload.array('photos', 30), async (req, res) => {
    const ready = await driveReady();
    if (!ready.ok) { (req.files || []).forEach(f => unlinkQuiet(f.path)); return res.status(503).json({ error: ready.reason }); }
    try {
      const label = 'Payment-' + (req.body.reference_number || req.params.id);
      const out = await uploadPhotoBatch(req, { folderKey: 'payment_folder_id', recordKey: 'payment_id', folderLabelFallback: label });
      if (out.error) return res.status(out.status).json({ error: out.error });
      res.status(201).json({ message: out.photos.length + ' file(s) added successfully', photos: out.photos, folder_id: out.folderId });
    } catch (e) {
      (req.files || []).forEach(f => unlinkQuiet(f.path));
      res.status(500).json({ error: 'Failed to upload files: ' + e.message });
    }
  });

  // ── Thumbnails: 250px WebP for images, first page for PDFs ────────────────
  app.get(PREFIX + '/files/thumbnail/:id', async (req, res) => {
    const fileId = req.params.id;
    const cached = thumbCacheGet(fileId);
    if (cached) {
      res.setHeader('Content-Type', cached.type || 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(cached.buffer);
    }
    try {
      const buffer = await downloadToBuffer(fileId);
      const thumb = await makeThumbnail(buffer);
      if (thumb) {
        thumbCacheSet(fileId, thumb);
        res.setHeader('Content-Type', thumb.type || 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(thumb.buffer);
      }
    } catch (error) {
      console.warn('[CANDL] thumbnail generation failed, streaming original:', error.message);
    }
    try {
      const stream = await gdrive.getFileStream(fileId);
      if (!stream) return res.status(404).send('Thumbnail not found');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      stream.pipe(res);
    } catch (error) {
      res.status(500).send('Thumbnail fetch failed');
    }
  });

  // ── Delete / rename / replace a Drive file ────────────────────────────────
  // These three used to look the file up in a server database that never held
  // the browser-stored records, so they always failed. The caller now supplies
  // the Drive id it already knows.
  app.post(PREFIX + '/files/delete', async (req, res) => {
    const fileId = realFolderId(req.body.file_id) || String(req.body.file_id || '').trim();
    if (!fileId) return res.status(400).json({ error: 'file_id is required (the Google Drive file id from the record).' });
    try {
      await gdrive.deleteFileOrFolder(fileId);
      thumbCacheDelete(fileId);
      res.json({ ok: true, message: 'File deleted successfully' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete file from Drive: ' + e.message });
    }
  });

  app.post(PREFIX + '/files/rename', async (req, res) => {
    const fileId = String(req.body.file_id || '').trim();
    const raw = String(req.body.new_name || '').trim();
    if (!fileId || !raw) return res.status(400).json({ error: 'file_id and new_name are required.' });
    const cleanName = /\.pdf$/i.test(raw) ? raw : raw + '.pdf';
    try {
      await gdrive.renameFileOrFolder(fileId, cleanName);
      res.json({ message: 'File renamed successfully', gdrive_file_name: cleanName });
    } catch (e) {
      res.status(500).json({ error: 'Failed to rename file on Drive: ' + e.message });
    }
  });

  app.post(PREFIX + '/files/replace', upload.single('pdf'), async (req, res) => {
    const oldFileId = String(req.body.file_id || '').trim();
    if (!req.file) return res.status(400).json({ error: 'Missing file or entity info' });
    try {
      let folderId = realFolderId(req.body.folder_id) || realFolderId(req.body.proforma_folder_id);
      if (!folderId) folderId = await resolveProformaFolder(req.body);
      if (!folderId) throw new Error('Google Drive folder unavailable');
      const info = await gdrive.uploadFile(req.file.path, req.file.originalname, req.file.mimetype, folderId);
      if (oldFileId && oldFileId !== info.id) {
        try { await gdrive.deleteFileOrFolder(oldFileId); thumbCacheDelete(oldFileId); } catch (e) { console.warn('[CANDL] old file kept:', e.message); }
      }
      res.json({
        message: 'File replaced successfully',
        gdrive_file_id: info.id,
        gdrive_file_name: req.file.originalname,
        gdrive_folder_id: folderId
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to replace file: ' + error.message });
    } finally {
      unlinkQuiet(req.file && req.file.path);
    }
  });

  // ── BL document reader (PDF text -> AI -> structured fields) ──────────────
  app.post(PREFIX + '/bl/extract', upload.single('pdf'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Please upload a BL PDF file' });
    const filePath = req.file.path;
    try {
      const buf = fs.readFileSync(filePath);
      let text = '';
      try {
        const { PDFParse } = require('pdf-parse');
        const parsed = await new PDFParse({ data: buf }).getText();
        text = parsed.text || '';
      } catch (e) {
        return res.status(422).json({ error: 'Could not read text from this PDF (it may be a scanned image). ' + e.message });
      }
      if (!text.trim()) {
        return res.status(422).json({ error: 'No readable text found in this PDF (scanned/image-only PDFs need OCR).' });
      }
      const { extractBlFields } = await import('./candlBl.mjs');
      let settings = {};
      if (typeof opts.getSettings === 'function') {
        try { settings = (await opts.getSettings()) || {}; } catch (e) { settings = {}; }
      }
      const result = await extractBlFields(text, settings);
      res.json({ ok: true, source: result.source, fields: result.fields, raw_preview: text.slice(0, 2000) });
    } catch (e) {
      res.status(500).json({ error: 'BL extraction failed: ' + e.message });
    } finally {
      unlinkQuiet(filePath);
    }
  });

  console.log('[CANDL] 🚢 Containers & Lots file service registered at ' + PREFIX);

  startDriveWatchdog();
}

// ── Drive watchdog ─────────────────────────────────────────────────────────
// A Google refresh token does NOT expire on a schedule once the OAuth app is published, but it
// can still be revoked (user removes access, password change) or expire every 7 days while the
// Google Cloud consent screen is still in "Testing". If that happens, uploads start returning
// 503 — correct, but silent. This checks every few hours and messages the boss on WhatsApp so
// it is fixed before the next photo needs uploading.
let watchdogStarted = false;
function startDriveWatchdog() {
  if (watchdogStarted) return;
  watchdogStarted = true;
  const CHECK_MS = 3 * 60 * 60 * 1000;   // every 3 hours
  const ALERT_EVERY_MS = 12 * 60 * 60 * 1000;
  const bossNumber = String(process.env.BOSS_PHONE || process.env.OWNER_PHONE_NUMBER || '').replace(/\D/g, '');
  let lastAlertAt = 0;
  let lastState = null;

  const tick = async () => {
    try {
      const conn = await gdrive.checkConnection();
      if (conn.connected) {
        if (lastState === false) console.log('[CANDL] ✅ Google Drive reconnected');
        lastState = true;
        return;
      }
      lastState = false;
      console.warn('[CANDL] ⛔ Google Drive is NOT connected: ' + (conn.reason || 'unknown'));
      if (!bossNumber || Date.now() - lastAlertAt < ALERT_EVERY_MS) return;
      lastAlertAt = Date.now();
      const authUrl = gdrive.getAuthUrl();
      try {
        const wa = await import('./waWebClient.js');
        await wa.sendWaWebMessage(bossNumber,
          '⛔ *Google Drive disconnected*\n\nPhoto/PDF uploads from the Containers & Lots app will fail until it is re-authorised.\n\n'
          + (conn.reason ? conn.reason + '\n\n' : '')
          + (authUrl ? 'Open this link and press Allow:\n' + authUrl : 'Open the app and press the re-authorise button.'));
        console.log('[CANDL] drive reminder sent to the boss on WhatsApp');
      } catch (e) {
        console.warn('[CANDL] could not send the Drive reminder: ' + (e.message || e).slice(0, 120));
      }
    } catch (e) {
      console.warn('[CANDL] drive watchdog error:', (e.message || e).slice(0, 120));
    }
  };

  setTimeout(tick, 60 * 1000);           // first check a minute after boot
  const timer = setInterval(tick, CHECK_MS);
  if (typeof timer.unref === 'function') timer.unref();
}
