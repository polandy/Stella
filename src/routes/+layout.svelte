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

	let { children } = $props();
</script>

{@render children()}
