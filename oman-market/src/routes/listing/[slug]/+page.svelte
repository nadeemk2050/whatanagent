<script lang="ts">
	import JsonLd from '#lib/JsonLd.svelte';
	import {
		canonical,
		ldScript,
		listingLd,
		materialName,
		organizationLd,
		priceLabel,
		SITE,
		waLink
	} from '#lib/market';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const l = $derived(data.listing);
	const title = $derived(`${l.title} | Oman Scrap Market`);
	const desc = $derived(l.summary.slice(0, 165));
	const paragraphs = $derived(l.description.split(/\n+/).filter(Boolean));
	const shots = $derived(
		(Array.isArray(l.photos) ? l.photos : [])
			.map((p: any) => (typeof p === 'string' ? p : p && p.id))
			.filter(Boolean) as string[]
	);
	const crumbs = $derived({
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'Home', item: canonical('/') },
			{
				'@type': 'ListItem',
				position: 2,
				name: materialName(l.material),
				item: canonical('/materials/' + l.material)
			},
			{ '@type': 'ListItem', position: 3, name: l.title, item: canonical('/listing/' + l.slug) }
		]
	});
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={desc} />
	<link rel="canonical" href={canonical('/listing/' + l.slug)} />
	<meta property="og:type" content="product" />
	<meta property="og:title" content={l.title} />
	<meta property="og:description" content={desc} />
	<meta property="og:url" content={canonical('/listing/' + l.slug)} />
</svelte:head>

<JsonLd json={ldScript([listingLd(l), crumbs, organizationLd()])} />

<section class="hero">
	<div class="wrap">
		<div class="breadcrumbs">
			<a href="/">Home</a> / <a href="/materials/{l.material}">{materialName(l.material)}</a> /
			{l.title}
		</div>
		<div class="chips" style="margin-bottom:10px">
			<li class={l.type === 'wanted' ? 'chip-wanted' : 'chip-offer'}>
				{l.type === 'wanted' ? 'Wanted — buying' : 'For sale'}
			</li>
			<li>{materialName(l.material)}</li>
			<li>{l.city}, {l.country}</li>
			<li>Published {l.publishedAt}</li>
		</div>
		<h1>{l.title}</h1>
		<p class="lead">{l.summary}</p>
		<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
			<a class="btn btn-wa" href={waLink(l)} rel="noopener">WhatsApp about this lot</a>
			<a class="btn btn-outline" href="tel:{SITE.phoneRaw}">Call {SITE.phone}</a>
		</div>
	</div>
</section>

<section class="section">
	<div class="wrap grid cards-3" style="align-items:start">
		<div class="card" style="grid-column: span 2">
			<h2>About this listing</h2>
			{#if shots.length}
				<div class="gallery">
					{#each shots as s}
						<img src="/media/{s}" alt="{l.title} — photo" width="420" height="190" loading="lazy" />
					{/each}
				</div>
			{/if}
			<div class="prose">
				{#each paragraphs as p}
					<p>{p}</p>
				{/each}
			</div>
			<p class="notice">
				Listing valid until {l.expiresAt}. Send the grade and destination and we reply with photos of the actual
				lot and a firm price.
			</p>
		</div>
		<div class="card">
			<h2 style="font-size:1.05rem">At a glance</h2>
			<ul class="chips" style="flex-direction:column;align-items:flex-start">
				<li><strong>Quantity:</strong> {l.quantity}</li>
				<li><strong>Packing:</strong> {l.packing}</li>
				<li><strong>Location:</strong> {l.city}, {l.region}</li>
				<li><strong>Terms:</strong> {l.incoterms}</li>
				<li><strong>Price:</strong> {priceLabel(l)}</li>
			</ul>
			<h3 style="margin-top:18px">Seller</h3>
			<p class="small" style="margin:0">
				<strong>{l.seller.name}</strong>{#if l.seller.verified} <span class="muted">· verified</span>{/if}<br />
				<a href="tel:{SITE.phoneRaw}">{l.seller.phone}</a><br />
				<a href="https://wa.me/{l.seller.whatsapp}" rel="noopener">WhatsApp</a><br />
				<a href="mailto:{l.seller.email}">{l.seller.email}</a>
			</p>
		</div>
	</div>
</section>
