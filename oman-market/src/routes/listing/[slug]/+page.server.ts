import { error } from '@sveltejs/kit';
import { listingBySlug, materialBySlug } from '#lib/market';
import { getPosted } from '#lib/store';
import { getBindings } from '#lib/bindings.server';

export async function load({ params }) {
	const env = await getBindings();

	const posted = await getPosted(env, params.slug);
	if (posted) {
		return { listing: posted, material: materialBySlug(posted.material)!, posted: true };
	}

	const seed = listingBySlug(params.slug);
	if (!seed) error(404, 'Listing not found or expired');
	return { listing: seed, material: materialBySlug(seed.material)!, posted: false };
}
