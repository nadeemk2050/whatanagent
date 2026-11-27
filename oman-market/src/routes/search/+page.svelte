<script lang="ts">
	import ListingCard from '#lib/ListingCard.svelte';
	import { searchListings, SITE } from '#lib/market';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const results = $derived(data.q ? searchListings(data.q) : []);
</script>

<svelte:head>
	<title>{data.q ? `Search: ${data.q}` : 'Search listings'} | Oman Scrap Market</title>
	<meta name="robots" content="noindex, follow" />
</svelte:head>

<section class="hero">
	<div class="wrap">
		<p class="eyebrow">Search</p>
		<h1>Find a lot</h1>
		<form class="search-row" action="/search" method="get" role="search">
			<input
				type="search"
				name="q"
				value={data.q}
				placeholder="Material, grade, town — e.g. PET Barka, HDPE 100, iron"
				aria-label="Search listings"
			/>
			<button class="btn btn-primary" type="submit">Search</button>
		</form>
	</div>
</section>

<section class="section">
	<div class="wrap">
		{#if !data.q}
			<p class="muted">Type a material, a town or a grade. Results stay on this page and are not indexed.</p>
		{:else if results.length}
			<p class="muted small">{results.length} result{results.length === 1 ? '' : 's'} for “{data.q}”</p>
			<div class="grid cards-3">
				{#each results as listing (listing.id)}
					<ListingCard {listing} />
				{/each}
			</div>
		{:else}
			<div class="empty">
				Nothing live matches “{data.q}”.<br />
				<a href="https://wa.me/{SITE.whatsapp}" rel="noopener">Ask on WhatsApp</a> — the yard may still hold it.
			</div>
		{/if}
	</div>
</section>
