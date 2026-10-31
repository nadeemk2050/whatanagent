// Local dev server for the CRM (no Firebase service account needed).
// Serves the CRM page and its API on one origin, so cookies/CORS behave exactly like production:
//   http://localhost:4000/        → the CRM app
//   http://localhost:4000/api/crm → its API
// Data is kept in data/crm/ (JSON) so accounts survive a restart.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAlignCrmRoutes } from '../alignCrm.mjs';
import { listContacts as waListContacts } from '../alignWaMulti.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = Number(process.env.CRM_DEV_PORT || 4000);

const app = express();
app.use(express.json({ limit: '30mb' }));
registerAlignCrmRoutes(app, { api: '/api/crm', waListContacts });
app.use('/crm', express.static(path.join(root, 'public', 'crm')));
app.get('/', (req, res) => res.redirect('/crm/'));

app.listen(PORT, () => {
  console.log('\n  CRM dev server');
  console.log('  ➜  http://localhost:' + PORT + '/crm/');
  console.log('  ➜  API  http://localhost:' + PORT + '/api/crm');
  console.log('  ➜  data ' + path.join(root, 'data', 'crm') + '\n');
});
