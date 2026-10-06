<script lang="ts">
	import MenuButton from '$lib/components/MenuButton.svelte';
	import { filterSummary } from '$lib/menu/menu';
	import { categoryVar } from '$lib/design/tokens';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { DENSITIES, type Density } from '$lib/graph/layout/density';
	import { EDGE_LABEL_LIMIT } from '$lib/graph/layout/legibility';
	import type { SavedView } from '$lib/graph/model/saved-views';
	import type { FilterKey } from '$lib/graph/model/view-filters';
	import type { ViewSwitches } from '$lib/graph/view-switches';
	import GraphSavedViews from './GraphSavedViews.svelte';
	import { MENU_ITEM } from './menu-item';

	/*
	 * The Filter menu: the kinds of line and their names live in one menu. It is the legend
	 * too, each kind drawn in its colour and line style (docs/05 §5.8).
	 */
	interface Props {
		/** The kinds of line switched on. */
		active: ReadonlySet<string>;
		/** What the map opened with, so the pill only stands out once the reader narrowed it. */
		openingFilters: ReadonlySet<string>;
		onToggleFilter: (key: FilterKey) => void;
		switches: ViewSwitches;
		onSwitch: (name: keyof ViewSwitches) => void;
		/** Whether every line is named right now; false while there are too many to name. */
		labelsFit: boolean;
		density: Density;
		onChooseDensity: (density: Density) => void;
		/** The views this device keeps, and the one the map shows now (docs/02 §2.7). */
		savedViews: readonly SavedView[];
		currentView: string | null;
		onApplyView: (view: SavedView) => void;
		onSaveView: (name: string) => void;
		onDeleteView: (name: string) => void;
	}
	let {
		active,
		openingFilters,
		onToggleFilter,
		switches,
		onSwitch,
		labelsFit,
		density,
		onChooseDensity,
		savedViews,
		currentView,
		onApplyView,
		onSaveView,
		onDeleteView
	}: Props = $props();

	const t = useTranslate();
	const uid = $props.id();

	// The filterable connection kinds, each tied to its category colour (docs/05 §5.6).
	// Each filter carries the same token the canvas draws that edge kind with (docs/05 §5.6),
	// so a chip and the line it toggles can never drift apart.
	// Each chip also draws its line style, so the chips are the legend (docs/05 §5.8).
	const FILTERS = [
		{
			key: 'family',
			label: 'relationships.category.family',
			token: categoryVar('family'),
			line: 'solid'
		},
		{
			key: 'romantic',
			label: 'relationships.category.romantic',
			token: categoryVar('romantic'),
			line: 'solid'
		},
		{
			key: 'social',
			label: 'relationships.category.social',
			token: categoryVar('social'),
			line: 'solid'
		},
		{
			key: 'professional',
			label: 'relationships.category.professional',
			token: categoryVar('professional'),
			line: 'solid'
		},
		{
			key: 'circles',
			label: 'graph.filter.circles',
			token: 'var(--edge-membership)',
			line: 'dashed'
		},
		{ key: 'kinship', label: 'graph.filter.kinship', token: 'var(--edge-kinship)', line: 'dotted' }
	] as const;

	const filters = $derived(
		filterSummary(
			active,
			FILTERS.map((f) => f.key),
			openingFilters
		)
	);
</script>

