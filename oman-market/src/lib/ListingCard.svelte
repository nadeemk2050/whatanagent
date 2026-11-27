<script lang="ts">
	import { priceLabel, materialName } from '#lib/market';
	import { photoId } from '#lib/store';

	type CardListing = {
		slug: string;
		title: string;
		summary: string;
		material: string;
		type: string;
		city: string;
		quantity?: string;
		price?: number | null;
		priceNote?: string;
		currency?: string;
		photos?: unknown;
	};

	let { listing }: { listing: CardListing } = $props();
	const shot = $derived(photoId(listing));
</script>

<a class="card listing-card rail-card" href="/listing/{listing.slug}">
	{#if shot}
		<img
			class="card-photo"
			src="/media/{shot}"
			alt="{listing.title} — {listing.city}, Oman"
			width="320"
			height="200"
			loading="lazy"
			decoding="async"
		/>
	{/if}
	<div class="chips">
		<li class={listing.type === 'wanted' ? 'chip-wanted' : 'chip-offer'}>
			{listing.type === 'wanted' ? 'Wanted' : 'For sale'}
		</li>
		<li>{materialName(listing.material)}</li>
		<li>{listing.city}</li>
	</div>
	<h3>{listing.title}</h3>
	<p class="muted small clamp-2" style="margin:0">{listing.summary}</p>
	<p class="small" style="margin:0">
		<span class="price">{priceLabel(listing as never)}</span>
		{#if listing.quantity}<span class="muted"> · {listing.quantity}</span>{/if}
	</p>
</a>
