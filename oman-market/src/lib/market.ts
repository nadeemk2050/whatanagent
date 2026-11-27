// Oman Scrap Market — data access + SEO helpers.
//
// Phase 1 reads a JSON catalogue that ships with the app, so the market can be
// deployed and indexed today. The same functions are the seam where Cloudflare D1
// plugs in later: swap `readAll()` for a D1 query and nothing else changes.
import raw from './data/listings.json';

export type Material = { slug: string; name: string; family: string };

export type Listing = {
	id: string;
	slug: string;
	material: string;
	type: 'offer' | 'wanted';
	title: string;
	summary: string;
	quantity: string;
	packing: string;
	city: string;
	region: string;
	country: string;
	price: number | null;
	currency: string;
	priceNote: string;
	incoterms: string;
	description: string;
	seller: { name: string; verified: boolean; phone: string; whatsapp: string; email: string };
	photos: string[];
	publishedAt: string;
	expiresAt: string;
	status: string;
};

export const SITE = {
	name: 'Oman Scrap Market',
	legal: 'Arabian Polyplast Trading LLC',
	base: 'https://market.arabianpolyplast.com',
	main: 'https://arabianpolyplast.com',
	phone: '+968 7694 2126',
	phoneRaw: '+96876942126',
	whatsapp: '96895174888',
	email: 'arabianpolyplast@gmail.com',
	address: 'As-Saqsuq, Barka 320, Al Batinah South Governorate, Oman',
	cr: '1577463',
	tin: '2123435',
	hours: 'Sat–Thu 07:00–19:00',
	description:
		'Buy and sell plastic and metal scrap in Oman: PET, HDPE, PVC, UPVC, PP, LDPE, PC, aluminium and iron. Verified listings with quantity, packing and location, published by Arabian Polyplast Trading LLC in Barka.'
};

const catalogue = raw as { generatedAt: string; materials: Material[]; listings: Listing[] };

export function materials(): Material[] {
	return catalogue.materials;
}

export function materialBySlug(slug: string): Material | undefined {
	return catalogue.materials.find((m) => m.slug === slug);
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function isLive(l: Listing): boolean {
	return l.status === 'live' && (!l.expiresAt || l.expiresAt >= today());
}

export function allLive(): Listing[] {
	return catalogue.listings
		.filter(isLive)
		.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function listingBySlug(slug: string): Listing | undefined {
	return allLive().find((l) => l.slug === slug);
}

export function listingsForMaterial(slug: string): Listing[] {
	return allLive().filter((l) => l.material === slug);
}

/** Materials that actually have a live listing — empty categories must not exist. */
export function liveMaterials(): { material: Material; listings: Listing[] }[] {
	return materials()
		.map((material) => ({ material, listings: listingsForMaterial(material.slug) }))
		.filter((x) => x.listings.length > 0);
}

export function searchListings(q: string): Listing[] {
	const needle = String(q || '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
	if (!needle) return [];
	const words = needle.split(' ');
	return allLive().filter((l) => {
		const hay = [
			l.title,
			l.summary,
			l.quantity,
			l.packing,
			l.city,
			l.region,
			l.description,
			materialBySlug(l.material)?.name || '',
			l.type === 'wanted' ? 'wanted buying requirement' : 'for sale offer'
		]
			.join(' ')
			.toLowerCase();
		return words.every((w) => hay.includes(w));
	});
}

export function priceLabel(l: Listing): string {
	if (l.price == null) return l.priceNote || 'Price on request';
	return `${l.price.toLocaleString('en')} ${l.currency}`;
}

export function waLink(l: Listing): string {
	const text = `Hello, I am interested in "${l.title}" on ${SITE.name} (${SITE.base}/listing/${l.slug}).`;
	return `https://wa.me/${l.seller.whatsapp}?text=${encodeURIComponent(text)}`;
}

export function materialName(slug: string): string {
	return materialBySlug(slug)?.name || slug;
}

// ---------------------------------------------------------------- SEO helpers
export function canonical(path: string): string {
	return SITE.base + (path === '/' ? '/' : path.replace(/\/$/, ''));
}

/** JSON-LD as a string that is safe inside a <script> tag. */
export function ldScript(obj: unknown): string {
	return JSON.stringify(obj).replace(/</g, '\\u003c');
}

export function breadcrumb(items: { name: string; path: string }[]) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((it, i) => ({
			'@type': 'ListItem',
			position: i + 1,
			name: it.name,
			item: canonical(it.path)
		}))
	};
}

export function organizationLd() {
	return {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: SITE.legal,
		alternateName: SITE.name,
		url: SITE.main,
		email: SITE.email,
		telephone: SITE.phone,
		identifier: { '@type': 'PropertyValue', propertyID: 'Oman CR', value: SITE.cr },
		address: {
			'@type': 'PostalAddress',
			streetAddress: 'As-Saqsuq',
			addressLocality: 'Barka',
			addressRegion: 'Al Batinah South Governorate',
			addressCountry: 'OM'
		},
		areaServed: ['Oman', 'Muscat', 'Barka', 'Sohar', 'Al Batinah', 'GCC', 'Worldwide']
	};
}

export function listingLd(l: Listing) {
	const product: Record<string, unknown> = {
		'@context': 'https://schema.org',
		'@type': 'Product',
		name: l.title,
		description: l.summary + ' ' + l.description.replace(/\n+/g, ' ').slice(0, 400),
		category: materialName(l.material),
		url: canonical('/listing/' + l.slug),
		itemCondition: 'https://schema.org/UsedCondition',
		additionalProperty: [
			{ '@type': 'PropertyValue', name: 'Quantity', value: l.quantity },
			{ '@type': 'PropertyValue', name: 'Packing', value: l.packing },
			{ '@type': 'PropertyValue', name: 'Location', value: `${l.city}, ${l.country}` },
			{ '@type': 'PropertyValue', name: 'Listing type', value: l.type === 'wanted' ? 'Wanted (buying)' : 'For sale' }
		]
	};
	if (l.photos.length) product.image = l.photos.map((p) => SITE.base + p);
	if (l.price != null) {
		product.offers = {
			'@type': 'Offer',
			price: l.price,
			priceCurrency: l.currency,
			availability: 'https://schema.org/InStock',
			url: canonical('/listing/' + l.slug),
			validThrough: l.expiresAt,
			seller: { '@type': 'Organization', name: l.seller.name, telephone: l.seller.phone },
			areaServed: l.country
		};
	}
	return product;
}
