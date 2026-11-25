<!--
  @component
  A month or an album as read so far (docs/dev/02 §2.24.9): its photos grouped by day, the next
  page by itself near the end — or why there are none, and *Try again* when Immich did not answer.
-->
<script lang="ts">
	import { useTranslate } from '#lib/i18n/context.svelte.js';
	import type { LibraryPhoto } from '#lib/immich/library.js';
	import { groupByDay } from '#lib/immich/library-nav.js';
	import LibraryMonthGrid from './LibraryMonthGrid.svelte';
	import LibraryNotice from './LibraryNotice.svelte';
	import type { PagedRead } from './library-browser.svelte';

	interface Props {
		read: PagedRead;
		/** What the body says when there is nothing to show. */
		empty: string;
		/** Null while a tap picks one photo rather than ticking it. */
		ticked: readonly string[] | null;
		full: boolean;
		busy: boolean;
		labelOf: (photo: LibraryPhoto) => string | null;
		ontoggle: (id: string) => void;
		onday: (day: string) => void;
		onretry: () => void;
		onmore: () => void;
		root: Element | null;
	}

	let { read, empty, ticked, full, busy, labelOf, ontoggle, onday, onretry, onmore, root }: Props =
		$props();

	const t = useTranslate();
</script>

{#if read.failed && read.photos.length === 0}
	<LibraryNotice
		icon="conflict"
		title={t('immich.library.unreachable')}
		hint={t('immich.library.unreachableHint')}
		{onretry}
	/>
{:else if read.photos.length === 0 && read.nextCursor === null}
	<LibraryNotice icon="calendar" title={empty} />
{:else}
	<LibraryMonthGrid
		days={groupByDay(read.photos)}
		{ticked}
		{full}
		{busy}
		{labelOf}
		{ontoggle}
		{onday}
		withYear={'album' in read.source}
		nextCursor={read.failed ? null : read.nextCursor}
		loading={read.loading}
		{onmore}
		{root}
	/>
	{#if read.failed}
		<LibraryNotice icon="conflict" title={t('immich.library.unreachable')} onretry={onmore} />
	{/if}
{/if}
