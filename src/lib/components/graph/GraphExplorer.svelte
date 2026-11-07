<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { addParentPath } from '$lib/people/sections';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import {
		escapeLetsGo,
		explorerAfter,
		explorerAtOpen,
		type ExplorerCommand,
		type ExplorerEvent
	} from '$lib/graph/explorer-state';
	import { treeRelaidFor } from '$lib/graph/tree-view';
	import { createExplorer, type ExplorerController } from '$lib/graph/cytoscape/explorer';
	import { buildStylesheet } from '$lib/graph/cytoscape/stylesheet';
	import { paletteFromDom } from '$lib/graph/cytoscape/theme';
	import { findConnectionPath } from '$lib/graph/model/connection-path';
	import { circleRoles } from '$lib/graph/model/ego-network';
	import { canExpand } from '$lib/graph/model/rings';
	import { withoutDerivedLinks } from '$lib/graph/model/graph-model';
	import { inMemoryGraphSource } from '$lib/graph/model/in-memory-source';
	import { isParentSlot, withParentSlots } from '$lib/graph/model/missing-parents';
	import { openingFilterKeys } from '$lib/graph/model/view-filters';
	import type { ArrangementKey } from '$lib/graph/layout/arrangements';
	import { circleClustersLayout } from '$lib/graph/layout/circle-clusters';
	import { familyTreeLayout } from '$lib/graph/layout/family-tree';
	import { DEFAULT_NODE_SIZE } from '$lib/graph/layout/geometry';
	import { spacingFor } from '$lib/graph/layout/density';
	import type { GraphModel } from '$lib/graph/model/types';
	import { exploredMap } from './explored-map.svelte';
	import { explorerView } from './explorer-view.svelte';
	import { frameFullscreen } from './frame-fullscreen.svelte';
	import { loadKeptPreferences, type PreferenceStores } from './kept-preferences';
	import { watchTheme } from './theme-watch';
	import GraphAlone from './GraphAlone.svelte';
	import GraphCanvas from './GraphCanvas.svelte';
	import GraphExportDialog from './GraphExportDialog.svelte';
	import GraphPeek from './GraphPeek.svelte';
	import GraphToolbar from './GraphToolbar.svelte';

	interface Props {
		/**
		 * The graph this explorer may reach: the whole visible household on the explorer route,
		 * one person's slice on their page. Delivered once by the server; explored entirely
		 * client-side.
		 */
		graph: GraphModel;
		centerId: string | null;
		/**
		 * Embedded in somebody's page rather than filling the route: the toolbar drops what is
		 * about travelling the household (finding a person elsewhere), because the page it sits
		 * on is about one person (docs/05 §5.5).
		 */
		compact?: boolean;
		/**
		 * How far from the centre the map may grow. A node on the last ring cannot be expanded;
		 * its peek panel offers the full graph instead. `Infinity` on the explorer route, where
		 * walking the household is the point.
		 */
		maxRings?: number;
		/** Where "Open in the graph" leads from the peek panel; absent hides it. */
		fullGraphHref?: (nodeId: string) => string;
		/**
		 * Trace the chain from the centre to this person as soon as the canvas is up. A
		 * person's page asks for this when somebody wanted to know how they are connected to
		 * somebody the page's own two hops do not reach (docs/05 §5.5).
		 */
		tracePathTo?: string | null;
		/**
		 * Open straight into full screen. A phone shows a person's map as a small preview, and
		 * tapping it means "show me the map" (docs/05 §5.5) — the frame is mounted for that tap,
		 * so it asks while the tap still counts as the reader's own gesture.
		 */
		startFullscreen?: boolean;
		/** Told when full screen is left, so a preview can take the frame's place again. */
		onFullscreenExit?: () => void;
		/**
		 * A phone's map enlarged inside a person's card asks to be a preview again. Given, the
		 * toolbar carries a *Shrink map* icon just left of full screen — inside the map, where
		 * the preview's own *Enlarge map* sits (docs/05 §5.5).
		 */
		onShrink?: () => void;
		/** Told once the canvas has drawn itself, so a picture standing in for it can fade out. */
		onReady?: () => void;
		/**
		 * The reader may add a relationship (the access layer's `canAddRelationshipTo`, decided by
		 * the page): the family tree around a person then offers a slot for each missing parent
		 * up their line (docs/02 §2.7).
		 */
		mayAddParents?: boolean;
	}
	let {
		graph,
		centerId,
		compact = false,
		maxRings = Number.POSITIVE_INFINITY,
		fullGraphHref,
		tracePathTo = null,
		startFullscreen = false,
		onFullscreenExit,
		onShrink,
		onReady,
		mayAddParents = false
	}: Props = $props();

	const t = useTranslate();

	// The snapshot is a prop, not a constant: a person's page hands a fresh one over after a
	// save, and the map follows it (see the resync effect below).
	const source = $derived(inMemoryGraphSource(graph));
	// Path finding travels stored links only: a derived edge names a chain rather than being
	// one, so hopping it would answer "how do we know each other?" with the label (docs/02 §2.7).
	const pathSource = $derived(inMemoryGraphSource(withoutDerivedLinks(graph)));

	const reducedMotion =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	let frame: HTMLDivElement;
	let container = $state<HTMLDivElement>();
	let controller: ExplorerController | null = null;
	let ready = $state(false);

	const explored = exploredMap(() => source);
	/*
	 * Who is selected and why, the path being picked, how the map is looked at, and what the
	 * canvas last heard of full screen: the transitions are `explorer-state.ts`, and this
	 * component carries out the commands they hand back. Raw, and read through one derived per
	 * field, so an event that changes one of them re-runs only what reads that one.
	 */
	let ui = $state.raw(untrack(() => explorerAtOpen({ centerId, compact })));
	const selected = $derived(ui.selected);
	const pathMode = $derived(ui.pathMode);
	const path = $derived(ui.path);
	const density = $derived(ui.density);
	const arrangedBy = $derived(ui.arrangedBy);
	const roleOptions = $derived(ui.circleRoles.options);
	const chosenRoles = $derived(ui.circleRoles.chosen);
	const openingFilters = openingFilterKeys(untrack(() => compact));

	/** Where this browser keeps the reader's habits, once loaded (`kept-preferences.ts`). */
	let stores: PreferenceStores = {};

	/** Moves the state on, then carries out what it asks for; settles once all of it has. */
	async function dispatch(event: ExplorerEvent): Promise<void> {
		// Untracked: an effect that dispatches must not come to depend on the state it writes, nor
		// on whatever a command reads on its way.
		const step = explorerAfter(
			untrack(() => ui),
			event
		);
		ui = step.state;
		await Promise.all(untrack(() => step.commands.map(carryOut)));
	}

	async function carryOut(command: ExplorerCommand): Promise<void> {
		switch (command.kind) {
			case 'expand':
				return expand(command.id);
			case 'tracePath': {
				const found = await findConnectionPath(pathSource, command.from, command.to);
				if (found) explored.merge(found.model);
				return dispatch({ type: 'pathTraced', path: found });
			}
			case 'arrange':
				// Leaving the tree may bring the groups back; they settle the map themselves (see below).
				settledForGroups = false;
				await tick();
				if (!settledForGroups) arrangeNow(command.key);
				return;
			case 'keepSwitch':
				return stores.switches?.save(command.name, command.on);
			case 'keepDensity':
				return stores.density?.save(command.density);
			case 'respace':
				// A new density re-runs the free arrangement, since that is the shape it describes; the
				// tree and the circles measure every name already, and only the next expand follows it.
				controller?.setSpacing(spacingFor(command.density));
				if (command.rearrange) controller?.arrange();
				return;
			case 'keepViews':
				return stores.views?.save(command.views);
			case 'leftFullscreen':
				return onFullscreenExit?.();
			case 'screenChanged':
				return controller?.screenChanged();
		}
	}

	// What the map shows, worked out from what was opened up and how it is looked at.
	const view = explorerView(
		{
			graph: () => graph,
			model: () => explored.model,
			ui: () => ui,
			centerId: () => centerId,
			compact: () => compact,
			maxRings: () => maxRings,
			mayAddParents: () => mayAddParents
		},
		t
	);
	// The tree goes out as it is shown, in the tree arrangement only (docs/02 §2.7).
	let exporting = $state(false);

	/*
	 * The selected circle's roles, fetched for the peek panel to choose which of them the next
	 * expansion opens (`explorer-state.ts` drops an answer for a circle since left). A primitive,
	 * so growing the model (which may hand back new node objects) doesn't reset it.
	 */
	const peekCircleId = $derived(view.peekNode?.kind === 'circle' ? view.peekNode.id : null);
	$effect(() => {
		const circleId = peekCircleId;
		void dispatch({ type: 'circlePeeked', circleId });
		if (circleId === null) return;
		void source.neighborhood(circleId).then((hood) => {
			if (hood) void dispatch({ type: 'circleRolesArrived', circleId, options: circleRoles(hood) });
		});
	});
	/** The snapshot the model on screen was built from; a different one means resync. */
	let synced = untrack(() => graph);

	/*
	 * Follow a new snapshot. A person's page re-runs its load after every save (a relationship
	 * added, retyped or removed), so the map above the list shows the same links the list
	 * does — without a reload, and keeping whatever the reader had expanded (docs/05 §5.5).
	 */
	$effect(() => {
		const next = graph;
		// `synced` is a plain variable on purpose: reading it here must not make this effect
		// depend on it, or assigning it below would re-run the effect forever.
		if (next === synced) return;
		synced = next;
		void resync();
	});

	async function resync() {
		if (!centerId) return;
		void dispatch({ type: 'snapshotChanged' });
		const nodeIds = await explored.rebuild(centerId);
		void dispatch({ type: 'rebuilt', nodeIds });
	}

	/*
	 * Who stood in which group when the canvas last took the map in. Someone joining a group —
	 * grouping switched on, a circle expanded — needs the map settled afresh, because a group's
	 * members must stand together and newcomers are set down one by one (docs/02 §2.7).
	 */
	let placedInGroups = new Map<string, string>();
	/** Set when joining a group settled the map, so an arrangement asked for then is not run twice. */
	let settledForGroups = false;
	/** Who the canvas held when it last took the map in, so the tree knows when somebody came. */
	let onCanvas = new Set<string>();
	// Push the full (expanded) element set to the renderer whenever the model grows.
	$effect(() => {
		const els = view.elements();
		const groupOf = view.grouping?.groupOf ?? new Map<string, string>();
		const arranged = arrangedBy;
		if (!ready || !controller) return;
		const nodeIds = new Set(els.filter((e) => e.group === 'nodes').map((e) => e.data.id as string));
		// In the family tree an expand lays the whole tree out again (`tree-view.ts`). A slot is
		// nobody arriving: it relays the tree, but leaves the selection as the reader left it.
		const people = new Set([...nodeIds].filter((id) => !isParentSlot(id)));
		const arrival = treeRelaidFor(arranged, onCanvas, people);
		const slotsCame = [...nodeIds].some((id) => isParentSlot(id) && !onCanvas.has(id));
		onCanvas = nodeIds;
		controller.setGraph(els, { arrangedNext: arrival || slotsCame });
		const joined = [...groupOf].some(([id, group]) => placedInGroups.get(id) !== group);
		placedInGroups = groupOf;
		if (joined || slotsCame) settledForGroups = true;
		if (arrival) void dispatch({ type: 'treeRelaid' });
		if (joined || arrival || slotsCame) untrack(() => arrangeNow(arrangedBy));
	});
	// Apply filtering as show/hide (no re-layout).
	$effect(() => {
		const { nodes, edges } = view.shownIds();
		if (!ready || !controller) return;
		controller.setVisible(nodes, edges);
	});
	// A group dissolved, or grouping switched off, takes its selection with it.
	$effect(() => {
		const groupIds = new Set(view.grouping?.groups.map((g) => g.id));
		void dispatch({ type: 'groupsDrawn', groupIds });
	});
	// Selection / path highlighting.
	$effect(() => {
		if (!ready || !controller) return;
		if (path) controller.highlightPath(path.nodeIds);
		else controller.highlightNeighborhood(selected);
	});
	// Naming every line is a re-style, not a re-layout.
	$effect(() => {
		const sheet = stylesheet();
		const growNames = !view.rolesInstead;
		if (!ready || !controller) return;
		controller.setStylesheet(sheet, { growNames });
	});

	const onTapNode = (id: string) =>
		isParentSlot(id)
			? openSlot(id)
			: dispatch({
					type: 'tapped',
					id,
					isGroup: view.grouping?.groups.some((g) => g.id === id) ?? false
				});

	/*
	 * A slot opens the child's page with the relationship form on *Child of* (docs/02 §2.7).
	 * Full screen is left first, or the form would open underneath the map.
	 */
	async function openSlot(id: string) {
		const slot = view.slots.find((s) => s.id === id);
		if (!slot) return;
		if (screen.on) await screen.toggle();
		await goto(addParentPath(slot.childId));
	}
	const onTapBackground = () => dispatch({ type: 'tappedBackground' });

	async function expand(id: string) {
		// The embedded map is one person's neighbourhood, not a way into the whole household:
		// past its last ring the reader is sent to the explorer route instead (docs/02 §2.7).
		if (centerId !== null && !canExpand(view.rings, id, maxRings)) return;
		// Until the circle's roles have arrived there is nothing to narrow by: open it whole.
		const narrowed = peekCircleId === id && roleOptions.length > 0;
		await explored.expand(
			id,
			narrowed
				? { chosen: new Set(chosenRoles), all: new Set(roleOptions.map((o) => o.role)) }
				: undefined
		);
	}

	async function reveal(id: string) {
		await explored.reveal(id);
		void dispatch({ type: 'found', id });
		controller?.focus(id);
	}

	function arrangeNow(key: ArrangementKey) {
		const canvas = controller;
		if (!canvas) return;
		if (key === 'force') return canvas.arrange();
		// The room each node really takes, its name included; a node the canvas is not drawing
		// (filtered out) has none to measure, and is given the usual room.
		const sizeOf = (id: string) => {
			const size = canvas.sizeOf(id);
			return size.width > 0 ? size : DEFAULT_NODE_SIZE;
		};
		if (key === 'tree') {
			// The slots stand in as parents, so their generation's row makes room for them.
			canvas.arrangeAt(familyTreeLayout(withParentSlots(view.drawnVisible, view.slots), sizeOf), {
				outsideFamily: t('graph.tree.outsideFamily'),
				keepNamesDrawn: true
			});
			return;
		}
		canvas.arrangeAt(circleClustersLayout(view.drawn, sizeOf, view.grouping ?? undefined));
	}

	// The one place a stylesheet is built: theme changes and the label toggle share it, so
	// re-theming can never drop the toggle and vice versa.
	function stylesheet() {
		return buildStylesheet(paletteFromDom(), {
			edgeLabels: view.labelsFit,
			reducedMotion,
			familyTree: view.rolesInstead
		});
	}

	function retheme() {
		controller?.setStylesheet(stylesheet(), { growNames: !view.rolesInstead });
	}

	let stopWatchingTheme: (() => void) | null = null;
	/*
	 * Mounting is asynchronous — the ego network, a traced chain, and the ~400 KB engine are all
	 * awaited — and a page can be left before any of that lands. The component is then already
	 * destroyed when the canvas would be built, so the teardown has to be remembered: otherwise
	 * a live Cytoscape instance is left animating against a container nobody can see any more.
	 */
	let disposed = false;

	/*
	 * The toolbar floats over the top of the canvas; framing the map leaves that strip free, so
	 * the top row of a family tree is not drawn underneath the chips. It wraps to more rows on a
	 * narrow window, hence measured rather than assumed.
	 */
	let toolbar = $state<HTMLDivElement>();
	let toolbarHeight = $state(0);
	const toolbarBottom = () => (toolbar ? toolbar.offsetTop + toolbarHeight : 0);
	$effect(() => {
		const inset = toolbarBottom();
		if (!ready || !controller) return;
		controller.setTopInset(inset);
	});
	/*
	 * The peek panel floats beside the map on a wide window and along its foot below `lg`. The
	 * next framing — the family tree after an expand — keeps the map clear of it, so nobody it
	 * brought in lands underneath. Read from the layout, not the screen, so a panel still
	 * sliding in is measured where it will stand.
	 */
	const peekOpen = $derived((view.peekNode !== null || view.peekGroup !== null) && !pathMode);
	$effect(() => {
		const open = peekOpen;
		if (!ready || !controller) return;
		void tick().then(() => {
			const panel = open ? frame.querySelector<HTMLElement>('aside') : null;
			if (!panel) {
				controller?.setCovered({ right: 0, bottom: 0 });
				return;
			}
			const beside = panel.offsetLeft > frame.clientWidth / 2;
			controller?.setCovered(
				beside
					? { right: frame.clientWidth - panel.offsetLeft, bottom: 0 }
					: { right: 0, bottom: frame.clientHeight - panel.offsetTop }
			);
		});
	});

	const screen = frameFullscreen(() => frame);
	const overlay = $derived(screen.on && screen.usesCss);
	/*
	 * Leaving full screen is told to the page, so a preview can take the frame's place again;
	 * entering or leaving it gives the map a different room, which the canvas frames afresh once
	 * it has resized, unless the reader has moved the view (docs/05 §5.8).
	 */
	$effect(() => {
		void dispatch({ type: 'screen', on: screen.on, canvasReady: ready && controller !== null });
	});

	onMount(async () => {
		// Before anything is awaited: a browser grants full screen only close to the tap.
		if (startFullscreen) void screen.toggle();
		// Build the initial ego view around the centre from the in-memory snapshot.
		if (centerId) await explored.open(centerId);

		// A link may arrive with the question already asked (docs/05 §5.5): trace it before the
		// canvas is built, so the chain is what the first layout lays out rather than a jump.
		if (centerId && tracePathTo) {
			const found = await findConnectionPath(pathSource, centerId, tracePathTo);
			if (found) explored.merge(found.model);
			void dispatch({ type: 'tracedOnOpen', path: found });
		}

		if (disposed) return;

		const loaded = loadKeptPreferences(() => localStorage);
		stores = loaded.stores;
		const kept = loaded.kept;
		void dispatch({ type: 'preferencesLoaded', kept });

		// Bound by the canvas as it mounts, which is before this runs.
		if (!container) throw new Error('The graph canvas has no element to draw into.');
		const explorer = await createExplorer({
			container,
			elements: view.elements(),
			stylesheet: stylesheet(),
			reducedMotion,
			topInset: toolbarBottom(),
			spacing: spacingFor(density),
			onTapNode,
			onTapBackground
		});
		if (disposed) {
			explorer.destroy();
			return;
		}
		controller = explorer;
		placedInGroups = view.grouping?.groupOf ?? new Map();
		onCanvas = new Set(
			view
				.elements()
				.filter((e) => e.group === 'nodes')
				.map((e) => e.data.id as string)
		);
		const shown = view.shownIds();
		controller.setVisible(shown.nodes, shown.edges);
		controller.highlightNeighborhood(selected);
		ready = true;
		onReady?.();

		stopWatchingTheme = watchTheme(retheme);
	});

	onDestroy(() => {
		disposed = true;
		stopWatchingTheme?.();
		controller?.destroy();
	});
