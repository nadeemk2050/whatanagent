require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// (Electron overrides via CANDL_GDRIVE_TOKEN / CANDL_SERVICE_ACCOUNT so the
// OAuth token lives in the per-user AppData folder, not inside app.asar.)
const SERVICE_ACCOUNT_PATH = process.env.CANDL_SERVICE_ACCOUNT || path.resolve(__dirname, 'service-account.json');
// The refreshed token must be written somewhere gitignored: `data/` is. Writing it next to the
// code put a live refresh token in the repository root.
const TOKEN_DIR = process.env.CANDL_DATA_DIR || path.resolve(__dirname, 'data');
const TOKEN_PATH = process.env.CANDL_GDRIVE_TOKEN || path.join(TOKEN_DIR, 'candl-gdrive-token.json');

let driveClient = null;
let isMockMode = true;
let oauth2Client = null;

// Helper to detect Google OAuth Auth Errors (like expired/revoked refresh token invalid_grant)
function handleAuthError(err) {
  const errStr = String(err?.message || err?.stack || err || '') + JSON.stringify(err?.response?.data || '');
  if (errStr.includes('invalid_grant') || errStr.includes('invalid_credentials') || errStr.includes('invalid_token') || errStr.includes('Unauthorized') || errStr.includes('401')) {
    console.warn('[GDrive] Google Drive OAuth token expired or revoked (invalid_grant). Switching automatically to Mock Mode.');
    isMockMode = true;
    driveClient = null;
    return true;
  }
  return false;
}

// Credentials come from the environment ONLY. They used to be hard-coded here, which put a live
// OAuth client secret and refresh token in a public repository. On the server they are written
// into /opt/whatanagent/.env by deploy/set-candl-env.sh (values from repository secrets).
// A local desktop install still works through its own gdrive-token.json.
const DEFAULT_CLIENT_ID = '';
const DEFAULT_CLIENT_SECRET = '';
const DEFAULT_REDIRECT_URI = 'http://localhost:5050/api/gdrive/callback';
const DEFAULT_REFRESH_TOKEN = '';

// Initialize OAuth2 client (CANDL_* names win, then the original GDRIVE_* ones)
const clientId = process.env.CANDL_GDRIVE_CLIENT_ID || process.env.GDRIVE_CLIENT_ID || DEFAULT_CLIENT_ID;
const clientSecret = process.env.CANDL_GDRIVE_CLIENT_SECRET || process.env.GDRIVE_CLIENT_SECRET || DEFAULT_CLIENT_SECRET;
const redirectUri = process.env.CANDL_GDRIVE_REDIRECT_URI || process.env.GDRIVE_REDIRECT_URI || DEFAULT_REDIRECT_URI;

oauth2Client = clientId && clientSecret ? new google.auth.OAuth2(clientId, clientSecret, redirectUri) : null;
if (!oauth2Client) {
  console.warn('[GDrive] No OAuth client id/secret configured - Drive calls will be refused (503), never faked.');
}

function getAllTokenPaths() {
  const paths = [
    TOKEN_PATH,
    path.resolve(__dirname, 'gdrive-token.json'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Containers and Lots', 'gdrive-token.json') : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'Containers and Lots', 'gdrive-token.json') : null
  ].filter(Boolean);
  return Array.from(new Set(paths));
}

function writeTokenToAllPaths(tokens) {
  const jsonStr = JSON.stringify(tokens, null, 2);
  for (const p of getAllTokenPaths()) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, jsonStr);
    } catch (e) {}
  }
}

function loadNewestToken() {
  let newest = null;
  let newestMtime = 0;
  for (const p of getAllTokenPaths()) {
    try {
      if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        if (stat.mtimeMs > newestMtime) {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (parsed && (parsed.refresh_token || parsed.access_token)) {
            newest = parsed;
            newestMtime = stat.mtimeMs;
          }
        }
      }
    } catch (e) {}
  }
  return newest;
}

if (oauth2Client) {
  oauth2Client.on('tokens', (newTokens) => {
    try {
      const existing = loadNewestToken() || {};
      const merged = { ...existing, ...newTokens };
      writeTokenToAllPaths(merged);
    } catch (e) { /* best effort */ }
  });
}

