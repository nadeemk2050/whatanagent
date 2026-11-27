<script lang="ts">
	import ListingCard from '#lib/ListingCard.svelte';
	import JsonLd from '#lib/JsonLd.svelte';
	import { SITE, canonical, ldScript, organizationLd, type Listing, type Material } from '#lib/market';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const title = 'Oman Scrap Market — buy and sell plastic & metal scrap in Oman';
	const itemsLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name: title,
		url: canonical('/'),
		mainEntity: {
			'@type': 'ItemList',
			numberOfItems: data.listings.length,
			itemListElement: data.listings.slice(0, 20).map((l: Listing, i: number) => ({
				'@type': 'ListItem',
				position: i + 1,
				url: canonical('/listing/' + l.slug),
				name: l.title
			}))
		}
	});
</script>

<svelte:head>
	<title>{title}</title>
	<meta
		name="description"
		content="Buy and sell PET, HDPE, PVC, UPVC, PP, LDPE, PC, aluminium and iron scrap in Oman. Verified listings with quantity, packing and location, published by Arabian Polyplast Trading LLC, Barka."
	/>
	<link rel="canonical" href={canonical('/')} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={SITE.description} />
	<meta property="og:url" content={canonical('/')} />
</svelte:head>

<JsonLd json={ldScript([organizationLd(), itemsLd])} />

<!-- Listings first: the rail is the first thing on the page, on every screen size. -->
<section class="section section-first" id="listings">
	<div class="wrap">
		<div class="rail-head">
			<div class="rail-head-text">
				<h1 class="page-title">Plastic &amp; metal scrap in Oman</h1>
			</div>
			<div class="rail-actions">
				<a class="btn btn-primary" href="/post">Post a listing — free</a>
				<a
					class="btn btn-wa"
					href="https://wa.me/{SITE.whatsapp}?text={encodeURIComponent('Hello, I saw the Oman Scrap Market listings.')}"
					rel="noopener">WhatsApp us</a
				>
			</div>
		</div>

		{#if data.listings.length}
			<div class="rail" role="list">
				{#each data.listings as listing (listing.id)}
					<div role="listitem"><ListingCard {listing} /></div>
				{/each}
			</div>
				<p class="rail-hint muted small">Swipe sideways for more →</p>
		{:else}
			<div class="empty">No live listings right now. Send what you have on WhatsApp and it goes up here.</div>
		{/if}
	</div>
</section>

<section class="section section-alt">
	<div class="wrap">
		<div class="section-head">
			<h2>Materials with live listings</h2>
			<p class="muted" style="margin:0">A category page opens as soon as it has something real to show.</p>
		</div>
		{#if data.materials.length}
			<div class="grid cards-3">
				{#each data.materials as m (m.material.slug)}
					<a class="card listing-card" href="/materials/{m.material.slug}">
						<h3>{m.material.name}</h3>
						<p class="muted small" style="margin:0">
							{m.count} live listing{m.count === 1 ? '' : 's'} · {m.material.family}
						</p>
					</a>
				{/each}
			</div>
		{:else}
			<div class="empty">Categories appear with the first listing in each material.</div>
		{/if}
	</div>
</section>

<section class="section">
	<div class="wrap prose">
		<h2>How this market works</h2>
		<p>
			Oman Scrap Market is run by {SITE.legal} from our yard in {SITE.address}. We buy from factories,
			collectors, municipalities and demolition contractors, and we supply graded material to recyclers and
			converters in Oman, the GCC and worldwide.
		</p>
		<p>
			Listings carry what a buyer actually needs to make a decision: the polymer or metal grade, the tonnage
			available in metric tonnes, how it is packed, and where it sits. Where a price would go stale in a week,
			we say "quote per load" instead of publishing a number that misleads.
		</p>
		<p>
			Enquiries go straight to WhatsApp on <a href="tel:{SITE.phoneRaw}">{SITE.phone}</a>, and every load is
			weighed on a certified weighbridge and photographed before it leaves the yard.
		</p>
	</div>
</section>

<!-- The original hero copy, moved to the very bottom at the requested 4 px size. -->
<div class="wrap">
	<p class="tiny-about">
		Scrap that is actually available in Oman — with the facts attached. Every listing here names the material,
		the quantity, the packing and the town. No prices are glued to stale numbers: you send the grade and
		destination, we answer with photos of the real lot and a price the same working day.
	</p>
</div>
