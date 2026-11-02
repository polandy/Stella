<script lang="ts">
	import MemoryPhotos from '$lib/components/memories/MemoryPhotos.svelte';
	import MemoryRow from '$lib/components/memories/MemoryRow.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { addDays } from '$lib/dates/month';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { PageData } from './$types';

	/*
	 * Every memory of a day's date in earlier years (docs/02 §2.12.1), newest year first. The
	 * picker walks a day back or on, or jumps to any day up to today; Home's band leads here.
	 */
	let { data }: { data: PageData } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const monthDay = $derived(dayLabel(i18n, `--${data.day.slice(5)}`));
	const isToday = $derived(data.day === data.today);
	const hrefFor = (day: string) =>
		day === data.today ? '/on-this-day' : `/on-this-day?day=${day}`;
	const STEP =
		'inline-flex size-9 items-center justify-center rounded-app text-fg-muted hover:bg-card hover:text-fg';
</script>

<svelte:head><title>{t('common.pageTitle', { page: t('memories.title') })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-6 md:py-10">
	<header class="flex flex-col gap-1">
		<h1 class="flex items-center gap-2 text-2xl font-semibold text-fg">
			<Icon name="memories" size={20} />{t('memories.title')}
		</h1>
		<p class="text-sm text-fg-muted">{t('memories.page.intro', { day: monthDay })}</p>
	</header>

	<!-- A plain GET form: picking a day is a link, and it works before the page has loaded. -->
	<form method="GET" class="flex flex-wrap items-center gap-1" data-testid="memory-day-picker">
		<a href={hrefFor(addDays(data.day, -1))} class={STEP} aria-label={t('memories.page.earlier')}
			><Icon name="back" size={16} /></a
		>
		<label class="sr-only" for="memory-day">{t('memories.page.day')}</label>
		<input
			id="memory-day"
			type="date"
			name="day"
			value={data.day}
			max={data.today}
			class="rounded-app border border-border bg-bg px-2 py-1.5 text-sm text-fg"
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
		/>
		{#if isToday}
			<span class="{STEP} opacity-40" aria-hidden="true"><Icon name="forward" size={16} /></span>
		{:else}
			<a href={hrefFor(addDays(data.day, 1))} class={STEP} aria-label={t('memories.page.later')}
				><Icon name="forward" size={16} /></a
			>
			<a href="/on-this-day" class="px-2 text-sm font-medium text-link hover:underline"
				>{t('memories.page.today')}</a
			>
		{/if}
	</form>

	{#if data.years.length}
		{#each data.years as year (year.year)}
			<section
				class="flex flex-col gap-2 rounded-app bg-card px-4 py-3 shadow-card"
				aria-labelledby="memory-year-{year.year}"
				data-testid="memory-year"
			>
				<h2 id="memory-year-{year.year}" class="text-sm font-semibold text-fg">
					{t('memories.yearsAgo', { count: year.yearsAgo })}
					<span class="font-normal text-fg-subtle">· {year.year}</span>
				</h2>
				{#if year.photos.length}<MemoryPhotos photos={year.photos} years={false} />{/if}
				{#if year.rows.length}
					<ul class="flex flex-col">
						{#each year.rows as row (row.kind + row.id)}<MemoryRow {row} />{/each}
					</ul>
				{/if}
			</section>
		{/each}
	{:else}
		<EmptyState icon="memories" title={t('memories.page.empty', { day: monthDay })} />
	{/if}
</main>
