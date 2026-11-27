import { canonical, materials } from '#lib/market';
import { mergedLive } from '#lib/store';
import { getBindings } from '#lib/bindings.server';

export async function GET() {
	const all = await mergedLive(await getBindings());
	const today = new Date().toISOString().slice(0, 10);

	const byMaterial = new Map<string, string>();
	for (const l of all) {
		const mat = (l as any).material as string;
		const pub = (l as any).publishedAt as string;
		if (!byMaterial.has(mat) || pub > byMaterial.get(mat)!) byMaterial.set(mat, pub);
	}

	const entries: { loc: string; lastmod: string; priority: string }[] = [
		{ loc: canonical('/'), lastmod: today, priority: '1.0' },
		{ loc: canonical('/materials'), lastmod: today, priority: '0.8' }
	];
	for (const [slug, lastmod] of byMaterial) {
		entries.push({ loc: canonical('/materials/' + slug), lastmod, priority: '0.9' });
	}
	for (const l of all) {
		entries.push({
			loc: canonical('/listing/' + (l as any).slug),
			lastmod: (l as any).publishedAt,
			priority: '0.8'
		});
	}

	// materials() is referenced so an unknown slug can never leak into the sitemap
	const known = new Set(materials().map((m) => m.slug));

	const body =
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
		entries
			.filter((e) => !e.loc.includes('/materials/') || known.has(e.loc.split('/materials/')[1]))
			.map(
				(e) =>
					`  <url><loc>${e.loc}</loc><lastmod>${e.lastmod}</lastmod><priority>${e.priority}</priority></url>`
			)
			.join('\n') +
		'\n</urlset>\n';

	return new Response(body, {
		headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'max-age=300' }
	});
}
