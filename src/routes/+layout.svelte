<script lang="ts">
	/*
	 * Fonts are self-hosted (docs/04 §4.7 rules out third-party CDNs): Vite bundles the woff2
	 * files these packages ship and rewrites the @font-face URLs to our own origin.
	 * Instrument Sans carries the interface, Newsreader what people wrote (docs/05 §5.3).
	 */
	import '@fontsource-variable/instrument-sans';
	import '@fontsource-variable/newsreader';
	import '@fontsource-variable/newsreader/wght-italic.css';
	import '../app.css';
	import { provideI18n } from '$lib/i18n/context.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// The viewer's language, provided once for the whole tree. A getter, not the value, so a
	// change of language re-renders the copy rather than needing a full reload.
	provideI18n(() => data.locale);
</script>

{@render children()}
