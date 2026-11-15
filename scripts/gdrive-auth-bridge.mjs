// ============================================================================
// 🔑 Local Google Drive authorisation bridge
// ============================================================================
// WHY THIS EXISTS
// Google only accepts an OAuth redirect URI that was registered on the client.
// For the Containers & Lots client the ONLY registered value is
//   http://localhost:5050/api/gdrive/callback
// so the consent cannot be completed on the VPS host until that URI is added in
// Google Cloud. This script finishes the consent on THIS PC (where localhost:5050
// is legal), exchanges the code for a refresh token, and hands the token to the
// VPS through the guarded /candl/api/gdrive/import-token endpoint.
//
// USAGE  (one time, or once again only if the token is ever revoked)
//   node scripts/gdrive-auth-bridge.mjs
//   → open the printed URL, choose the account, press Allow
//   → the script posts the token and prints the live connection state
//
// Nothing is logged: the refresh token is never printed.
// ============================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── configuration ──────────────────────────────────────────────────────────
const PORT = Number(process.env.BRIDGE_PORT || 5050);
const CALLBACK_PATH = '/api/gdrive/callback';
const REDIRECT_URI = `http://localhost:${PORT}${CALLBACK_PATH}`;
const SCOPE = 'https://www.googleapis.com/auth/drive';
const VPS_IMPORT = process.env.VPS_IMPORT_URL || 'https://whatanagent.duckdns.org/candl/api/gdrive/import-token';

function readEnv(file) {
  try {
    const out = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return out;
  } catch (e) { return {}; }
}

const envFile = readEnv(path.join(ROOT, '.env'));
const CLIENT_ID = process.env.GDRIVE_CLIENT_ID || envFile.GDRIVE_CLIENT_ID || envFile.CANDL_GDRIVE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET || envFile.GDRIVE_CLIENT_SECRET || envFile.CANDL_GDRIVE_CLIENT_SECRET || '';
const IMPORT_KEY = process.env.CANDL_IMPORT_KEY || process.env.IMPORT_KEY || '';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n✖ Client id/secret not found. Set GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET in .env\n');
  process.exit(1);
}

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?'
  + new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true'
  }).toString();

let finished = false;

async function exchange(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error('token exchange failed: ' + text.slice(0, 300));
  return JSON.parse(text);
}

async function pushToVps(refreshToken) {
  if (!IMPORT_KEY) {
    return { ok: false, error: 'no CANDL_IMPORT_KEY in the environment — set it, or copy the value manually' };
  }
  const res = await fetch(VPS_IMPORT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-import-key': IMPORT_KEY },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { body = { raw: text.slice(0, 200) }; }
  return { ok: res.ok && body && body.ok, status: res.status, body };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Friendly landing page so the owner only has to remember http://localhost:5050
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Authorise Google Drive</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#0b1220;color:#e2e8f0;display:flex;
min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.c{background:#111b2b;border:1px solid #1f2c40;border-radius:16px;padding:30px;max-width:560px;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{color:#94a3b8;font-size:14px;line-height:1.6}
a.b{display:inline-block;margin-top:18px;background:#0d9488;color:#04241f;font-weight:800;padding:14px 26px;
border-radius:12px;text-decoration:none;font-size:16px}
small{display:block;margin-top:16px;color:#64748b;font-size:12px}</style></head><body><div class="c">
<h1>Authorise Google Drive</h1>
<p>Sign in as <b>nadeemalsaham@gmail.com</b> and press <b>Allow</b>. If Google warns that the app is
unverified, choose <b>Advanced &rarr; Go to … (unsafe)</b> — that is expected for your own app.</p>
<a class="b" href="${authUrl}">Authorise Google Drive now</a>
<small>This helper closes itself once the token is sent to your server.</small>
</div></body></html>`);
  }

  if (url.pathname !== CALLBACK_PATH) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (err) {
    finished = true;
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h2 style="font-family:sans-serif;color:#b91c1c">Authorisation cancelled</h2><p>${err}</p>`);
    console.error('\n✖ Google returned: ' + err);
    setTimeout(() => server.close(() => process.exit(1)), 800);
    return;
  }
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Missing code');
  }

  try {
    console.log('\n→ exchanging the code for a refresh token…');
    const tokens = await exchange(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error('Google did not return a refresh_token (remove the app from your Google account and retry)');

    console.log('→ handing the token to the VPS…');
    const pushed = await pushToVps(refreshToken);

    if (!pushed.ok) {
      // Never print the token to the console; write it to a gitignored file instead.
      const outFile = path.join(ROOT, 'data', 'gdrive-token-bridge.json');
      try {
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, JSON.stringify({ refresh_token: refreshToken }, null, 2), { mode: 0o600 });
        console.log('⚠ Could not push automatically (' + (pushed.error || pushed.status) + ').');
        console.log('  The token was saved to ' + outFile + ' (gitignored).');
      } catch (e) { /* ignore */ }
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<div style="font-family:sans-serif;text-align:center;padding:3rem">
      <h2 style="color:${pushed.ok ? '#059669' : '#b45309'}">${pushed.ok ? 'Google Drive connected' : 'Authorised on this PC'}</h2>
      <p style="color:#475569">${pushed.ok ? 'The always-on server is now connected to Google Drive. You may close this window.' : 'The token could not be sent to the server automatically — see the console window.'}</p></div>`);

    console.log(pushed.ok ? '✅ VPS is now connected to Google Drive.' : '⚠ VPS import failed: ' + JSON.stringify(pushed.body || pushed.error));
    if (pushed.body && typeof pushed.body.connected !== 'undefined') console.log('   server reports connected =', pushed.body.connected);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Failed: ' + e.message);
    console.error('\n✖ ' + e.message);
  } finally {
    finished = true;
    setTimeout(() => server.close(() => process.exit(0)), 800);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('\n' + '='.repeat(74));
  console.log(' Google Drive authorisation — local bridge');
  console.log('='.repeat(74));
  console.log(' redirect_uri : ' + REDIRECT_URI + '   (already registered by Google)');
  console.log(' client_id    : ' + CLIENT_ID);
  console.log(' import key   : ' + (IMPORT_KEY ? 'loaded' : 'MISSING (will only save locally)'));
  console.log('\n OPEN THIS URL IN YOUR BROWSER AND PRESS ALLOW:\n');
  console.log(authUrl);
  console.log('\n Waiting for Google to redirect back…  (Ctrl+C to cancel)');
  console.log('='.repeat(74) + '\n');
});

// Do not hang forever if nobody finishes the flow (default 6 hours — the owner may be away).
const TIMEOUT_MIN = Number(process.env.BRIDGE_TIMEOUT_MIN || 360);
setTimeout(() => {
  if (!finished) {
    console.error('\n✖ Timed out after ' + TIMEOUT_MIN + ' minutes with no callback. Nothing changed.');
    server.close(() => process.exit(1));
  }
}, TIMEOUT_MIN * 60 * 1000).unref();