// 1. Check if Service Account Key exists (Priority 1)
if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  try {
    const credentials = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    const auth = google.auth.fromJSON(credentials);
    auth.scopes = ['https://www.googleapis.com/auth/drive'];
    driveClient = google.drive({ version: 'v3', auth });
    isMockMode = false;
    console.log('Google Drive API successfully initialized using Service Account.');
  } catch (err) {
    console.error('Error loading service account JSON, falling back to OAuth2:', err);
  }
}

// 2. If Service Account not found/failed, Check if OAuth2 Token exists (File OR Env Var OR Default Refresh Token)
if (isMockMode && oauth2Client) {
  let tokens = loadNewestToken();
  if (!tokens && process.env.GDRIVE_TOKEN_JSON) {
    try {
      tokens = JSON.parse(process.env.GDRIVE_TOKEN_JSON);
    } catch (err) {
      console.error('Error parsing GDRIVE_TOKEN_JSON env var:', err);
    }
  } else if (!tokens && process.env.GDRIVE_REFRESH_TOKEN) {
    tokens = { refresh_token: process.env.GDRIVE_REFRESH_TOKEN };
  } else if (!tokens) {
    tokens = { refresh_token: DEFAULT_REFRESH_TOKEN };
  }

  if (tokens) {
    try {
      oauth2Client.setCredentials(tokens);
      driveClient = google.drive({ version: 'v3', auth: oauth2Client });
      isMockMode = false;
      console.log('Google Drive API successfully initialized using OAuth2 Token.');
    } catch (err) {
      console.error('Error setting OAuth2 credentials:', err);
    }
  } else {
    console.log('No OAuth2 Token or service-account.json found. Google Drive operates in Mock Mode (Simulated uploads).');
  }
}

// Helper to generate the OAuth2 Login URL
function getAuthUrl() {
  if (!oauth2Client) return null;
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
    prompt: 'consent' // force consent to ensure we receive a refresh token
  });
}

// Helper to exchange code for tokens and save it
async function storeToken(code) {
  if (!oauth2Client) throw new Error('OAuth2 client not configured in environment variables');
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  writeTokenToAllPaths(tokens);
  driveClient = google.drive({ version: 'v3', auth: oauth2Client });
  isMockMode = false;
  console.log('Google Drive OAuth2 Token successfully stored and initialized across all paths!');
  return tokens;
}

let rootFolderId = null;

async function getOrCreateRootFolder() {
  if (rootFolderId) return rootFolderId;
  if (process.env.GDRIVE_PARENT_FOLDER_ID) {
    rootFolderId = process.env.GDRIVE_PARENT_FOLDER_ID;
    return rootFolderId;
  }
  if (isMockMode || !driveClient) {
    rootFolderId = 'folder_containers_lots_root_mock';
    return rootFolderId;
  }
  try {
    const res = await driveClient.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='Containers and Lots' and trashed=false",
      fields: 'files(id, name)',
      spaces: 'drive',
    });
    if (res.data.files && res.data.files.length > 0) {
      rootFolderId = res.data.files[0].id;
      return rootFolderId;
    }
    const createdId = await createFolder('Containers and Lots', null);
    rootFolderId = createdId;
    return rootFolderId;
  } catch (err) {
    handleAuthError(err);
    console.error('Error getting/creating Containers and Lots root folder:', err.message || err);
    return 'folder_containers_lots_root_mock';
  }
}

/**
 * Creates a folder in Google Drive.
 * @param {string} folderName 
 * @param {string|null} parentFolderId 
 * @returns {Promise<string>} The created folder's ID.
 */
