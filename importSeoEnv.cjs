// Imports SEO site env data from a SeoAgent/SeoWow project folder into the WhatsApp AI Agent dashboard.
// Usage: node importSeoEnv.cjs [sourceEnvPath] [siteKey] [appUrl]
//   e.g: node importSeoEnv.cjs "C:\app2026\SeoAgent\.env" www.alshaabalwaseem.com http://localhost:3000

const fs = require('fs');
const path = require('path');

const SOURCE_ENV = process.argv[2] || 'C:\\app2026\\SeoAgent\\.env';
const SITE_KEY = process.argv[3] || 'www.alshaabalwaseem.com';
const APP_URL = process.argv[4] || 'http://localhost:3000';

const SKIP_JSON = ['sites.json', 'metadata.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'hp.json', 'hp_check.json', 'page_structure_report.json', 'seo_setup_report.json'];

function parseEnv(text) {
  const out = {};
  text.split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    const hash = v.indexOf(' #');
    if (hash > -1) v = v.slice(0, hash).trim();
    out[m[1]] = v;
  });
  return out;
}

async function main() {
  const sourceDir = path.dirname(SOURCE_ENV);
  if (!fs.existsSync(SOURCE_ENV)) {
    console.error('Source .env not found:', SOURCE_ENV);
    process.exit(1);
  }
  const env = parseEnv(fs.readFileSync(SOURCE_ENV, 'utf8'));

  // Find a Google service account JSON (Search Console credentials) in the source folder
  let gscJson = '';
  let gscFile = '';
  try {
    const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json') && !SKIP_JSON.includes(f));
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(sourceDir, f), 'utf8'));
        if (j.type === 'service_account' && j.client_email) {
          gscJson = JSON.stringify(j);
          gscFile = f;
          break;
        }
      } catch (e) { /* not json / not service account */ }
    }
  } catch (e) { /* ignore */ }

  const wpBase = (env.WP_URL || ('https://' + SITE_KEY + '/')).replace(/\/+$/, '');
  const site = {
    url: env.WP_URL || ('https://' + SITE_KEY + '/'),
    cmsPlatform: 'wordpress',
    sitemapUrl: wpBase + '/sitemap_index.xml',
    cmsAdminUrl: wpBase + '/wp-admin',
    cmsUsername: env.WP_USER || env.WP_ADMIN_USER || '',
    cmsPassword: env.WP_APP_PASS || '',
    gscAccess: gscJson,
    gscPropertyUrl: env.WP_URL || '',
    aiProvider: env.GEMINI_API_KEY ? 'gemini' : 'deepseek',
    aiModel: 'gemini-2.5-flash',
    aiKey: env.GEMINI_API_KEY || '',
    serperKey: env.SERPER_API_KEY || '',
    googleCx: env.GOOGLE_CX || '',
    googleCseKey: env.GOOGLE_CSE_KEY || '',
    fbPageId: env.FB_PAGE_ID || '',
    fbPageToken: env.FB_PAGE_TOKEN || '',
    notes: 'Imported from ' + SOURCE_ENV + ' on ' + new Date().toISOString().slice(0, 10) + ' (Al Saham SEO Agent project).'
  };

  const payload = { sites: {} };
  payload.sites[SITE_KEY] = site;

  const res = await fetch(APP_URL + '/api/seo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  console.log('Save result:', res.status, await res.text());

  // Verify saved data (masked output - no secrets printed)
  const check = await fetch(APP_URL + '/api/seo');
  const saved = await check.json();
  const s = (saved.sites || {})[SITE_KEY] || {};
  const mask = v => {
    if (!v) return '(empty)';
    const str = String(v);
    return str.length > 8 ? str.slice(0, 4) + '...(' + str.length + ' chars)' : '***';
  };
  console.log('--- VERIFY (masked) ---');
  Object.keys(s).forEach(k => {
    if (k === 'updatedAt') return;
    console.log(' ' + k + ':', mask(s[k]));
  });
  console.log('Service account file found:', gscFile || 'none');
}

main().catch(e => { console.error('Import failed:', e.message); process.exit(1); });
