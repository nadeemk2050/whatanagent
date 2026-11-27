// Temporary: boot the built market on adapter-node and verify the SSR output.
import { spawn } from 'node:child_process';

const PORT = 4177;
const BASE = 'http://127.0.0.1:' + PORT;
const child = spawn(process.execPath, ['build/index.js'], {
	env: { ...process.env, PORT: String(PORT), ORIGIN: BASE },
	stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let up = false;
for (let i = 0; i < 40; i++) {
	try {
		const r = await fetch(BASE + '/');
		if (r.ok) { up = true; break; }
	} catch { /* not ready */ }
	await sleep(250);
}
if (!up) { console.error('server did not start\n' + log.slice(-800)); child.kill(); process.exit(1); }

let fails = 0;
const check = (name, cond, extra = '') => {
	console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
	if (!cond) fails++;
};

async function page(path) {
	const r = await fetch(BASE + path, { redirect: 'manual' });
	return { status: r.status, body: await r.text(), type: r.headers.get('content-type') || '' };
}

const home = await page('/');
check('home 200', home.status === 200, String(home.status));
check('home h1', /<h1[^>]*>[^<]*scrap that is actually available/i.test(home.body));
check('home canonical', /rel="canonical" href="https:\/\/market\.arabianpolyplast\.com\/"/.test(home.body));
check('home JSON-LD ItemList', home.body.includes('"ItemList"') && home.body.includes('"CollectionPage"'));
check('home has no price number', !/\d{2,}\s*OMR/.test(home.body));
check('home listing link', home.body.includes('/listing/baled-clear-pet-bottles-barka'));

const mat = await page('/materials/pet-bottle-scrap');
check('material 200', mat.status === 200, String(mat.status));
check('material ItemList', mat.body.includes('"ItemList"'));
check('material breadcrumb', mat.body.includes('"BreadcrumbList"'));

const list = await page('/listing/baled-clear-pet-bottles-barka');
check('listing 200', list.status === 200, String(list.status));
check('listing Product schema', list.body.includes('"@type":"Product"'));
check('listing used condition', list.body.includes('"itemCondition":"https://schema.org/UsedCondition"'));
check('listing quantity property', list.body.includes('"Quantity"'));
check('listing whatsapp cta', /wa\.me\/96895174888/.test(list.body));
check('listing no fake price', !/"price"\s*:/.test(list.body));

const wanted = await page('/listing/wanted-washed-pet-flakes');
check('wanted listing 200', wanted.status === 200);
check('wanted chip', /Wanted/.test(wanted.body));

const search = await page('/search?q=pet');
check('search 200', search.status === 200);
check('search noindex', /name="robots" content="noindex/.test(search.body));
check('search found pet', /result/i.test(search.body));

const sm = await page('/sitemap.xml');
check('sitemap 200', sm.status === 200);
check('sitemap is xml', /<urlset/.test(sm.body));
const locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check('sitemap has listing urls', locs.some((u) => u.includes('/listing/')), locs.join(','));
check('sitemap has no /search', !locs.some((u) => u.includes('/search')));

const robots = await page('/robots.txt');
check('robots 200', robots.status === 200);
check('robots allows GPTBot', /User-agent: GPTBot/.test(robots.body));
check('robots sitemap line', /Sitemap: https:\/\/market\.arabianpolyplast\.com\/sitemap\.xml/.test(robots.body));

const llms = await page('/llms.txt');
check('llms 200', llms.status === 200);
check('llms lists materials', /PET Bottle Scrap: https/.test(llms.body));

const nf = await page('/listing/does-not-exist');
check('missing listing 404', nf.status === 404, String(nf.status));
const emptyMat = await page('/materials/aluminium-scrap');
check('material without listings 404', emptyMat.status === 404, String(emptyMat.status));

child.kill();
console.log(fails ? '\n' + fails + ' check(s) failed' : '\nall checks passed');
process.exit(fails ? 1 : 0);