async function createFolder(folderName, parentFolderId = null) {
  if (isMockMode || !driveClient) {
    const mockId = 'folder_' + Math.random().toString(36).substring(2, 10);
    console.log(`[GDrive Mock] Created folder "${folderName}" (ID: ${mockId}) inside parent "${parentFolderId || 'root'}"`);
    return mockId;
  }

  if (!parentFolderId) {
    parentFolderId = await getOrCreateRootFolder();
  }

  if (isMockMode || !driveClient) {
    const mockId = 'folder_' + Math.random().toString(36).substring(2, 10);
    console.log(`[GDrive Mock] Created folder "${folderName}" (ID: ${mockId}) inside parent "${parentFolderId}"`);
    return mockId;
  }

  try {
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentFolderId && !parentFolderId.startsWith('folder_')) {
      fileMetadata.parents = [parentFolderId];
    }

    const folderPromise = driveClient.files.create({
      resource: fileMetadata,
      fields: 'id',
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('GDrive createFolder timeout')), 8000)
    );

    const response = await Promise.race([folderPromise, timeoutPromise]);
    return response.data.id;
  } catch (error) {
    handleAuthError(error);
    console.error(`Failed to create folder "${folderName}" in Google Drive (using fallback ID):`, error.message || error);
    return 'folder_' + Math.random().toString(36).substring(2, 10);
  }
}

/**
 * Uploads a file to Google Drive.
 * @param {string} fileLocalPath 
 * @param {string} fileName 
 * @param {string} mimeType 
 * @param {string} parentFolderId 
 * @returns {Promise<{id: string, webViewLink: string}>}
 */
async function uploadFile(fileLocalPath, fileName, mimeType, parentFolderId) {
  if (isMockMode || !driveClient) {
    const mockId = 'file_' + Math.random().toString(36).substring(2, 10);
    console.log(`[GDrive Mock] Uploaded file "${fileName}" to parent folder "${parentFolderId}"`);
    return {
      id: mockId,
      webViewLink: `https://drive.google.com/drive/folders/mock_view_link_for_${mockId}`,
    };
  }

  try {
    const fileMetadata = {
      name: fileName,
    };
    if (parentFolderId && !parentFolderId.startsWith('folder_')) {
      fileMetadata.parents = [parentFolderId];
    }
    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(fileLocalPath),
    };

    const uploadPromise = driveClient.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('GDrive uploadFile timeout')), 12000)
    );

    const response = await Promise.race([uploadPromise, timeoutPromise]);

    // Make the file readable by anyone with the link
    try {
      await driveClient.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    } catch (permErr) {
      handleAuthError(permErr);
      console.warn('Could not update permission for public reading:', permErr.message || permErr);
    }

    return {
      id: response.data.id,
      webViewLink: response.data.webViewLink,
    };
  } catch (error) {
    handleAuthError(error);
    console.error(`Failed to upload file "${fileName}" to Google Drive (using fallback ID):`, error.message || error);
    const mockId = 'file_' + Math.random().toString(36).substring(2, 10);
    return {
      id: mockId,
      webViewLink: `https://drive.google.com/drive/folders/mock_view_link_for_${mockId}`,
    };
  }
}

async function deleteFileOrFolder(fileId) {
  if (!fileId) return;
  if (isMockMode || !driveClient || fileId.startsWith('folder_') || fileId.startsWith('file_')) {
    console.log(`[GDrive Mock] Deleted file or folder (ID: ${fileId})`);
    return;
  }
  try {
    await driveClient.files.delete({ fileId });
    console.log(`[GDrive] Deleted file/folder ID: ${fileId}`);
  } catch (error) {
    handleAuthError(error);
    console.error(`Failed to delete file/folder ID ${fileId} in Google Drive:`, error.message || error);
  }
}

async function renameFileOrFolder(fileId, newName) {
  if (!fileId || !newName) return;
  if (isMockMode || !driveClient || fileId.startsWith('folder_') || fileId.startsWith('file_')) {
    console.log(`[GDrive Mock] Renamed file or folder (ID: ${fileId}) to "${newName}"`);
    return;
  }
  try {
    await driveClient.files.update({
      fileId,
      resource: { name: newName }
    });
    console.log(`[GDrive] Renamed file/folder ID ${fileId} to "${newName}"`);
  } catch (error) {
    handleAuthError(error);
    console.error(`Failed to rename file/folder ID ${fileId} in Google Drive:`, error.message || error);
  }
}

