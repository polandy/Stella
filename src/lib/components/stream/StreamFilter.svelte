<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import TagChip from '$lib/components/journal/TagChip.svelte';
	import { TAGS_PAGE } from '$lib/hashtags/hashtags';
	import type { KnownTag } from '$lib/hashtags/picker';
	import type { TagNarrowing } from '$lib/hashtags/tag-pages';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { MessageKey } from '$lib/i18n/translate';
	import {
		isNarrowed,
		NO_FILTER,
		offersMemberChoice,
		STREAM_KINDS,
		streamFilterHref,
		withKind,
		withTag,
		type StreamFilter,
		type StreamKind
	} from '$lib/stream/filter';
	import { filterPill } from '$lib/stream/filter-pill';

	/*
	 * Home's stream filter (docs/02 §2.22.2, docs/design/screens/home.md): What, Who and Tags as
	 * chip rows, folded into one pill and a sheet on a phone, and the line that says what a tag
	 * narrowed the stream to. The chips are plain links, so a filter survives a reload, the back
	 * button undoes it, and it works before the page has hydrated.
	 */
	interface Props {
		filter: StreamFilter;
		members: readonly { id: string; name: string }[];
		/** The viewer, named *You* among the members. */
		userId: string;
		/** The Tags row's chips, most used first (`homeTagChips`); no row without any. */
		tagChips: readonly KnownTag[];
		/** What a tag narrowed the stream to, or null. */
		tagLine: TagNarrowing | null;
	}
	let { filter, members, userId, tagChips, tagLine }: Props = $props();

	const t = useI18n().t;

	const KIND_LABEL: Record<StreamKind, MessageKey> = {
		moment: 'home.filter.kind.moment',
		interaction: 'home.filter.kind.interaction',
		relationship: 'home.filter.kind.relationship',
		person: 'home.filter.kind.person',
		circlePhoto: 'home.filter.kind.circlePhoto',
		notice: 'home.filter.kind.notice'
	};
	const filtered = $derived(isNarrowed(filter));
	// The phone's pill: its count, highlight and the short summary beside it (docs/05 §5.5).
	const pill = $derived(filterPill(filter));
	const pillSummary = $derived(
		pill.narrowedTo
			.map((narrowed) => {
				if (narrowed.axis === 'kind') return t(KIND_LABEL[narrowed.kind]);
				if (narrowed.axis === 'tag') return `#${tagLine?.name ?? narrowed.tag}`;
				return narrowed.memberId === userId
					? t('home.you')
					: (members.find((member) => member.id === narrowed.memberId)?.name ?? '');
			})
			.join(' · ')
	);
	const FILTER_SHEET = 'stream-filter-sheet';
	// Colour, border and weight come whole from one of the two looks, never a static utility
	// beside a conditional one on the same property — stylesheet order would pick the winner.
	const PILL =
		'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors';
	const PILL_OFF = 'border-border bg-card font-medium text-fg-muted hover:text-fg';
	const PILL_ON = 'border-primary/45 bg-primary-soft font-semibold text-fg';
	const CHIP_ROW = 'flex flex-wrap items-center gap-1';
	const CHIP =
		'rounded-full px-3 py-1 text-sm font-medium text-fg-muted transition-colors hover:text-fg aria-[current=true]:bg-primary-soft aria-[current=true]:font-semibold aria-[current=true]:text-fg';
	// Words on a tint, and labels that carry content, are written in --fg / --fg-muted: in Latte
	// --primary on its own tint and --fg-subtle on the page ground both fall below AA (docs/05 §5.6).
	// The row's label is quiet sentence case, part of the control: the uppercase label is kept
	// for dividers inside a list (docs/05 §5.3).
	const CHIP_ROW_LABEL = 'mr-1 min-w-10 text-sm font-medium text-fg-muted';
</script>

<!-- Below md the rows would wrap to several lines and push the stream past the fold, so they
     fold into one pill and a sheet (docs/05 §5.5). The sheet is a native popover: the pill opens
     it, a tap outside, Escape or *Done* closes it, all without JavaScript, and the chips inside
     stay the same links. -->
