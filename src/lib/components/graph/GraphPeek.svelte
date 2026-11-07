<script lang="ts">
	import type { ExplorerEvent, ExplorerState } from '$lib/graph/explorer-state';
	import type { GraphNode } from '$lib/graph/model/types';
	import type { ExplorerView } from './explorer-view.svelte';
	import GraphGroupPeek from './GraphGroupPeek.svelte';
	import GraphNodePeek from './GraphNodePeek.svelte';
	import GraphPathPrompt from './GraphPathPrompt.svelte';

	/*
	 * What floats over the map about the selection: the path being picked while path mode is on,
	 * otherwise the peek panel of the selected group or person.
	 */
	let {
		ui,
		view,
		nodes,
		compact,
		onExpand,
		fullGraphHref,
		dispatch
	}: {
		ui: ExplorerState;
		view: ExplorerView;
		/** Everybody on the map, for a group's members. */
		nodes: GraphNode[];
		compact: boolean;
		onExpand: (id: string) => void;
		fullGraphHref?: (nodeId: string) => string;
		dispatch: (event: ExplorerEvent) => Promise<void>;
	} = $props();

	const pathMode = $derived(ui.pathMode);
	const roleOptions = $derived(ui.circleRoles.options);
	const chosenRoles = $derived(ui.circleRoles.chosen);
</script>

{#if pathMode}
	<GraphPathPrompt
		path={ui.path}
		pathMissing={ui.pathMissing}
		pathFrom={ui.pathFrom}
		nameOf={view.nameOf}
	/>
{:else if view.peekGroup}
	<GraphGroupPeek
		group={view.peekGroup}
		label={view.groupLabel(view.peekGroup)}
		{nodes}
		nameOf={view.nameOf}
		{compact}
		onShowIndividually={() => dispatch({ type: 'groupDissolved', id: view.peekGroup!.id })}
		onClose={() => dispatch({ type: 'peekClosed' })}
	/>
{:else if view.peekNode}
	<GraphNodePeek
		node={view.peekNode}
		{compact}
		withinReach={view.peekWithinReach}
		expandable={view.peekExpandable}
		{roleOptions}
		{chosenRoles}
		onToggleRole={(role) => dispatch({ type: 'roleToggled', role })}
		{onExpand}
		{fullGraphHref}
		onClose={() => dispatch({ type: 'peekClosed' })}
	/>
{/if}
