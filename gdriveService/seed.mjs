// ============================================================================
// 🌱 GDrive Service Centre — first account
// ============================================================================
// The centre is useless with zero drives, and the owner already has a working
// Google connection for the Containers & Lots service. On first boot, if no
// account exists yet and those credentials are in the environment, the first
// account is created from them automatically.
//
// Nothing is copied into the repository: the credentials are read from
// process.env at run time and sealed by gdriveService/crypto.mjs.
// ============================================================================
import { listAccounts, insertAccount, updateAccount, audit } from './db.mjs';
import { encryptSecret } from './crypto.mjs';
import { getQuota } from './drive.mjs';

export const SEED_EMAIL = process.env.GDRIVE_SEED_EMAIL || 'nadeemaslaham@gmail.com';

export async function seedFirstAccount() {
  try {
    if (listAccounts().length > 0) return null;

    const clientId = String(process.env.CANDL_GDRIVE_CLIENT_ID || process.env.GDRIVE_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.CANDL_GDRIVE_CLIENT_SECRET || process.env.GDRIVE_CLIENT_SECRET || '').trim();
    const refreshToken = String(process.env.CANDL_GDRIVE_REFRESH_TOKEN || process.env.GDRIVE_REFRESH_TOKEN || '').trim();
    if (!clientId || !clientSecret || !refreshToken) {
      console.log('[GDRIVE] no account yet, and no Drive credentials in the environment to seed one from');
      return null;
    }

    const account = insertAccount({
      alias: process.env.GDRIVE_SEED_ALIAS || 'Nadeem — Containers & Lots',
      email: SEED_EMAIL,
      client_id: clientId,
      client_secret: encryptSecret(clientSecret),
      refresh_token: encryptSecret(refreshToken),
      root_folder_id: String(process.env.CANDL_GDRIVE_PARENT_FOLDER_ID || process.env.GDRIVE_PARENT_FOLDER_ID || '').trim(),
      retention_hours: Number(process.env.GDRIVE_RETENTION_HOURS) || 24,
      quota_alert_gb: 0,
      status: 'active'
    });

    audit({ drive_id: account.id, action: 'account.seeded', detail: 'from environment credentials' });
    console.log('[GDRIVE] 🌱 created the first account from environment credentials: ' + account.alias + ' <' + account.email + '>');

    // Fill the quota now so the dashboard is useful immediately.
    try {
      const quota = await getQuota(account);
      updateAccount(account.id, {
        quota_used: quota.used,
        quota_total: quota.total,
        last_health: 'connected',
        last_error: '',
        last_checked_at: Date.now()
      });
      console.log('[GDRIVE] ✅ verified the seeded account (' +
        (quota.total ? Math.round((quota.used / quota.total) * 100) + '% of ' + Math.round(quota.total / 1073741824) + ' GB used' : 'quota unavailable') + ')');
    } catch (e) {
      updateAccount(account.id, {
        last_health: 'error',
        last_error: String((e && e.message) || e).slice(0, 300),
        last_checked_at: Date.now()
      });
      console.warn('[GDRIVE] ⚠️ seeded account could not be verified: ' + ((e && e.message) || e));
    }
    return account;
  } catch (e) {
    console.warn('[GDRIVE] seeding failed:', (e && e.message) || e);
    return null;
  }
}
