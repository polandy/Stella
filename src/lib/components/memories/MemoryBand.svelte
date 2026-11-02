<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import type { MemoryPhotoView, MemoryRowView } from '$lib/memories/view';
	import MemoryPhotos from './MemoryPhotos.svelte';
	import MemoryRow from './MemoryRow.svelte';

	/*
	 * Home's *On this day* band (docs/02 §2.12.1): last in the rail, quiet — the day's photos in
	 * earlier years, then at most three entries under "N years ago". *More* leads to
	 * `/on-this-day`, which holds the rest; Home leaves the band out while the day has nothing.
	 */
	interface Props {
		years: { year: number; yearsAgo: number; rows: MemoryRowView[] }[];
		photos: MemoryPhotoView[];
		more: boolean;
		today: string;
	}
	let { years, photos, more, today }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
</script>

<section data-testid="memory-band" class="flex flex-col gap-2">
	<h2 class="flex items-center gap-2 text-sm font-semibold text-fg">
		<Icon name="memories" size={13} />{t('memories.title')}
	</h2>
	{#if photos.length}<MemoryPhotos {photos} />{/if}
	{#each years as year (year.year)}
		<div>
			<h3 class="px-1.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
				{t('memories.yearsAgo', { count: year.yearsAgo })} · {year.year}
			</h3>
			<ul class="flex flex-col">
				{#each year.rows as row (row.kind + row.id)}<MemoryRow {row} />{/each}
			</ul>
		</div>
	{/each}
	{#if more}
		<a
			href="/on-this-day"
			class="inline-block px-1.5 text-xs font-medium text-link hover:underline"
			data-testid="memory-band-more"
			>{t('memories.moreFrom', { day: dayLabel(i18n, `--${today.slice(5)}`) })}</a
		>
	{/if}
</section>
