import { allLive, canonical, liveMaterials } from '#lib/market';

export function GET() {
	const today = new Date().toISOString().slice(0, 10);
	const entries: { loc: string; lastmod: string; priority: string }[] = [
		{ loc: canonical('/'), lastmod: today, priority: '1.0' },
		{ loc: canonical('/materials'), lastmod: today, priority: '0.8' }
	];
	for (const block of liveMaterials()) {
		const newest = block.listings.reduce((a, b) => (a.publishedAt > b.publishedAt ? a : b));
		entries.push({
			loc: canonical('/materials/' + block.material.slug),
			lastmod: newest.publishedAt,
			priority: '0.9'
		});
	}
	for (const l of allLive()) {
		entries.push({ loc: canonical('/listing/' + l.slug), lastmod: l.publishedAt, priority: '0.8' });
	}
	const body =
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
		entries
			.map(
				(e) =>
					`  <url><loc>${e.loc}</loc><lastmod>${e.lastmod}</lastmod><priority>${e.priority}</priority></url>`
			)
			.join('\n') +
		'\n</urlset>\n';
	return new Response(body, {
		headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'max-age=600' }
	});
}
