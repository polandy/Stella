<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import type { Snippet } from 'svelte';

	/*
	 * The auth shell (docs/05 §5.5): the brand on one side, the form on the other. On a
	 * phone the brand panel shrinks to a header so the form is the first thing on screen.
	 */
	let { children }: { children: Snippet } = $props();
</script>

<div class="grid min-h-screen bg-bg text-fg md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
	<aside class="flex flex-col justify-between gap-8 bg-bg-sunken px-6 py-8 md:px-12 md:py-14">
		<a href="/" class="flex items-center" aria-label="Stella"><Logo size={30} wordmark /></a>
		<div class="hidden md:block">
			<p class="max-w-sm font-serif text-3xl leading-snug text-fg">
				The people in your life, remembered — together.
			</p>
			<p class="mt-4 max-w-sm text-sm text-fg-muted">
				One quiet place for what a family knows about the people around it. Written down once,
				kept by all of you, seen by nobody else.
			</p>
		</div>
		<p class="hidden text-xs text-fg-subtle md:block">Self-hosted · your hardware · no telemetry</p>
	</aside>

	<main class="flex items-center justify-center px-6 py-10 md:px-12">
		<div class="flex w-full max-w-sm flex-col gap-6">
			{@render children()}
		</div>
	</main>
</div>
