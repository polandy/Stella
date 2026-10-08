<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { addRelationshipPath } from '$lib/people/sections';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { kinshipLabel } from '$lib/kinship/labels';
	import { relationshipRowLabel } from '$lib/relationships/labels';
	import { roleTermLabel } from '$lib/relationships/roles';
	import { rolesTowards } from '$lib/graph/model/tree-roles';
	import { shelfCaptions } from '$lib/graph/model/shelf-captions';
	import { captionWords } from '$lib/graph/caption-words';
	import { familyLinksAmong } from '$lib/graph/model/generations';
	import { hiddenInTree } from '$lib/graph/model/tree-shown';
	import { selectionAsked, treeRelaidFor } from '$lib/graph/tree-view';
	import {
		explorerAfter,
		explorerAtOpen,
		type ExplorerCommand,
		type ExplorerEvent,
		type KeptPreferences
	} from '$lib/graph/explorer-state';
	import { currentViewOf, groupingApplies, labelsSwitchOf } from '$lib/graph/explorer-look';
	import { toCytoscapeElements } from '$lib/graph/cytoscape/elements';
	import { createExplorer, type ExplorerController } from '$lib/graph/cytoscape/explorer';
	import { buildStylesheet } from '$lib/graph/cytoscape/stylesheet';
	import { paletteFromDom } from '$lib/graph/cytoscape/theme';
	import { findConnectionPath } from '$lib/graph/model/connection-path';
	import {
		buildEgoNetwork,
		circleRoles,
		expandNode,
		rebuildExplored,
		rolesOpenAfter,
		type CircleRole
	} from '$lib/graph/model/ego-network';
	import { canExpand, hasLinks, ringsFrom } from '$lib/graph/model/rings';
	import { expandWouldAdd } from '$lib/graph/model/expand-offer';
	import { impliedKinshipEdgeIds } from '$lib/graph/model/implied-kinship';
	import {
		applyFilters,
		emptyModel,
		mergeModels,
		withoutDerivedLinks
	} from '$lib/graph/model/graph-model';
	import { inMemoryGraphSource } from '$lib/graph/model/in-memory-source';
	import {
		groupByRole,
		linksOfGrouped,
		type EdgeBundle,
		type RoleGroup
	} from '$lib/graph/model/role-groups';
	import { shownOnCanvas } from '$lib/graph/model/shown-on-canvas';
	import { graphFiltersFor, openingFilterKeys } from '$lib/graph/model/view-filters';
	import {
		savedViewsPreference,
		type SavedViewsPreference
	} from '$lib/graph/saved-views-preference';
	import type { ArrangementKey } from '$lib/graph/layout/arrangements';
	import { circleClustersLayout } from '$lib/graph/layout/circle-clusters';
	import { familyTreeLayout } from '$lib/graph/layout/family-tree';
	import { DEFAULT_NODE_SIZE } from '$lib/graph/layout/geometry';
	import { spacingFor } from '$lib/graph/layout/density';
	import { edgeLabelsFit, linesDrawn } from '$lib/graph/layout/legibility';
	import { hiddenNeighbourCounts } from '$lib/graph/model/hidden-neighbours';
	import { densityPreference, type DensityPreference } from '$lib/graph/density-preference';
	import {
		viewSwitchPreference,
		type ViewSwitchPreference,
		type ViewSwitches
	} from '$lib/graph/view-switches';
	import type { GraphEdge, GraphFilters, GraphModel } from '$lib/graph/model/types';
	import { frameFullscreen } from './frame-fullscreen.svelte';
	import GraphArrangeMenu from './GraphArrangeMenu.svelte';
	import GraphCanvas from './GraphCanvas.svelte';
	import GraphFilterMenu from './GraphFilterMenu.svelte';
	import GraphFindField from './GraphFindField.svelte';
	import GraphGroupPeek from './GraphGroupPeek.svelte';
	import GraphNodePeek from './GraphNodePeek.svelte';
	import GraphPathPrompt from './GraphPathPrompt.svelte';

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
		onReady
	}: Props = $props();

	const t = useTranslate();

	// A built-in relationship type reads in the viewer's language; a household's own type
	// reads as somebody typed it (docs/02 §2.19).
	const edgeLabel = (edge: GraphEdge): string => {
		if (edge.kin) return kinshipLabel(t, edge.kin);
		if (edge.typeKey)
			return relationshipRowLabel(t, { typeKey: edge.typeKey, label: edge.label ?? '' });
		return edge.label ?? '';
	};

	// All exploration runs against this in-memory source — no further requests to the server.
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

	// Starts empty; the ego view around the centre is built client-side on mount.
	let model = $state<GraphModel>(emptyModel());
	/*
	 * Who is selected and why, the path being picked, how the map is looked at, and what the
	 * canvas last heard of full screen: the transitions are `explorer-state.ts`, and this
	 * component carries out the commands they hand back. Raw, and read through one derived per
	 * field, so an event that changes one of them re-runs only what reads that one.
	 */
	let ui = $state.raw(untrack(() => explorerAtOpen({ centerId, compact })));
	const selected = $derived(ui.selected);
	const selectionCause = $derived(ui.selectionCause);
	const active = $derived(ui.active);
	const pathMode = $derived(ui.pathMode);
	const pathFrom = $derived(ui.pathFrom);
	const path = $derived(ui.path);
	const pathMissing = $derived(ui.pathMissing);
	const switches = $derived(ui.switches);
	const dissolved = $derived(ui.dissolved);
	const density = $derived(ui.density);
	const savedViews = $derived(ui.savedViews);
	const currentView = $derived(currentViewOf(ui));
	const arrangedBy = $derived(ui.arrangedBy);
	const roleOptions = $derived(ui.circleRoles.options);
	const chosenRoles = $derived(ui.circleRoles.chosen);
	const openingFilters = openingFilterKeys(untrack(() => compact));

	/*
	 * The habits this browser keeps (docs/05 §5.8, docs/02 §2.7): the Filter menu's switches,
	 * the density, and the saved views — named Filter-menu states, never the centre or anybody's
	 * position, since a view is how to look, not where.
	 */
	let switchStore: ViewSwitchPreference | null = null;
	let densityStore: DensityPreference | null = null;
	let viewStore: SavedViewsPreference | null = null;

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
				if (found) model = mergeModels(model, found.model);
				return dispatch({ type: 'pathTraced', path: found });
			}
			case 'arrange':
				// Leaving the tree may bring the groups back; they settle the map themselves (see below).
				settledForGroups = false;
				await tick();
				if (!settledForGroups) arrangeNow(command.key);
				return;
			case 'keepSwitch':
				return switchStore?.save(command.name, command.on);
			case 'keepDensity':
				return densityStore?.save(command.density);
			case 'respace':
				// A new density re-runs the free arrangement, since that is the shape it describes; the
				// tree and the circles measure every name already, and only the next expand follows it.
				controller?.setSpacing(spacingFor(command.density));
				if (command.rearrange) controller?.arrange();
				return;
			case 'keepViews':
				return viewStore?.save(command.views);
			case 'leftFullscreen':
				return onFullscreenExit?.();
			case 'screenChanged':
				return controller?.screenChanged();
		}
	}

	function buildFilters(): GraphFilters {
		return graphFiltersFor(active, centerId);
	}

	/*
	 * The family tree around a person says who everybody is to them under each name — Father,
	 * Grandmother — instead of naming every line (docs/05 §5.8). Around a circle there is nobody
	 * to be anybody's father, and the lines keep their names as in every other arrangement.
	 */
	const rolesInstead = $derived(
		arrangedBy === 'tree' &&
			centerId !== null &&
			graph.nodes.some((n) => n.id === centerId && n.kind === 'person')
	);
	const roles = $derived(rolesInstead && centerId ? rolesTowards(graph, centerId) : null);
	const shortNameOf = (id: string) => {
		const node = graph.nodes.find((n) => n.id === id);
		return node?.shortName ?? node?.label ?? id;
	};
	const roleOf = (id: string): string | undefined => {
		const role = roles?.get(id);
		if (role) return roleTermLabel(t, role.term, role.variant) ?? undefined;
		const caption = shelf?.get(id);
		return caption ? captionWords(t, caption, shortNameOf) : undefined;
	};

	const visible = $derived(applyFilters(model, buildFilters()));
	// Grouping reads what is shown, so the Circles chip off leaves no membership to group by;
	// the tree's rows are generations, which a group would only pull apart (docs/02 §2.7).
	const groupingOn = $derived(groupingApplies(ui));
	// Who is grouped depends only on the memberships shown; it decides whose links come along.
	const grouped = $derived(
		groupingOn
			? new Set(groupByRole(visible, { innerLinks: switches.innerLinks, dissolved }).groupOf.keys())
			: null
	);
	/*
	 * The map as drawn: what was opened up, plus the links of grouped people to anyone else on
	 * it. Opening a circle brings its members without their links to each other, and a group is
	 * about how its people belong together (docs/02 §2.7). The family tree likewise draws the
	 * family links among the people on it — the parents' marriage, both parents' lines to a
	 * child — or a map grown from one person would be a star rather than a tree (docs/05 §5.8).
	 */
	const drawn = $derived.by(() => {
		const onMap = () => new Set(model.nodes.map((n) => n.id));
		if (grouped && grouped.size > 0) {
			return mergeModels(model, { nodes: [], edges: linksOfGrouped(graph, onMap(), grouped) });
		}
		if (arrangedBy === 'tree') {
			return mergeModels(model, { nodes: [], edges: familyLinksAmong(graph, onMap()) });
		}
		return model;
	});
	const drawnVisible = $derived(drawn === model ? visible : applyFilters(drawn, buildFilters()));
	// The shelf beneath says who is who too: "Friend of Sandra", a circle's people on the map.
	const shelf = $derived(
		rolesInstead && centerId ? shelfCaptions(graph, drawnVisible, centerId) : null
	);
	/*
	 * The derived lines whose chain of entered links is on the map only repeat it, so they stay
	 * off unless the reader asks for every one of them (docs/02 §2.7). Read without the
	 * selection, so a bundle between two groups counts only the lines the map draws, and
	 * selecting someone neither rebuilds the canvas nor moves anybody.
	 */
	const leftOff = $derived(
		switches.allKinship ? new Set<string>() : impliedKinshipEdgeIds(drawnVisible)
	);
	const grouping = $derived(
		groupingOn
			? groupByRole(drawnVisible, { innerLinks: switches.innerLinks, dissolved, leftOff })
			: null
	);
	const groupLabel = (g: RoleGroup) =>
		t('graph.group.label', { role: g.role ?? t('circles.noRole'), count: g.memberIds.length });
	// The line to a group needs no count: the group's own name carries it.
	const bundleLabel = (b: EdgeBundle) =>
		b.kind === 'membership' ? '' : t('graph.bundle.count', { count: b.edgeIds.length });
	const elements = () =>
		toCytoscapeElements(drawn, {
			centerId: centerId ?? undefined,
			edgeLabel,
			hiddenNeighbours: hidden,
			grouping: grouping ? { grouping, groupLabel, bundleLabel } : undefined,
			roleOf
		});
	/*
	 * Every line is named only while the names fit (docs/05 §5.8); past that they pile up
	 * around a hub, and pointing at a line or selecting somebody names theirs. Counted without
	 * the selection, so selecting somebody never switches every name on or off.
	 */
	/*
	 * The Labels switch as it stands now: the reader's habit, or — in the tree around a person,
	 * where the roles under the names say it — the tree's own choice, off each time the tree is
	 * entered (`tree-view.ts`, docs/05 §5.8).
	 */
	const labelsSwitch = $derived(labelsSwitchOf(ui, rolesInstead));
	const flipSwitch = (name: keyof ViewSwitches) =>
		dispatch({ type: 'switchFlipped', name, rolesInstead });
	// The lines the tree leaves off are no more drawn than the left-off kinship.
	const treeLeftOff = $derived(
		arrangedBy === 'tree' ? hiddenInTree(drawnVisible, null) : new Set<string>()
	);
	const labelsFit = $derived(
		edgeLabelsFit(
			labelsSwitch,
			linesDrawn(
				drawnVisible.edges,
				grouping ? [leftOff, grouping.tucked, treeLeftOff] : [leftOff, treeLeftOff],
				grouping?.bundles.length ?? 0
			)
		)
	);
	// The same lines, but the selected person's own are drawn: selecting names every line. The
	// family tree also leaves off the lines its bars already draw, and the shelf's lines until
	// one end is selected (docs/05 §5.8); a traced path shows every line it runs along.
	const implied = $derived.by(() => {
		const left = switches.allKinship
			? new Set<string>()
			: impliedKinshipEdgeIds(drawnVisible, selected);
		if (arrangedBy !== 'tree') return left;
		const onPath = new Set(path?.model.edges.map((e) => e.id) ?? []);
		// Neither the centre the route opens with nor the person an expand just laid the tree out
		// around is a question the reader asked: their friends and circles stay unlinked until
		// somebody is tapped (`tree-view.ts`).
		const asked = selectionAsked(selectionCause) ? selected : null;
		for (const id of hiddenInTree(drawnVisible, asked, onPath)) left.add(id);
		return left;
	});
	/** What the canvas shows: the filtered map, plus the frames and bundles grouping adds. */
	const shownIds = () => shownOnCanvas(drawnVisible, implied, grouping);
	const peekGroup = $derived(
		selected ? (grouping?.groups.find((g) => g.id === selected) ?? null) : null
	);
	const nameOf = (id: string) => model.nodes.find((n) => n.id === id)?.label ?? id;
	const peekNode = $derived(selected ? (model.nodes.find((n) => n.id === selected) ?? null) : null);
	// How far each node sits from the centre, so the embedded map stops where it promises to.
	const rings = $derived(centerId ? ringsFrom(model, centerId) : new Map<string, number>());
	// Inside the map's reach, and with something left to open — Expand on somebody whose every
	// link is drawn already, or who has none, was a button that did nothing (docs/02 §2.7).
	const peekWithinReach = $derived(
		peekNode !== null && (centerId === null || canExpand(rings, peekNode.id, maxRings))
	);
	// The "+N" on a node that can still grow: who an expand would bring in under the current
	// filters, and none past the embedded map's last ring (docs/05 §5.8).
	const hidden = $derived(
		hiddenNeighbourCounts(graph, drawnVisible, {
			filters: buildFilters(),
			expandable: (id) => centerId === null || canExpand(rings, id, maxRings)
		})
	);
	// Expand is offered exactly when it would add something under the current filters: somebody
	// behind the "+N", or a line among people already shown — never a button that does nothing,
	// and never missing where a circle's roles are still to be drawn (docs/02 §2.7).
	const peekHasMore = $derived(
		peekNode !== null && expandWouldAdd(graph, drawn, peekNode.id, buildFilters())
	);
	const peekExpandable = $derived(peekWithinReach && peekHasMore);
	/*
	 * A centre linked to nobody draws one lonely dot. The explorer route says why and offers
	 * the step that changes it; an embedded map is never drawn for somebody without links.
	 */
	const lonelyCentre = $derived(
		!compact && centerId !== null && !hasLinks(graph, centerId)
			? (graph.nodes.find((n) => n.id === centerId) ?? null)
			: null
	);

	/*
	 * What the reader has opened up, in the order they did it. Kept so a fresh snapshot can be
	 * explored to the same extent instead of collapsing the map back to the first ring.
	 */
	let expandedIds = new Set<string>();
	/** For a circle opened up for some roles only, which — so a resync reopens it the same way. */
	const expandedRoles = new Map<string, ReadonlySet<CircleRole>>();

	/*
	 * The selected circle's roles, fetched for the peek panel to choose which of them the next
	 * expansion opens (`explorer-state.ts` drops an answer for a circle since left). A primitive,
	 * so growing the model (which may hand back new node objects) doesn't reset it.
	 */
	const peekCircleId = $derived(peekNode?.kind === 'circle' ? peekNode.id : null);
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
		model = await rebuildExplored(source, centerId, expandedIds, 1, expandedRoles);
		expandedIds = new Set([...expandedIds].filter((id) => model.nodes.some((n) => n.id === id)));
		void dispatch({ type: 'rebuilt', nodeIds: new Set(model.nodes.map((n) => n.id)) });
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
		const els = elements();
		const groupOf = grouping?.groupOf ?? new Map<string, string>();
		const arranged = arrangedBy;
		if (!ready || !controller) return;
		const nodeIds = new Set(els.filter((e) => e.group === 'nodes').map((e) => e.data.id as string));
		// In the family tree an expand lays the whole tree out again (`tree-view.ts`).
		const arrival = treeRelaidFor(arranged, onCanvas, nodeIds);
		onCanvas = nodeIds;
		controller.setGraph(els, { arrangedNext: arrival });
		const joined = [...groupOf].some(([id, group]) => placedInGroups.get(id) !== group);
		placedInGroups = groupOf;
		if (joined) settledForGroups = true;
		if (arrival) void dispatch({ type: 'treeRelaid' });
		if (joined || arrival) untrack(() => arrangeNow(arrangedBy));
	});
	// Apply filtering as show/hide (no re-layout).
	$effect(() => {
		const { nodes, edges } = shownIds();
		if (!ready || !controller) return;
		controller.setVisible(nodes, edges);
	});
	// A group dissolved, or grouping switched off, takes its selection with it.
	$effect(() => {
		const groupIds = new Set(grouping?.groups.map((g) => g.id));
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
		if (!ready || !controller) return;
		controller.setStylesheet(sheet);
	});

	const onTapNode = (id: string) =>
		dispatch({ type: 'tapped', id, isGroup: grouping?.groups.some((g) => g.id === id) ?? false });
	const onTapBackground = () => dispatch({ type: 'tappedBackground' });

	async function expand(id: string) {
		// The embedded map is one person's neighbourhood, not a way into the whole household:
		// past its last ring the reader is sent to the explorer route instead (docs/02 §2.7).
		if (centerId !== null && !canExpand(rings, id, maxRings)) return;
		// Until the circle's roles have arrived there is nothing to narrow by: open it whole.
		const roles = peekCircleId === id && roleOptions.length > 0 ? new Set(chosenRoles) : undefined;
		model = await expandNode(source, model, id, roles);
		if (roles) {
			const all = new Set(roleOptions.map((o) => o.role));
			const open = rolesOpenAfter(expandedIds.has(id), expandedRoles.get(id), roles, all);
			if (open) expandedRoles.set(id, open);
			else expandedRoles.delete(id);
		}
		expandedIds.add(id);
	}

	async function reveal(id: string) {
		if (!model.nodes.some((n) => n.id === id)) {
			model = mergeModels(model, await buildEgoNetwork(source, id, 1));
			expandedIds.add(id);
		}
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
			canvas.arrangeAt(familyTreeLayout(drawnVisible, sizeOf), {
				outsideFamily: t('graph.tree.outsideFamily'),
				keepNamesDrawn: true
			});
			return;
		}
		canvas.arrangeAt(circleClustersLayout(drawn, sizeOf, grouping ?? undefined));
	}

	// The one place a stylesheet is built: theme changes and the label toggle share it, so
	// re-theming can never drop the toggle and vice versa.
	function stylesheet() {
		return buildStylesheet(paletteFromDom(), {
			edgeLabels: labelsFit,
			reducedMotion,
			familyTree: rolesInstead
		});
	}

	function retheme() {
		controller?.setStylesheet(stylesheet());
	}

	let themeObserver: MutationObserver | null = null;
	let colorScheme: MediaQueryList | null = null;
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
	 * The peek panel floats beside the map on a wide window and along its foot on a phone. The
	 * next framing — the family tree after an expand — keeps the map clear of it, so nobody it
	 * brought in lands underneath. Read from the layout, not the screen, so a panel still
	 * sliding in is measured where it will stand.
	 */
	const peekOpen = $derived((peekNode !== null || peekGroup !== null) && !pathMode);
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
		if (centerId) model = await buildEgoNetwork(source, centerId, 1);

		// A link may arrive with the question already asked (docs/05 §5.5): trace it before the
		// canvas is built, so the chain is what the first layout lays out rather than a jump.
		if (centerId && tracePathTo) {
			const found = await findConnectionPath(pathSource, centerId, tracePathTo);
			if (found) model = mergeModels(model, found.model);
			void dispatch({ type: 'tracedOnOpen', path: found });
		}

		if (disposed) return;

		const kept: KeptPreferences = {};
		try {
			switchStore = viewSwitchPreference(localStorage);
			kept.switches = switchStore.load();
			densityStore = densityPreference(localStorage);
			kept.density = densityStore.load();
			viewStore = savedViewsPreference(localStorage);
			kept.savedViews = viewStore.load();
		} catch {
			// Storage can be blocked; the defaults stand.
		}
		void dispatch({ type: 'preferencesLoaded', kept });

		// Bound by the canvas as it mounts, which is before this runs.
		if (!container) throw new Error('The graph canvas has no element to draw into.');
		const explorer = await createExplorer({
			container,
			elements: elements(),
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
		placedInGroups = grouping?.groupOf ?? new Map();
		onCanvas = new Set(
			elements()
				.filter((e) => e.group === 'nodes')
				.map((e) => e.data.id as string)
		);
		const shown = shownIds();
		controller.setVisible(shown.nodes, shown.edges);
		controller.highlightNeighborhood(selected);
		ready = true;
		onReady?.();

		themeObserver = new MutationObserver(retheme);
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme']
		});
		colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
		colorScheme.addEventListener('change', retheme);
	});

	onDestroy(() => {
		disposed = true;
		themeObserver?.disconnect();
		colorScheme?.removeEventListener('change', retheme);
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
	role={overlay ? 'dialog' : undefined}
	aria-modal={overlay ? 'true' : undefined}
>
	<GraphCanvas
		bind:container
		{ready}
		{selected}
		{centerId}
		{grouping}
		{groupLabel}
		{nameOf}
		{hidden}
		positions={() => controller?.positions() ?? new Map()}
		markCursor={(id) => controller?.markCursor(id)}
		onActivate={onTapNode}
		onClear={() => dispatch({ type: 'cleared' })}
	/>

	<!-- Below the centre rather than over it, and out of the way while a peek panel is open. -->
	{#if ready && lonelyCentre && !selected}
		<div
			class="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4"
			data-testid="graph-alone"
		>
			<div class="pointer-events-auto w-full max-w-sm rounded-app bg-card shadow-pop">
				{#if lonelyCentre.kind === 'circle'}
					<EmptyState
						icon="circles"
						title={t('graph.aloneCircle.title', { name: lonelyCentre.label })}
						hint={t('graph.aloneCircle.hint')}
					>
						<Button variant="primary" icon="add" href="/circles/{lonelyCentre.id}"
							>{t('circles.addPeople')}</Button
						>
					</EmptyState>
				{:else}
					<EmptyState
						icon="graph"
						title={t('graph.alone.title', { name: lonelyCentre.label })}
						hint={t('graph.alone.hint')}
					>
						<Button variant="primary" icon="add" href={addRelationshipPath(lonelyCentre.id)}
							>{t('graph.alone.add')}</Button
						>
					</EmptyState>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Toolbar. It keeps clear of the peek panel while that is open: the chips wrap on a
	     narrow window, and the row that wraps would otherwise slide underneath it — leaving
	     the button under there unclickable. -->
	<div
		bind:this={toolbar}
		bind:clientHeight={toolbarHeight}
		class="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-center gap-2 transition-[padding]"
		class:sm:pr-[17rem]={(peekNode || peekGroup) && !pathMode}
	>
		<!-- Above the chips: on a narrow window the chip row wraps under the field, and the
		     suggestion list would otherwise be hidden behind it. Embedded, there is nobody to
		     find: the map holds one person's neighbourhood and the page has its own search. -->
		{#if !compact}
			<GraphFindField {graph} onReveal={reveal} />
		{/if}

		<GraphFilterMenu
			{active}
			{openingFilters}
			onToggleFilter={(key) => dispatch({ type: 'filterToggled', key })}
			switches={{ ...switches, edgeLabels: labelsSwitch }}
			onSwitch={flipSwitch}
			{labelsFit}
			{rolesInstead}
			{density}
			onChooseDensity={(next) => dispatch({ type: 'densityChosen', density: next })}
			{savedViews}
			{currentView}
			onApplyView={(view) => dispatch({ type: 'viewApplied', view })}
			onSaveView={(name) => dispatch({ type: 'viewSaved', name })}
			onDeleteView={(name) => dispatch({ type: 'viewDeleted', name })}
		/>

		<GraphArrangeMenu {arrangedBy} onArrange={(key) => dispatch({ type: 'arranged', key })} />

		{#if !compact}
			<!-- Full screen and the connection path start the second row on a phone. -->
			<div class="basis-full sm:hidden" aria-hidden="true"></div>
		{/if}
		{#if onShrink}
			<Button
				variant="ghost"
				size="sm"
				icon="shrinkMap"
				label={t('graph.onPerson.shrink')}
				title={t('graph.onPerson.shrink')}
				data-map-shrink
				class="pointer-events-auto ml-auto"
				onclick={onShrink}
			/>
		{/if}
		{#if screen.available}
			<Button
				variant="ghost"
				size="sm"
				icon={screen.on ? 'exitFullscreen' : 'enterFullscreen'}
				label={t(screen.on ? 'graph.fullscreen.exit' : 'graph.fullscreen.enter')}
				aria-pressed={screen.on}
				title={t(screen.on ? 'graph.fullscreen.exit' : 'graph.fullscreen.enter')}
				class="pointer-events-auto {onShrink ? '' : 'ml-auto'}"
				onclick={screen.toggle}
			/>
		{/if}
		{#if !compact}
			<button
				onclick={() => dispatch({ type: 'pathToggled' })}
				aria-pressed={pathMode}
				class="pointer-events-auto rounded-full border px-3 py-1 text-xs font-medium backdrop-blur transition-colors {pathMode
					? 'border-transparent bg-warning-soft text-fg'
					: 'border-border bg-card/90 text-fg-muted hover:text-fg'}"
			>
				{t('graph.connectionPath')}
			</button>
		{/if}
	</div>

	<!-- Path prompt / result -->
	{#if pathMode}
		<GraphPathPrompt {path} {pathMissing} {pathFrom} {nameOf} />
	{/if}

	<!-- Peek panel -->
	{#if peekGroup && !pathMode}
		<GraphGroupPeek
			group={peekGroup}
			label={groupLabel(peekGroup)}
			nodes={model.nodes}
			{nameOf}
			{compact}
			onShowIndividually={() => dispatch({ type: 'groupDissolved', id: peekGroup!.id })}
			onClose={() => dispatch({ type: 'peekClosed' })}
		/>
	{:else if peekNode && !pathMode}
		<GraphNodePeek
			node={peekNode}
			{compact}
			withinReach={peekWithinReach}
			expandable={peekExpandable}
			{roleOptions}
			{chosenRoles}
			onToggleRole={(role) => dispatch({ type: 'roleToggled', role })}
			onExpand={expand}
			{fullGraphHref}
			onClose={() => dispatch({ type: 'peekClosed' })}
		/>
	{/if}
</div>
