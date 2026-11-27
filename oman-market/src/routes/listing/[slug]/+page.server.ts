import { error } from '@sveltejs/kit';
import { listingBySlug, materialBySlug } from '#lib/market';

export function load({ params }: { params: { slug: string } }) {
	const listing = listingBySlug(params.slug);
	if (!listing) error(404, 'Listing not found or expired');
	return { listing, material: materialBySlug(listing.material)! };
}
