import { error } from '@sveltejs/kit';
import { listingsForMaterial, materialBySlug } from '#lib/market';

export function load({ params }: { params: { slug: string } }) {
	const material = materialBySlug(params.slug);
	if (!material) error(404, 'Unknown material');
	const listings = listingsForMaterial(material.slug);
	// A category with no live stock must not exist as an indexable page.
	if (!listings.length) error(404, 'No live listings for this material');
	return { material, listings };
}
