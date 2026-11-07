<script lang="ts">
	import type { ExplorerEvent, ExplorerState } from '$lib/graph/explorer-state';
	import { currentViewOf } from '$lib/graph/explorer-look';
	import type { GraphModel } from '$lib/graph/model/types';
	import type { ViewSwitches } from '$lib/graph/view-switches';
	import type { ExplorerView } from './explorer-view.svelte';
	import type { FrameFullscreen } from './frame-fullscreen.svelte';
	import GraphArrangeMenu from './GraphArrangeMenu.svelte';
	import GraphFilterMenu from './GraphFilterMenu.svelte';
	import GraphFindField from './GraphFindField.svelte';
	import GraphViewButtons from './GraphViewButtons.svelte';

	/*
	 * The explorer's toolbar, floating over the top of the canvas: finding a person, the Filter
	 * and Arrange menus, and the view buttons. Its element and height are bound, since framing
	 * the map leaves the strip it takes free.
	 */
	let {
		graph,
		compact,
		ui,
		view,
		openingFilters,
		peekOpen,
		screen,
		onShrink,
		onReveal,
		onExport,
		dispatch,
		element = $bindable(),
		height = $bindable(0)
	}: {
		graph: GraphModel;
		compact: boolean;
		ui: ExplorerState;
		view: ExplorerView;
		openingFilters: ReadonlySet<string>;
		/** A peek panel stands beside the map, so the chips keep clear of it. */
		peekOpen: boolean;
		screen: FrameFullscreen;
		onShrink?: () => void;
		onReveal: (id: string) => void;
		onExport: () => void;
		dispatch: (event: ExplorerEvent) => Promise<void>;
		element?: HTMLDivElement;
		height?: number;
	} = $props();

	// One derived per field, so an event that changes one of them re-runs only what reads that one.
	const active = $derived(ui.active);
	const switches = $derived(ui.switches);
	const density = $derived(ui.density);
	const savedViews = $derived(ui.savedViews);
	const currentView = $derived(currentViewOf(ui));
	const arrangedBy = $derived(ui.arrangedBy);
	const pathMode = $derived(ui.pathMode);

	const flipSwitch = (name: keyof ViewSwitches) =>
		dispatch({ type: 'switchFlipped', name, rolesInstead: view.rolesInstead });
</script>

<!-- It keeps clear of the peek panel while that is open: the chips wrap on a narrow window, and
     the row that wraps would otherwise slide underneath it — leaving the button under there
     unclickable. -->
<div
	bind:this={element}
	bind:clientHeight={height}
	class="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-center gap-2 transition-[padding]"
	class:lg:pr-[17rem]={peekOpen}
>
	<!-- Above the chips: on a narrow window the chip row wraps under the field, and the
	     suggestion list would otherwise be hidden behind it. Embedded, there is nobody to
	     find: the map holds one person's neighbourhood and the page has its own search. -->
	{#if !compact}
		<GraphFindField {graph} {onReveal} />
	{/if}

	<GraphFilterMenu
		{active}
		{openingFilters}
		onToggleFilter={(key) => dispatch({ type: 'filterToggled', key })}
		switches={{ ...switches, edgeLabels: view.labelsSwitch }}
		onSwitch={flipSwitch}
		labelsFit={view.labelsFit}
		rolesInstead={view.rolesInstead}
		{density}
		onChooseDensity={(next) => dispatch({ type: 'densityChosen', density: next })}
		{savedViews}
		{currentView}
		onApplyView={(view) => dispatch({ type: 'viewApplied', view })}
		onSaveView={(name) => dispatch({ type: 'viewSaved', name })}
		onDeleteView={(name) => dispatch({ type: 'viewDeleted', name })}
	/>

	<GraphArrangeMenu {arrangedBy} onArrange={(key) => dispatch({ type: 'arranged', key })} />

	<GraphViewButtons
		{compact}
		{onShrink}
		exportable={view.exportable}
		{onExport}
		{screen}
		{pathMode}
		onTogglePath={() => dispatch({ type: 'pathToggled' })}
	/>
</div>
