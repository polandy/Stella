<!--
  @component
  A month's photos, grouped by day under headings that stay at the top while their day scrolls by
  (docs/dev/02 §2.24.9). A heading opens its day; the next page loads by itself near the end, or
  by *Show more photos*.
-->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { nearEnd } from '$lib/components/ui/near-end';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { LibraryPhoto } from '$lib/immich/library';
	import { dayHeading } from '$lib/immich/library-labels';
	import type { LibraryDayGroup } from '$lib/immich/library-nav';
	import LibraryPhotos from './LibraryPhotos.svelte';

	interface Props {
		days: readonly LibraryDayGroup[];
		ticked: readonly string[];
		full: boolean;
		busy: boolean;
		labelOf: (photo: LibraryPhoto) => string | null;
		ontoggle: (id: string) => void;
		onday: (day: string) => void;
		/** Where the next page starts, or null at the month's end. */
		nextCursor: string | null;
		loading: boolean;
		onmore: () => void;
		/** The element the grid scrolls in, which the end is measured against. */
		root: Element | null;
	}

	let {
		days,
		ticked,
		full,
		busy,
		labelOf,
		ontoggle,
		onday,
		nextCursor,
		loading,
		onmore,
		root
	}: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
</script>

<div class="flex flex-col gap-3" data-testid="immich-library-month">
	{#each days as { day, photos } (day)}
		{@const heading = dayHeading(day, i18n.intlLocale)}
		<section class="flex flex-col gap-1.5" data-day={day}>
			<h3 class="sticky top-0 z-10 bg-card py-1">
				<button
					type="button"
					class="flex w-full items-center justify-between gap-2 rounded-control px-1 py-1 text-left text-sm font-semibold hover:bg-card-hover"
					aria-label={t('immich.library.showDay', { day: heading })}
					onclick={() => onday(day)}
				>
					<span class="truncate">{heading}</span>
					<Icon name="forward" size={14} class="shrink-0 text-fg-subtle" />
				</button>
			</h3>
			<LibraryPhotos {photos} {ticked} {full} {busy} {labelOf} {ontoggle} />
		</section>
	{/each}
	{#if nextCursor !== null}
		<div
			{@attach !loading && nearEnd(onmore, { root, page: nextCursor })}
			class="flex justify-center py-3"
		>
			<Button type="button" variant="ghost" size="sm" aria-disabled={loading} onclick={onmore}
				>{loading ? t('immich.library.loading') : t('immich.library.loadMore')}</Button
			>
		</div>
	{/if}
</div>
