// ============================================================================
// ☁️ GDrive Service Centre — Google Drive wrapper
// ============================================================================
// One OAuth2 client per account, created from the stored (encrypted) refresh
// token. googleapis refreshes access tokens by itself; we only hand it the
// refresh token plus the client id/secret.
//
// Every helper takes an account row from gdriveService/db.mjs.
// ============================================================================
import fs from 'fs';
import { createRequire } from 'module';
import { decryptSecret } from './crypto.mjs';

const require = createRequire(import.meta.url);
const { google } = require('googleapis');

const TIMEOUT_MS = 120000;
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// accountId -> { drive, key } — rebuilt when the stored credentials change.
const cache = new Map();

function credentialsOf(account) {
  return {
    clientId: String(account.client_id || '').trim(),
    clientSecret: decryptSecret(account.client_secret),
    refreshToken: decryptSecret(account.refresh_token)
  };
}

function credentialsFingerprint(c) {
  return String(c.clientId) + '|' + String(c.clientSecret).slice(0, 12) + '|' + String(c.refreshToken).slice(-10);
}

export function invalidateDrive(accountId) {
  cache.delete(Number(accountId));
}

/** A configured Drive v3 client for this account. Throws when the account is incomplete. */
export function driveFor(account) {
  if (!account) throw new Error('Unknown Google Drive account');
  const creds = credentialsOf(account);
  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    throw new Error('This account is missing its client id, client secret or refresh token');
  }

  const fp = credentialsFingerprint(creds);
  const hit = cache.get(Number(account.id));
  if (hit && hit.key === fp) return hit.drive;

  const auth = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  auth.setCredentials({ refresh_token: creds.refreshToken });
  auth.on('tokens', (tokens) => {
    if (tokens && tokens.refresh_token) {
      // Google rarely rotates it, but when it does the new one must be kept.
      Promise.all([import('./db.mjs'), import('./crypto.mjs')])
        .then(([dbMod, cryptoMod]) => {
          dbMod.updateAccount(account.id, { refresh_token: cryptoMod.encryptSecret(tokens.refresh_token) });
          console.log('[GDRIVE] 🔁 stored a rotated refresh token for account ' + account.id);
        })
        .catch((e) => console.warn('[GDRIVE] could not store the rotated token:', e && e.message));
    }
  });

  const drive = google.drive({ version: 'v3', auth });
  cache.set(Number(account.id), { drive, key: fp });
  return drive;
}

const q = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/**
 * Verify credentials BEFORE they are saved.
 * Returns { ok, email, quota: { used, total } } or throws with Google's message.
 */
export async function testCredentials(creds) {
  const clientId = String(creds.client_id || '').trim();
  const clientSecret = String(creds.client_secret || '').trim();
  const refreshToken = String(creds.refresh_token || '').trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Client ID, client secret and refresh token are all required');
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: 'v3', auth });

  const about = await drive.about.get({ fields: 'user(emailAddress,displayName),storageQuota(limit,usage)' }, { timeout: TIMEOUT_MS });
  const user = (about.data && about.data.user) || {};
  const quota = (about.data && about.data.storageQuota) || {};
  return {
    ok: true,
    email: user.emailAddress || '',
    display_name: user.displayName || '',
    quota: {
      used: Number(quota.usage) || 0,
      total: Number(quota.limit) || 0
    }
  };
}

/** Live quota for a saved account. */
export async function getQuota(account) {
  const drive = driveFor(account);
  const about = await drive.about.get({ fields: 'storageQuota(limit,usage)' }, { timeout: 30000 });
  const quota = (about.data && about.data.storageQuota) || {};
  return { used: Number(quota.usage) || 0, total: Number(quota.limit) || 0 };
}