</script>

<div
	bind:this={frame}
	class="h-full w-full overflow-hidden bg-bg"
	class:relative={!overlay}
	class:fixed={overlay}
	class:inset-0={overlay}
	class:z-50={overlay}
	data-testid="graph-frame"
>
	<GraphCanvas
		bind:container
		{ready}
		{selected}
		{centerId}
		grouping={view.grouping}
		groupLabel={view.groupLabel}
		nameOf={view.canvasNameOf}
		hidden={view.hidden}
		positions={() => controller?.positions() ?? new Map()}
		markCursor={(id) => controller?.markCursor(id)}
		onActivate={onTapNode}
		onClear={() => dispatch({ type: 'cleared' })}
		clearable={escapeLetsGo(ui)}
	/>

	<!-- Out of the way while a peek panel is open. -->
	{#if ready && view.lonelyCentre && !selected}
		<GraphAlone centre={view.lonelyCentre} />
	{/if}

	<GraphToolbar
		bind:element={toolbar}
		bind:height={toolbarHeight}
		{graph}
		{compact}
		{ui}
		{view}
		{openingFilters}
		{peekOpen}
		{screen}
		{onShrink}
		onReveal={reveal}
		onExport={() => (exporting = true)}
		{dispatch}
	/>

	<GraphPeek
		{ui}
		{view}
		nodes={explored.model.nodes}
		{compact}
		onExpand={expand}
		{fullGraphHref}
		{dispatch}
	/>

	<!-- Mounted only while asked for, so no preview is drawn behind a closed dialog. -->
	{#if exporting}
		<GraphExportDialog
			bind:open={exporting}
			defaultTitle={view.exportTitle}
			privateCount={view.privateCount}
			sceneFor={view.exportSceneFor}
			edgeLabels={view.labelsFit}
			outsideFamily={t('graph.tree.outsideFamily')}
		/>
	{/if}
</div>
