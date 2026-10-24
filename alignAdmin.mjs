// ============================================================================
// 🔑 ALIGNTASKS — Firebase Admin handle (privileged access to Firestore + Auth)
// ============================================================================
// The AlignTasks board lives at
//   artifacts/<APP_ID>/public/data/**
// and the Firestore rules deliberately deny unauthenticated clients. The app's
// own auto-deploy/WhatsApp/NoteBook integrations therefore need the Admin SDK,
// which bypasses rules.
//
// The key is NEVER in the repo. It is read from:
//   FIREBASE_SERVICE_ACCOUNT_FILE  (path, default /opt/whatanagent-data/serviceAccountKey.json)
//   FIREBASE_SERVICE_ACCOUNT       (inline JSON, optional)
//
// If the key is missing the module degrades gracefully: everything else in the
// app keeps working and the AlignTasks routes return a clear 503.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export const ALIGN_APP_ID = process.env.ALIGN_APP_ID || '1:410197132578:web:97cfc3ae33f39ed3df917b';
export const ALIGN_BASE = `artifacts/${ALIGN_APP_ID}/public/data`;

const DEFAULT_KEY_FILE = process.env.FIREBASE_SERVICE_ACCOUNT_FILE
  || '/opt/whatanagent-data/serviceAccountKey.json';

let state = { ready: false, error: '', db: null, auth: null, source: '' };

function loadCredentials() {
  const inline = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (inline) {
    try { return { json: JSON.parse(inline), source: 'FIREBASE_SERVICE_ACCOUNT env' }; }
    catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON'); }
  }
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE || DEFAULT_KEY_FILE;
  if (!fs.existsSync(file)) throw new Error('service account file not found at ' + file);
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (e) { throw new Error('cannot read ' + file + ': ' + e.message); }
  let json;
  try { json = JSON.parse(raw); }
  catch (e) { throw new Error(file + ' is not valid JSON'); }
  if (!json.project_id || !json.private_key || !json.client_email) {
    throw new Error(file + ' is missing project_id / private_key / client_email');
  }
  return { json, source: file };
}

export function initAlignAdmin() {
  if (state.ready) return state;
  try {
    const { json, source } = loadCredentials();
    const name = 'align-admin';
    const existing = getApps().find(a => a.name === name);
    const app = existing || initializeApp({ credential: cert(json), projectId: json.project_id }, name);
    state = { ready: true, error: '', db: getFirestore(app), auth: getAuth(app), source };
    console.log('[ALIGN-ADMIN] 🔑 Admin SDK ready (project ' + json.project_id + ', key from ' + source + ')');
  } catch (e) {
    state = { ready: false, error: e.message, db: null, auth: null, source: '' };
    console.warn('[ALIGN-ADMIN] ⚠️ Admin SDK unavailable: ' + e.message);
    console.warn('[ALIGN-ADMIN]    AlignTasks server routes will return 503 until a service account key is configured.');
  }
  return state;
}

export function alignAdminStatus() {
  initAlignAdmin();
  return { ready: state.ready, error: state.error, source: state.source ? path.basename(state.source) : '' };
}

export function alignDb() {
  initAlignAdmin();
  if (!state.ready) {
    const err = new Error('AlignTasks storage is not configured on this server (service account key missing).');
    err.code = 'align-no-admin';
    throw err;
  }
  return state.db;
}

export function alignAuth() {
  initAlignAdmin();
  if (!state.ready) {
    const err = new Error('AlignTasks auth is not configured on this server (service account key missing).');
    err.code = 'align-no-admin';
    throw err;
  }
  return state.auth;
}

// Convenience: a board collection reference.
export function board(name) {
  return alignDb().collection(`${ALIGN_BASE}/${name}`);
}