<!-- The switch on the right of a menu row; the row itself carries the state for assistive tech. -->
{#snippet toggle(on: boolean)}
	<span
		class="relative h-4 w-7 shrink-0 rounded-full transition-colors"
		style="background:{on ? 'var(--primary)' : 'var(--border)'}"
		aria-hidden="true"
	>
		<span
			class="absolute top-0.5 size-3 rounded-full bg-card transition-[left]"
			style="left:{on ? '0.875rem' : '0.125rem'}"
		></span>
	</span>
{/snippet}

<!-- The line kinds and their names live in one menu: it is the legend too, each kind
     drawn in its colour and line style, and the pill counts what is shown so a narrowed
     map is never mistaken for a sparse one (docs/05 §5.8). -->
<MenuButton label={t('graph.filter.summary', filters)} highlighted={filters.narrowed}>
	{#snippet trigger()}
		{t('graph.filter')}
		<span class="rounded-full bg-bg-sunken px-1.5 text-fg-muted tabular-nums">
			{filters.shown}/{filters.total}
		</span>
	{/snippet}
	{#snippet children({ close })}
		<!-- First, so a saved way of looking is the nearest tap on a phone. Showing one ends the
		     choice, so the menu closes on the map it now shows. -->
		<GraphSavedViews
			views={savedViews}
			current={currentView}
			onApply={(view) => {
				onApplyView(view);
				close();
			}}
			onSave={onSaveView}
			onDelete={onDeleteView}
		/>
		<div role="separator" class="mx-1 my-1 border-t border-border"></div>
		<!-- Two to a row: a phone's thumb needs a 44px target, and six full-width rows that tall
		     pushed the rest of the menu off the screen. On is told by border, tint and weight,
		     not by colour alone. -->
		<div class="grid w-max min-w-full grid-cols-2 gap-1 px-0.5 py-0.5">
			{#each FILTERS as f (f.key)}
				<button
					type="button"
					role="menuitemcheckbox"
					aria-checked={active.has(f.key)}
					onclick={() => onToggleFilter(f.key)}
					class="flex min-h-9 items-center gap-2 rounded-lg border border-border px-2 text-left text-[13px] whitespace-nowrap text-fg-muted transition-colors hover:border-primary hover:text-fg aria-checked:border-primary aria-checked:bg-primary-soft aria-checked:font-semibold aria-checked:text-fg pointer-coarse:min-h-11"
				>
					<span
						class="inline-block w-4 shrink-0 border-t-2"
						style="border-color:{f.token};border-top-style:{f.line}"
						aria-hidden="true"
					></span>
					{t(f.label)}
				</button>
			{/each}
		</div>
		<div role="separator" class="mx-1 my-1 border-t border-border"></div>
		<button
			type="button"
			role="menuitemcheckbox"
			aria-checked={switches.edgeLabels}
			onclick={() => onSwitch('edgeLabels')}
			class={MENU_ITEM}
		>
			<span class="flex-1">
				{t('graph.labels')}
				<span class="block text-[11px] text-fg-subtle">
					{switches.edgeLabels && !labelsFit
						? t('graph.labels.tooMany', { count: EDGE_LABEL_LIMIT })
						: t('graph.labels.hint')}
				</span>
			</span>
			{@render toggle(switches.edgeLabels)}
		</button>
		{#if active.has('kinship')}
			<!-- Only means something while derived lines are drawn at all. -->
			<button
				type="button"
				role="menuitemcheckbox"
				aria-checked={switches.allKinship}
				onclick={() => onSwitch('allKinship')}
				class={MENU_ITEM}
			>
				<span class="flex-1">
					{t('graph.allKinship')}
					<span class="block text-[11px] text-fg-subtle">{t('graph.allKinship.hint')}</span>
				</span>
				{@render toggle(switches.allKinship)}
			</button>
		{/if}
		<button
			type="button"
			role="menuitemcheckbox"
			aria-checked={switches.groupRoles}
			onclick={() => onSwitch('groupRoles')}
			class={MENU_ITEM}
		>
			<span class="flex-1">
				{t('graph.groupByRole')}
				<span class="block text-[11px] text-fg-subtle">{t('graph.groupByRole.hint')}</span>
			</span>
			{@render toggle(switches.groupRoles)}
		</button>
		{#if switches.groupRoles}
			<!-- Belongs to the grouping, so it stands indented under it and only while it is on. -->
			<button
				type="button"
				role="menuitemcheckbox"
				aria-checked={switches.innerLinks}
				onclick={() => onSwitch('innerLinks')}
				class="{MENU_ITEM} pl-6"
			>
				<span class="flex-1">
					{t('graph.innerLinks')}
					<span class="block text-[11px] text-fg-subtle">{t('graph.innerLinks.hint')}</span>
				</span>
				{@render toggle(switches.innerLinks)}
			</button>
		{/if}
		<!-- How close together people stand; a choice of three, kept by this browser. -->
		<div role="separator" class="mx-1 my-1 border-t border-border"></div>
		<div role="group" aria-labelledby="{uid}-density">
			<div id="{uid}-density" class="px-2 pt-1 pb-0.5 text-[11px] text-fg-subtle">
				{t('graph.density')}
			</div>
			{#each DENSITIES as option (option)}
				<button
					type="button"
					role="menuitemradio"
					aria-checked={density === option}
					onclick={() => onChooseDensity(option)}
					class={MENU_ITEM}
				>
					<span class="w-3 shrink-0 font-bold text-primary" aria-hidden="true">
						{#if density === option}✓{/if}
					</span>
					<span class="flex-1">{t(`graph.density.${option}`)}</span>
				</button>
			{/each}
		</div>
	{/snippet}
</MenuButton>