<div class="flex min-w-0 items-center gap-2.5 md:hidden" data-testid="stream-filter-pill">
	<button
		type="button"
		popovertarget={FILTER_SHEET}
		aria-label={t('home.filter.pillLabel', { count: pill.count })}
		class="{PILL} {pill.highlighted ? PILL_ON : PILL_OFF}"
	>
		<Icon name="filter" size={15} />
		{t('home.filter.pill')}
		{#if pill.count}
			<span
				class="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-fg tabular-nums"
				>{pill.count}</span
			>
		{/if}
	</button>
	{#if pill.narrowedTo.length}
		<span class="min-w-0 truncate text-[13px] text-fg-muted">{pillSummary}</span>
	{/if}
</div>
<div
	id={FILTER_SHEET}
	popover="auto"
	role="dialog"
	aria-labelledby="{FILTER_SHEET}-title"
	data-sveltekit-noscroll
	class="inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-[20px] bg-bg px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-[3px] md:hidden"
>
	<h2 id="{FILTER_SHEET}-title" class="mb-3 text-base font-semibold">
		{t('home.filter.label')}
	</h2>
	<div class="flex flex-col gap-3">
		{@render filterRows()}
	</div>
	<div class="mt-4 flex items-center justify-between">
		{#if filtered}
			<a href={streamFilterHref(NO_FILTER)} class="text-sm text-link hover:underline"
				>{t('home.filter.clear')}</a
			>
		{/if}
		<Button
			variant="secondary"
			class="ml-auto"
			popovertarget={FILTER_SHEET}
			popovertargetaction="hide"
		>
			{t('home.filter.done')}
		</Button>
	</div>
</div>
<nav
	class="flex flex-col gap-1.5 max-md:hidden"
	aria-label={t('home.filter.label')}
	data-testid="stream-filter"
	data-sveltekit-noscroll
>
	{@render filterRows()}
</nav>
{#if tagLine}
	<p class="text-sm text-fg-muted" aria-live="polite" data-testid="stream-tag-line">
		{t('journal.tags.filtered', { count: tagLine.count, name: tagLine.name })}<span
			class="mx-1.5"
			aria-hidden="true">·</span
		><a
			href={streamFilterHref(withTag(filter, null))}
			class="text-link underline"
			data-sveltekit-noscroll>{t('journal.tags.showAll')}</a
		>
	</p>
{/if}

{#snippet filterRows()}
	<div class={CHIP_ROW}>
		<span class={CHIP_ROW_LABEL}>{t('home.filter.kind')}</span>
		{@render chip(t('home.filter.kind.all'), withKind(filter, null), filter.kind === null)}
		{#each STREAM_KINDS as kind (kind)}
			{@render chip(t(KIND_LABEL[kind]), withKind(filter, kind), filter.kind === kind)}
		{/each}
	</div>
	{#if offersMemberChoice(members)}
		<div class={CHIP_ROW}>
			<span class={CHIP_ROW_LABEL}>{t('home.filter.member')}</span>
			{@render chip(
				t('home.filter.member.all'),
				{ ...filter, memberId: null },
				filter.memberId === null
			)}
			{#each members as member (member.id)}
				{@render chip(
					member.id === userId ? t('home.you') : member.name,
					{ ...filter, memberId: member.id },
					filter.memberId === member.id
				)}
			{/each}
		</div>
	{/if}
	{#if tagChips.length}
		<!-- Choosing a tag narrows to moments, the only kind that carries one (docs/02 §2.20.2). -->
		<div class="{CHIP_ROW} gap-y-1.5" data-testid="stream-filter-tags">
			<span class={CHIP_ROW_LABEL}>{t('home.filter.tag')}</span>
			{@render chip(t('journal.tags.all'), withTag(filter, null), filter.tag === null)}
			{#each tagChips as tag (tag.key)}
				<TagChip
					{tag}
					href={streamFilterHref(withTag(filter, tag.key))}
					current={filter.tag === tag.key}
				/>
			{/each}
			<a href={TAGS_PAGE} class="px-2 text-sm font-medium text-link hover:underline"
				>{t('journal.tags.allTags')}</a
			>
		</div>
	{/if}
{/snippet}

{#snippet chip(label: string, target: StreamFilter, current: boolean)}
	<a href={streamFilterHref(target)} class={CHIP} aria-current={current ? 'true' : undefined}
		>{label}</a
	>
{/snippet}