/** Find (or create) a folder by name under a parent. Returns the folder id. */
export async function ensureFolder(account, name, parentId) {
  const drive = driveFor(account);
  const parent = String(parentId || '').trim();
  const clean = String(name || 'Folder').slice(0, 120);

  const parts = [`name = '${q(clean)}'`, `mimeType = '${FOLDER_MIME}'`, 'trashed = false'];
  if (parent) parts.push(`'${q(parent)}' in parents`);

  const found = await drive.files.list({
    q: parts.join(' and '),
    fields: 'files(id,name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  }, { timeout: TIMEOUT_MS });

  const hit = found.data && found.data.files && found.data.files[0];
  if (hit && hit.id) return hit.id;

  const created = await drive.files.create({
    requestBody: {
      name: clean,
      mimeType: FOLDER_MIME,
      parents: parent ? [parent] : undefined
    },
    fields: 'id',
    supportsAllDrives: true
  }, { timeout: TIMEOUT_MS });

  return created.data.id;
}

/** The folder a client app writes into: <root>/<Client App Name>. */
export async function ensureClientFolder(account, clientName) {
  const drive = driveFor(account);
  const root = String(account.root_folder_id || '').trim();

  if (!root) return ensureFolder(account, clientName, '');

  // Make sure the configured root still exists before creating children in it.
  try {
    await drive.files.get({ fileId: root, fields: 'id,trashed', supportsAllDrives: true }, { timeout: 30000 });
  } catch (e) {
    throw new Error('The configured root folder id is not accessible to this Google account: ' + String(e.message || e).slice(0, 120));
  }
  return ensureFolder(account, clientName, root);
}

/** Upload a local file. Returns { id, size, md5Checksum, webViewLink }. */
export async function uploadLocalFile(account, absPath, name, mime, parentId) {
  const drive = driveFor(account);
  const res = await drive.files.create({
    requestBody: {
      name: name,
      mimeType: mime || 'application/octet-stream',
      parents: parentId ? [parentId] : undefined
    },
    media: {
      mimeType: mime || 'application/octet-stream',
      body: fs.createReadStream(absPath)
    },
    fields: 'id,name,size,md5Checksum,webViewLink',
    supportsAllDrives: true
  }, { timeout: TIMEOUT_MS });

  return res.data || {};
}

/** Live check that a file still exists (used before deleting the local copy). */
export async function getRemoteFile(account, fileId) {
  const drive = driveFor(account);
  const res = await drive.files.get({
    fileId: fileId,
    fields: 'id,name,size,md5Checksum,trashed,webViewLink',
    supportsAllDrives: true
  }, { timeout: 30000 });
  return res.data || {};
}

/** Stream a file's bytes from Google. */
export async function downloadRemote(account, fileId) {
  const drive = driveFor(account);
  const res = await drive.files.get({
    fileId: fileId,
    alt: 'media',
    supportsAllDrives: true
  }, { responseType: 'stream', timeout: TIMEOUT_MS });
  return res.data;
}

export async function deleteRemote(account, fileId) {
  const drive = driveFor(account);
  await drive.files.delete({ fileId: fileId, supportsAllDrives: true }, { timeout: 30000 });
  return true;
}

/**
 * What is actually inside one folder: how many files, and how many bytes.
 * Used by the "apps in this drive" panel, so the numbers match what the owner
 * sees in Drive — including files added there by hand, not only ours.
 *
 * Counts nested subfolders too (a VAT app keeps one folder per branch), and can
 * skip folders that belong to another app so a drive-wide tracker does not
 * count its neighbours twice.
 */
export async function folderUsage(account, folderId, opts) {
  const drive = driveFor(account);
  const rootId = String(folderId || '').trim();
  if (!rootId) throw new Error('No Drive folder is linked to this app yet');

  const options = opts || {};
  const maxEntries = Math.max(1, Math.min(Number(options.maxEntries) || 5000, 50000));
  const maxFolders = Math.max(1, Math.min(Number(options.maxFolders) || 80, 500));
  const exclude = new Set((options.exclude || []).map((v) => String(v || '').trim()).filter(Boolean));
  exclude.delete(rootId);

  let files = 0;
  let bytes = 0;
  let folders = 0;
  let scanned = 0;
  let foldersSeen = 0;

  const queue = [rootId];
  const visited = new Set(queue);

  while (queue.length && scanned < maxEntries && foldersSeen < maxFolders) {
    const current = queue.shift();
    foldersSeen += 1;
    let pageToken = '';

    do {
      const res = await drive.files.list({
        q: `'${q(current)}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,size,mimeType)',
        pageSize: 1000,
        pageToken: pageToken || undefined,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      }, { timeout: TIMEOUT_MS });

      const items = (res.data && res.data.files) || [];
      for (const f of items) {
        scanned += 1;
        if (f.mimeType === FOLDER_MIME) {
          if (!exclude.has(f.id)) {
            folders += 1;
            if (!visited.has(f.id)) { visited.add(f.id); queue.push(f.id); }
          }
        } else {
          files += 1;
          bytes += Number(f.size) || 0;
        }
        if (scanned >= maxEntries) break;
      }
      pageToken = (res.data && res.data.nextPageToken) || '';
    } while (pageToken && scanned < maxEntries);
  }

  return { files, bytes, folders, truncated: scanned >= maxEntries || queue.length > 0 };
}

/** Name and id of an existing folder, checked against the live Drive. */
export async function folderInfo(account, folderId) {
  const drive = driveFor(account);
  const res = await drive.files.get({
    fileId: String(folderId || '').trim(),
    fields: 'id,name,mimeType,trashed',
    supportsAllDrives: true
  }, { timeout: 30000 });
  const f = res.data || {};
  if (!f.id || f.trashed) throw new Error('That Drive folder is missing or trashed');
  if (f.mimeType !== FOLDER_MIME) throw new Error('That Drive id is a file, not a folder');
  return { id: f.id, name: f.name || 'Folder' };
}
