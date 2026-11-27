import { allLive, canonical, liveMaterials, materialName, priceLabel, SITE } from '#lib/market';

export function GET() {
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
		'Each listing names the material, quantity, packing, town and terms. Where a price would go stale it says "quote per load" instead of a number. Listings expire and return 404 after their validity date.'
	);
	lines.push('');
	lines.push('## Materials with live listings');
	for (const block of liveMaterials()) {
		lines.push(`- ${block.material.name}: ${canonical('/materials/' + block.material.slug)}`);
	}
	lines.push('');
	lines.push('## Live listings');
	for (const l of allLive()) {
		lines.push(
			`- ${l.title} — ${materialName(l.material)}, ${l.quantity}, ${l.packing}, ${l.city}, ${priceLabel(l)} (${canonical('/listing/' + l.slug)})`
		);
	}
	lines.push('');
	lines.push(`## Sitemap\n${SITE.base}/sitemap.xml`);
	return new Response(lines.join('\n') + '\n', {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'max-age=600' }
	});
}
