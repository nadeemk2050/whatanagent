import type { Listing } from '#lib/market';
import { allLive as seedLive } from '#lib/market';

// Storage for listings posted through the site.
//
// Cloudflare KV is the only resource available to the token today (R2 is not enabled
// on the account yet, D1 is not permitted). KV is enough for this shape of data:
//   listing:<id>   full listing JSON (+ a compact summary in the key metadata)
//   img:<id>       one JPEG, with the content type in the metadata
// The home page reads only the key metadata, so one screenful of 5-up cards costs
// one list() call instead of 25 reads.

// Minimal KV surface so the file type-checks without the Workers types.
export type KV = {
	get(key: string, type?: 'text' | 'json' | 'arrayBuffer'): Promise<any>;
	put(key: string, value: any, opts?: { metadata?: unknown; expirationTtl?: number }): Promise<void>;
	delete(key: string): Promise<void>;
	list(opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
		keys: { name: string; metadata?: any }[];
		list_complete: boolean;
		cursor?: string;
	}>;
};

export type PhotoRef = { id: string; w?: number; h?: number };

export type PostedListing = {
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
	photos: PhotoRef[];
	publishedAt: string;
	expiresAt: string;
	status: string;
};

export const MAX_PHOTOS = 5;
export const PHOTO_BYTES = 700 * 1024;
const LISTING_DAYS = 60;

export type Summary = {
	id: string;
	slug: string;
	title: string;
	summary: string;
	material: string;
	type: string;
	city: string;
	quantity: string;
	price: number | null;
	currency: string;
	priceNote: string;
	publishedAt: string;
	expiresAt: string;
	photos: string[];
	posted: true;
};

