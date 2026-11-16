<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * The foot of Home's stream (docs/dev/02 §2.22.2): the next page loads by itself once the foot
	 * scrolls into view, and *Show older* does the same by hand — by keyboard, or with JavaScript
	 * off, as a plain link. The page count lives in the URL, replaced rather than pushed, so the
	 * back button returns to the same rows and the browser restores the scroll.
	 */
	let {
		href,
		more,
		pages
	}: {
		/** The address showing one page more. */
		href: string;
		/** Whether anything older is left to load. */
		more: boolean;
		/** How many pages are shown; the end is only said once the reader has scrolled past one. */
		pages: number;
	} = $props();

	const t = useTranslate();

	let loading = $state(false);
	let foot = $state<HTMLElement>();

	async function loadMore() {
		if (loading) return;
		loading = true;
		try {
			await goto(href, { replaceState: true, noScroll: true, keepFocus: true });
		} finally {
			loading = false;
		}
	}

	// One observer per page: a new one reports at once, so a foot still in view after a short
	// page asks for the next without waiting for a scroll.
	$effect(() => {
		if (!more || !foot) return;
		void href;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) void loadMore();
			},
			{ rootMargin: '0px 0px 600px 0px' }
		);
		observer.observe(foot);
		return () => observer.disconnect();
	});
</script>

<div bind:this={foot} class="flex justify-center py-4" data-testid="stream-foot">
	{#if more}
		<Button
			variant="ghost"
			size="sm"
			{href}
			aria-disabled={loading}
			onclick={(event: MouseEvent) => {
				// A modified click keeps the link's own meaning — a new tab, a new window.
				if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
				event.preventDefault();
				void loadMore();
			}}
		>
			{loading ? t('home.stream.loading') : t('home.stream.more')}
		</Button>
	{:else if pages > 1}
		<p class="text-xs text-fg-subtle">{t('home.stream.end')}</p>
	{/if}
	<span class="sr-only" aria-live="polite">{loading ? t('home.stream.loading') : ''}</span>
</div>
