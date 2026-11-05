import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { CSP_DIRECTIVES } from './src/lib/server/http/csp';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// adapter-node: the built server is run with Bun in production
			// (`bun ./build/index.js`), giving us bun:sqlite + a low footprint
			// on a well-supported adapter.
			adapter: adapter(),
			// Nonces, not hashes: every page is rendered per request (docs/04 §4.7).
			csp: { mode: 'nonce', directives: CSP_DIRECTIVES }
		})
	]
});
