<script lang="ts">
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import Button from '#lib/components/ui/Button.svelte';
	import { nearEnd } from '#lib/components/ui/near-end.js';
	import { useTranslate } from '#lib/i18n/context.svelte.js';

	/*
	 * The foot of Home's stream (docs/dev/02 §2.22.2): the next page loads by itself once the foot
	 * scrolls into view, and *Show older* does the same by hand — by keyboard, or with JavaScript
	 * off, as a plain link. The page count lives in the URL, replaced rather than pushed, so the
	 * back button returns to the same rows; Home's page snapshot puts the scroll back.
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

	// A load of its own is a navigation too, and the newest one wins: one started by the foot
	// coming into view must not overtake the reader's, nor take the turn of one the shell holds
	// back while it sends pending removals (docs/dev/04 §4.9).
	let leaving = false;
	beforeNavigate(() => {
		if (!loading) leaving = true;
	});
	afterNavigate(() => {
		leaving = false;
	});

	function loadNear() {
		if (leaving || navigating.to) return;
		void loadMore();
	}

	async function loadMore() {
		if (loading) return;
		loading = true;
		try {
			await goto(href, { replace: true, reset: false });
		} finally {
			loading = false;
		}
	}
</script>

<div
	{@attach more && nearEnd(loadNear, { page: href })}
	class="flex justify-center py-4"
	data-testid="stream-foot"
>
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
