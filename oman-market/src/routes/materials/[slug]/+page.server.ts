import { error } from '@sveltejs/kit';
import { materialBySlug } from '#lib/market';
import { mergedLive } from '#lib/store';
import { getBindings } from '#lib/bindings.server';

export async function load({ params }) {
	const material = materialBySlug(params.slug);
	if (!material) error(404, 'Unknown material');

	const all = await mergedLive(await getBindings());
	const listings = all.filter((l) => (l as any).material === material.slug);
	// A category with no live stock must not exist as an indexable page.
	if (!listings.length) error(404, 'No live listings for this material');
	return { material, listings };
}
