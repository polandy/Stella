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
	import { APP_BACKGROUND } from '$lib/design/app-colors';
	import { provideI18n } from '$lib/i18n/context.svelte';
	import { APPLE_TOUCH_ICON } from '$lib/pwa/manifest';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// The viewer's language, provided once for the whole tree. A getter, not the value, so a
	// change of language re-renders the copy rather than needing a full reload.
	provideI18n(() => data.locale);
</script>

<svelte:head>
	<!--
		What makes Stella installable (docs/02 §2.18). The manifest is a route, not a file, so
		its name and description arrive translated; `use-credentials` sends the language cookie
		with the fetch, which is the only way the browser asks for it in the reader's language.
	-->
	<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials" />
	<link rel="apple-touch-icon" href={APPLE_TOUCH_ICON.src} />

	<!--
		One per theme: the browser paints its own chrome with this, and a single value leaves
		half the household with a status bar that does not match the page under it.
	-->
	<meta name="theme-color" content={APP_BACKGROUND.light} media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content={APP_BACKGROUND.dark} media="(prefers-color-scheme: dark)" />
</svelte:head>

{@render children()}