export function slugify(s: string): string {
	return String(s || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

export function newId(): string {
	return 'mkt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

function isLive(s: { expiresAt?: string; status?: string }): boolean {
	const today = new Date().toISOString().slice(0, 10);
	return (s.status || 'live') === 'live' && (!s.expiresAt || s.expiresAt >= today);
}

export async function postedSummaries(env?: { MARKET?: KV }): Promise<Summary[]> {
	const kv = env?.MARKET;
	if (!kv) return [];
	const out: Summary[] = [];
	let cursor: string | undefined;
	do {
		const page = await kv.list({ prefix: 'listing:', limit: 400, cursor });
		for (const k of page.keys) {
			const s = k.metadata as Summary | undefined;
			if (s && s.slug && isLive(s)) out.push(s);
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return out.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

/** Seed listings (shipped in the app) plus everything posted through the form. */
export async function mergedLive(env?: { MARKET?: KV }): Promise<(Summary | Listing)[]> {
	const posted = await postedSummaries(env);
	const postedSlugs = new Set(posted.map((s) => s.slug));
	const seed = seedLive().filter((l) => !postedSlugs.has(l.slug));
	return [...posted, ...seed].sort((a, b) => ((a as any).publishedAt < (b as any).publishedAt ? 1 : -1));
}

export async function getPosted(
	env: { MARKET?: KV } | undefined,
	slug: string
): Promise<PostedListing | null> {
	const kv = env?.MARKET;
	if (!kv) return null;
	const found = (await postedSummaries(env)).find((s) => s.slug === slug);
	if (!found) return null;
	const raw = await kv.get('listing:' + found.id, 'text');
	if (!raw) return null;
	try {
		const l = JSON.parse(String(raw)) as PostedListing;
		return isLive(l) ? l : null;
	} catch {
		return null;
	}
}

export async function getMedia(env: { MARKET?: KV } | undefined, id: string) {
	const kv = env?.MARKET;
	if (!kv) return null;
	if (!/^[a-z0-9-]{6,80}$/i.test(id)) return null;
	const buf = await kv.get('img:' + id, 'arrayBuffer');
	if (!buf) return null;
	const listed = await kv.list({ prefix: 'img:' + id, limit: 1 });
	const type = listed.keys[0]?.metadata?.type || 'image/jpeg';
	return { bytes: buf as ArrayBuffer, type };
}

// ---------------------------------------------------------------- validation
export type PostInput = {
	title: string;
	material: string;
	type: string;
	quantity: string;
	packing: string;
	city: string;
	description: string;
	contactName: string;
	whatsapp: string;
	photos?: { dataUrl: string; w?: number; h?: number }[];
	hp?: string;
};

export function validatePost(b: PostInput): string {
	if (b.hp) return 'Rejected.';
	const title = String(b.title || '').trim();
	const desc = String(b.description || '').trim();
	if (title.length < 12) return 'Give the lot a longer title (at least 12 characters).';
	if (title.length > 90) return 'Title is too long (max 90 characters).';
	if (!b.material) return 'Choose the material.';
	if (String(b.quantity || '').trim().length < 3) return 'Say how much is available (e.g. "2 truckloads").';
	if (String(b.city || '').trim().length < 2) return 'Where is the material?';
	if (desc.length < 250) return 'Describe the lot in at least 250 characters — grade, colour, contamination, packing, terms.';
	if (desc.length > 4000) return 'Description is too long (max 4000 characters).';
	if (String(b.contactName || '').trim().length < 2) return 'Add your name so buyers know who they are dealing with.';
	const wa = String(b.whatsapp || '').replace(/[^\d]/g, '');
	if (wa.length < 8 || wa.length > 15) return 'Enter a WhatsApp number with the country code.';
	const photos = Array.isArray(b.photos) ? b.photos : [];
	if (photos.length > MAX_PHOTOS) return 'Up to ' + MAX_PHOTOS + ' photos per listing.';
	return '';
}

export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; type: string } | null {
	const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
	if (!m) return null;
	const bin = atob(m[2]);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	if (bytes.length > PHOTO_BYTES) return null;
	return { bytes, type: m[1] === 'image/jpg' ? 'image/jpeg' : m[1] };
}

export async function tooManyPosts(kv: KV | undefined, ip: string): Promise<boolean> {
	if (!kv || !ip) return false;
	const key = 'rate:' + ip;
	const seen = await kv.get(key, 'text');
	if (seen) return true;
	await kv.put(key, '1', { expirationTtl: 600 });
	return false;
}

// ---------------------------------------------------------------- create
export async function createListing(
	env: { MARKET?: KV } | undefined,
	b: PostInput,
	ip: string
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
	const kv = env?.MARKET;
	if (!kv) return { ok: false, error: 'The market database is not connected yet.' };

	const bad = validatePost(b);
	if (bad) return { ok: false, error: bad };
	if (await tooManyPosts(kv, ip)) {
		return { ok: false, error: 'You just posted something — please wait 10 minutes before the next listing.' };
	}

	const id = newId();
	const slug = slugify(b.title) + '-' + id.slice(-4);
	const now = new Date();
	const expires = new Date(now.getTime() + LISTING_DAYS * 86400000).toISOString().slice(0, 10);
	const waDigits = String(b.whatsapp).replace(/\D/g, '');

	const photos: PhotoRef[] = [];
	const incoming = (b.photos || []).slice(0, MAX_PHOTOS);
	for (let i = 0; i < incoming.length; i++) {
		const decoded = decodeDataUrl(incoming[i].dataUrl);
		if (!decoded) continue;
		const imgId = id + '-' + i;
		await kv.put('img:' + imgId, decoded.bytes.buffer, { metadata: { type: decoded.type } });
		photos.push({ id: imgId, w: incoming[i].w, h: incoming[i].h });
	}

	const listing: PostedListing = {
		id,
		slug,
		material: String(b.material),
		type: b.type === 'wanted' ? 'wanted' : 'offer',
		title: String(b.title).trim(),
		summary: String(b.description).trim().slice(0, 180),
		quantity: String(b.quantity).trim(),
		packing: String(b.packing || '').trim() || 'As agreed',
		city: String(b.city).trim(),
		region: 'Oman',
		country: 'Oman',
		price: null,
		currency: 'OMR',
		priceNote: 'Message the poster for a price',
		incoterms: 'As agreed',
		description: String(b.description).trim(),
		seller: {
			name: String(b.contactName).trim().slice(0, 80),
			verified: false,
			phone: '+' + waDigits,
			whatsapp: waDigits,
			email: ''
		},
		photos,
		publishedAt: now.toISOString().slice(0, 10),
		expiresAt: expires,
		status: 'live'
	};

	const summary: Summary = {
		id,
		slug,
		title: listing.title,
		summary: listing.summary,
		material: listing.material,
		type: listing.type,
		city: listing.city,
		quantity: listing.quantity,
		price: null,
		currency: 'OMR',
		priceNote: listing.priceNote,
		publishedAt: listing.publishedAt,
		expiresAt: listing.expiresAt,
		photos: photos.map((p) => p.id),
		posted: true
	};

	await kv.put('listing:' + id, JSON.stringify(listing), { metadata: { ...summary, status: 'live' } });
	return { ok: true, slug };
}

/** First photo of any listing (seed listings have none, posted ones are KV ids). */
export function photoId(l: { photos?: unknown }): string {
	const p = Array.isArray(l.photos) ? l.photos[0] : null;
	if (!p) return '';
	if (typeof p === 'string') return p;
	return (p as PhotoRef).id || '';
}
