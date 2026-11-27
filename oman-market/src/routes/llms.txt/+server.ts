import { canonical, materialName, priceLabel, SITE } from '#lib/market';
import { mergedLive } from '#lib/store';
import { getBindings } from '#lib/bindings.server';

export async function GET() {
	const all = await mergedLive(await getBindings());

	const lines: string[] = [];
	lines.push(`# ${SITE.name}`);
	lines.push('');
	lines.push(`> ${SITE.description}`);
	lines.push('');
	lines.push(`Operator: ${SITE.legal} — ${SITE.address}`);
	lines.push(`Contact: ${SITE.phone} · WhatsApp +${SITE.whatsapp} · ${SITE.email}`);
	lines.push(`CR ${SITE.cr} · TIN ${SITE.tin} · ${SITE.hours}, Friday closed`);
	lines.push('');
	lines.push('## How to read a listing');
	lines.push(
		'Each listing names the material, quantity, packing, town and terms. Where a price would go stale it says "quote per load" instead of a number. Listings expire and return 404 after their validity date. Anyone can post: /post.'
	);
	lines.push('');
	lines.push('## Live listings');
	for (const l of all) {
		lines.push(
			`- ${(l as any).title} — ${materialName((l as any).material)}, ${(l as any).quantity}, ${(l as any).city}, ${priceLabel(l as never)} (${canonical('/listing/' + (l as any).slug)})`
		);
	}
	lines.push('');
	lines.push(`## Sitemap\n${SITE.base}/sitemap.xml`);
	return new Response(lines.join('\n') + '\n', {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'max-age=300' }
	});
}
