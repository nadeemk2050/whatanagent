<script lang="ts">
	// JSON-LD has to be in the server-rendered HTML, and Svelte does not evaluate
	// expressions inside a <script> element — so the tag itself is emitted via {@html}.
	let { json }: { json: string } = $props();
</script>

{@html `<script type="application/ld+json">${json}</script>`}
