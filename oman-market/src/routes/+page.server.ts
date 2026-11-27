import { allLive, liveMaterials } from '#lib/market';

export function load() {
	const listings = allLive();
	return {
		listings,
		materials: liveMaterials().map((x) => ({ material: x.material, count: x.listings.length })),
		total: listings.length
	};
}
