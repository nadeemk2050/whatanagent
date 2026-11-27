<script lang="ts">
	import ListingCard from '#lib/ListingCard.svelte';
	import JsonLd from '#lib/JsonLd.svelte';
	import { canonical, ldScript, SITE } from '#lib/market';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const title = $derived(`${data.material.name} in Oman — live listings | Oman Scrap Market`);
	const desc = $derived(
		`${data.listings.length} live ${data.material.name.toLowerCase()} listing${data.listings.length === 1 ? '' : 's'} in Oman. Quantity, packing and location on every listing, published by ${SITE.legal}, Barka.`
	);
	const listLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'ItemList',
		name: title,
		url: canonical('/materials/' + data.material.slug),
		numberOfItems: data.listings.length,
		itemListElement: data.listings.map((l, i) => ({
			'@type': 'ListItem',
			position: i + 1,
			url: canonical('/listing/' + l.slug),
			name: l.title
		}))
	});
	const crumbs = $derived({
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'Home', item: canonical('/') },
			{ '@type': 'ListItem', position: 2, name: 'Materials', item: canonical('/materials') },
			{
				'@type': 'ListItem',
				position: 3,
				name: data.material.name,
				item: canonical('/materials/' + data.material.slug)
			}
		]
	});
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={desc} />
	<link rel="canonical" href={canonical('/materials/' + data.material.slug)} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={desc} />
	<meta property="og:url" content={canonical('/materials/' + data.material.slug)} />
</svelte:head>

<JsonLd json={ldScript([listLd, crumbs])} />

<section class="hero">
	<div class="wrap">
		<div class="breadcrumbs">
			<a href="/">Home</a> / <a href="/materials">Materials</a> / {data.material.name}
		</div>
		<h1>{data.material.name} in Oman</h1>
		<p class="lead">
			{data.listings.length} live listing{data.listings.length === 1 ? '' : 's'} · {data.material.family} ·
			collected and loaded in Oman
		</p>
	</div>
</section>

<section class="section">
	<div class="wrap">
		<div class="grid cards-3">
			{#each data.listings as listing (listing.id)}
				<ListingCard {listing} />
			{/each}
		</div>

		<p class="muted small" style="margin-top:22px">
			Looking for a grade that is not listed here? <a href="tel:{SITE.phoneRaw}">{SITE.phone}</a> or
			<a href="https://wa.me/{SITE.whatsapp}" rel="noopener">WhatsApp</a> — the yard often holds material that
			has not been published yet.
		</p>
	</div>
</section>
