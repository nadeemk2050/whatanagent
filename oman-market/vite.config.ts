import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapterNode from '@sveltejs/adapter-node';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';

// Local builds and tests run on Node; Cloudflare builds (CI) use the Workers adapter.
const onCloudflare = !!process.env.CF_PAGES || process.env.MARKET_TARGET === 'cloudflare';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: onCloudflare ? adapterCloudflare() : adapterNode()
		})
	],
	build: {
		rollupOptions: {
			// Bindings are imported from the Workers runtime by name; the Node build must
			// leave the specifier alone so the guarded dynamic import can fail quietly.
			external: ['cloudflare:workers']
		}
	}
});
