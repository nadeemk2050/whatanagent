// ============================================================================
// ☁️ GDrive API Service Centre — module entry point
// ============================================================================
// index.js only needs:
//   import { registerGDriveService } from './gdriveService/index.mjs';
//   registerGDriveService(app, multer);
//
// Everything else lives in this folder: the database, the crypto, the Drive
// wrapper, the queue/worker/cleaner, the routes and the first-account seed.
// ============================================================================
import { registerGDriveServiceRoutes } from './routes.mjs';
import { startGDriveWorkers } from './queue.mjs';
import { seedFirstAccount } from './seed.mjs';
import { CACHE_ROOT, DB_PATH } from './db.mjs';

let started = false;

export function registerGDriveService(app, multer) {
  if (started) return;
  started = true;

  registerGDriveServiceRoutes(app, multer);
  startGDriveWorkers();

  // Seed after boot so a slow Google call never delays the listener.
  setTimeout(() => { seedFirstAccount().catch(() => {}); }, 8000);

  console.log('[GDRIVE] database ' + DB_PATH);
  console.log('[GDRIVE] VPS cache ' + CACHE_ROOT);
}

export { seedFirstAccount };