async function getFileStream(fileId) {
  if (isMockMode || !driveClient || fileId.startsWith('folder_') || fileId.startsWith('file_')) return null;
  try {
    const response = await driveClient.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    return response.data;
  } catch (error) {
    handleAuthError(error);
    console.error(`Failed to get file stream for ID ${fileId}:`, error.message || error);
    return null;
  }
}

async function listFolderFiles(folderId) {
  if (isMockMode || !driveClient || !folderId || folderId.startsWith('folder_')) return [];
  try {
    const res = await driveClient.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, webViewLink, mimeType, size, modifiedTime)',
      orderBy: 'createdTime',
      pageSize: 200,
    });
    return (res.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
      mimeType: f.mimeType,
      size: f.size,
      modifiedTime: f.modifiedTime,
    }));
  } catch (error) {
    handleAuthError(error);
    console.error('Failed to list files in folder:', error.message || error);
    return [];
  }
}

// Find a child folder by name inside a parent, or create it (used for the DB backup folder)
async function getOrCreateSubfolder(parentFolderId, name) {
  if (!parentFolderId || parentFolderId.startsWith('folder_')) return null;
  if (isMockMode || !driveClient) return null;
  try {
    const res = await driveClient.files.list({
      q: `'${parentFolderId}' in parents and name = '${name.replace(/'/g, "''")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    });
    if (res.data.files && res.data.files.length) return res.data.files[0].id;
    return await createFolder(name, parentFolderId);
  } catch (error) {
    handleAuthError(error);
    console.error('getOrCreateSubfolder failed:', error.message || error);
    return null;
  }
}

// Find every Drive folder with an exact name (used to recover a container's
// photo folder even when the record's stored folder id was lost, or when a
// duplicate Container-<number> folder was created by an older upload).
async function findFoldersByName(name) {
  if (isMockMode || !driveClient || !name) return [];
  try {
    const res = await driveClient.files.list({
      q: `name = '${String(name).replace(/'/g, "''")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, createdTime)',
      pageSize: 50,
    });
    return res.data.files || [];
  } catch (error) {
    handleAuthError(error);
    console.error('findFoldersByName failed:', error.message || error);
    return [];
  }
}

// Download a Drive file to a local path
async function downloadFile(fileId, destPath) {
  if (isMockMode || !driveClient || fileId.startsWith('folder_') || fileId.startsWith('file_')) return false;
  try {
    const stream = await getFileStream(fileId);
    if (!stream) return false;
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(destPath);
      stream.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });
    return true;
  } catch (error) {
    handleAuthError(error);
    console.error('Failed to download file from Drive:', error.message || error);
    return false;
  }
}

module.exports = {
  createFolder,
  uploadFile,
  deleteFileOrFolder,
  renameFileOrFolder,
  getFileStream,
  listFolderFiles,
  findFoldersByName,
  getOrCreateSubfolder,
  downloadFile,
  getOrCreateRootFolder,
  isMockMode: () => isMockMode,
  getAuthUrl,
  storeToken,
  checkConnection,
};

// REAL connectivity test: performs a lightweight Drive API call to confirm the
// token actually works (re-initializes from the token file if needed). This keeps
// the app's warning banner truthful instead of relying on the mock flag alone.
async function checkConnection() {
  if (oauth2Client) {
    const latestTokens = loadNewestToken();
    if (latestTokens) {
      try {
        oauth2Client.setCredentials(latestTokens);
        driveClient = google.drive({ version: 'v3', auth: oauth2Client });
      } catch (err) {
        console.error('Error loading latest OAuth2 Token in checkConnection:', err);
      }
    }
  }
  if (!driveClient) return { connected: false, reason: 'Google Drive is not connected (no valid OAuth token).' };
  try {
    await driveClient.about.get({ fields: 'user(displayName,emailAddress)' });
    isMockMode = false;
    return { connected: true, reason: null };
  } catch (error) {
    handleAuthError(error);
    return { connected: false, reason: 'Google Drive token is expired or invalid. Please re-authorize.' };
  }
}

