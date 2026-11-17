<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import { nearEnd } from '$lib/components/ui/near-end';
	import { useTranslate } from '$lib/i18n/context.svelte';

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

	async function loadMore() {
		if (loading) return;
		loading = true;
		try {
			await goto(href, { replaceState: true, noScroll: true, keepFocus: true });
		} finally {
			loading = false;
		}
	}
</script>

<div
	{@attach more && nearEnd(() => void loadMore(), { page: href })}
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
