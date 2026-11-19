<!--
  @component
  The timeline from above (docs/dev/02 §2.24.9): all years, or the months of one — or why there is
  nothing to show.
-->
<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { LibraryMonths as Timeline } from '$lib/immich/library';
	import { monthsOfYear, yearTotals } from '$lib/immich/library-nav';
	import LibraryMonths from './LibraryMonths.svelte';
	import LibraryNotice from './LibraryNotice.svelte';
	import LibraryYears from './LibraryYears.svelte';

	interface Props {
		/** The year whose months are shown, or null for all years. */
		year: string | null;
		timeline: Timeline | null;
		onyear: (year: string) => void;
		onmonth: (month: string) => void;
		onretry: () => void;
	}

	let { year, timeline, onyear, onmonth, onretry }: Props = $props();

	const t = useTranslate();
</script>

{#if timeline?.state !== 'months'}
	<LibraryNotice
		icon="conflict"
		title={t('immich.library.unreachable')}
		hint={t('immich.library.unreachableHint')}
		{onretry}
	/>
{:else if year === null && yearTotals(timeline.months).length === 0}
	<LibraryNotice icon="calendar" title={t('immich.library.timelineEmpty')} />
{:else}
	{#if year === null}
		<LibraryYears years={yearTotals(timeline.months)} onpick={onyear} />
	{:else}
		<LibraryMonths {year} months={monthsOfYear(timeline.months, year)} onpick={onmonth} />
	{/if}
	<p class="mt-3 text-xs text-fg-subtle">{t('immich.library.countsApproximate')}</p>
{/if}
