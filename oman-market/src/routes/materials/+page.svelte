<script lang="ts">
	import ListingCard from '#lib/ListingCard.svelte';
	import { canonical } from '#lib/market';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Materials listed on Oman Scrap Market</title>
	<meta
		name="description"
		content="Plastic and metal scrap materials with live listings in Oman: PET, HDPE, PVC, UPVC, PP, LDPE, PC, aluminium and iron."
	/>
	<link rel="canonical" href={canonical('/materials')} />
	<meta name="robots" content="index, follow" />
</svelte:head>

<section class="hero">
	<div class="wrap">
		<div class="breadcrumbs"><a href="/">Home</a> / Materials</div>
		<h1>Materials with live listings</h1>
		<p class="lead">Only materials that have something real available are listed here. Empty categories stay closed until they have stock.</p>
	</div>
</section>

<section class="section">
	<div class="wrap">
		{#if data.materials.length}
			<div class="grid cards-3">
				{#each data.materials as block (block.material.slug)}
					<div class="card">
						<h3><a href="/materials/{block.material.slug}">{block.material.name}</a></h3>
						<p class="muted small" style="margin:0 0 10px">
							{block.listings.length} live listing{block.listings.length === 1 ? '' : 's'} · {block.material.family}
						</p>
						{#each block.listings.slice(0, 2) as listing (listing.id)}
							<div style="margin-top:8px"><ListingCard {listing} /></div>
						{/each}
					</div>
				{/each}
			</div>
		{:else}
			<div class="empty">Nothing live yet.</div>
		{/if}
	</div>
</section>
