<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import { filterSummary } from '$lib/menu/menu';
	import { categoryVar } from '$lib/design/tokens';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { kinshipLabel } from '$lib/kinship/labels';
	import { relationshipRowLabel } from '$lib/relationships/labels';
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
		type CircleRole,
		type CircleRoleOption
	} from '$lib/graph/model/ego-network';
	import { canExpand, ringsFrom } from '$lib/graph/model/rings';
	import {
		applyFilters,
		emptyModel,
		mergeModels,
		withoutDerivedLinks
	} from '$lib/graph/model/graph-model';
	import { inMemoryGraphSource } from '$lib/graph/model/in-memory-source';
	import { circleClustersLayout } from '$lib/graph/layout/circle-clusters';
	import { familyTreeLayout } from '$lib/graph/layout/family-tree';
	import { DEFAULT_NODE_SIZE } from '$lib/graph/layout/geometry';
	import type { ConnectionPath, GraphEdge, GraphFilters, GraphModel } from '$lib/graph/model/types';

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
	}
	let {
		graph,
		centerId,
		compact = false,
		maxRings = Number.POSITIVE_INFINITY,
		fullGraphHref,
		tracePathTo = null
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
	const contacts = $derived(
		graph.nodes
			.filter((n) => n.kind === 'person')
			.map((n) => ({ id: n.id, displayName: n.label }))
			.sort((a, b) => a.displayName.localeCompare(b.displayName))
	);

	// The filterable connection kinds, each tied to its category colour (docs/05 §5.6).
	// Each filter carries the same token the canvas draws that edge kind with (docs/05 §5.6),
	// so a chip and the line it toggles can never drift apart.
	// Each chip also draws its line style, so the chips are the legend (docs/05 §5.8).
	const FILTERS = [
		{ key: 'family', label: 'relationships.category.family', token: categoryVar('family'), line: 'solid' },
		{ key: 'romantic', label: 'relationships.category.romantic', token: categoryVar('romantic'), line: 'solid' },
		{ key: 'social', label: 'relationships.category.social', token: categoryVar('social'), line: 'solid' },
		{ key: 'professional', label: 'relationships.category.professional', token: categoryVar('professional'), line: 'solid' },
		{ key: 'circles', label: 'graph.filter.circles', token: 'var(--edge-membership)', line: 'dashed' },
		{ key: 'kinship', label: 'graph.filter.kinship', token: 'var(--edge-kinship)', line: 'dotted' }
	] as const;

	/** One row of a toolbar menu; the check or switch on its right says its state. */
	const MENU_ITEM =
		'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-fg hover:bg-bg-sunken focus:bg-bg-sunken focus:outline-none';

	const reducedMotion =
		typeof window !== 'undefined' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	let frame: HTMLDivElement;
	let container: HTMLDivElement;
	let controller: ExplorerController | null = null;
	let ready = $state(false);

	// Starts empty; the ego view around the centre is built client-side on mount.
	let model = $state<GraphModel>(emptyModel());
	/*
	 * The route opens with its centre selected, because the peek panel beside a full-screen
	 * canvas is where that route says who you are looking at. Embedded, the same panel would
	 * cover half a map the size of a card before anybody has asked anything — the page's own
	 * header already names the person, so nothing is selected until a node is tapped.
	 */
	let selected = $state<string | null>(untrack(() => (compact ? null : centerId)));
	/*
	 * Circles are people's shared contexts, not people: on the route they belong in the picture,
	 * on a person's card they double the node count for something the profile already lists.
	 * The chip is there either way, so switching them on is one click (docs/05 §5.5).
	 */
	const openingFilters: ReadonlySet<string> = new Set(
		FILTERS.map((f) => f.key).filter((key) => !(untrack(() => compact) && key === 'circles'))
	);
	let active = $state<Set<string>>(new Set(openingFilters));
	const filters = $derived(
		filterSummary(
			active,
			FILTERS.map((f) => f.key),
			openingFilters
		)
	);
	let query = $state('');
	let pathMode = $state(false);
	let pathFrom = $state<string | null>(null);
	let path = $state<ConnectionPath | null>(null);
	let pathMissing = $state(false);
	// Off by default: the canvas stays quiet, and whoever wants the map read at a glance
	// turns every line's name on from the toolbar (docs/05 §5.8).
	let edgeLabels = $state(false);

	function buildFilters(): GraphFilters {
		const categories = (['family', 'romantic', 'social', 'professional'] as const).filter((c) =>
			active.has(c)
		);
		const edgeKinds: GraphFilters['edgeKinds'] = [];
		if (categories.length) edgeKinds.push('relationship');
		if (active.has('circles')) edgeKinds.push('membership');
		if (active.has('kinship')) edgeKinds.push('kinship');
		return { edgeKinds, categories, keepNodeId: centerId ?? undefined };
	}

	const visible = $derived(applyFilters(model, buildFilters()));
	const peekNode = $derived(selected ? model.nodes.find((n) => n.id === selected) ?? null : null);
	// How far each node sits from the centre, so the embedded map stops where it promises to.
	const rings = $derived(centerId ? ringsFrom(model, centerId) : new Map<string, number>());
	const peekExpandable = $derived(
		peekNode !== null && (centerId === null || canExpand(rings, peekNode.id, maxRings))
	);
	const suggestions = $derived(
		query.trim()
			? contacts
					.filter((c) => c.displayName.toLowerCase().includes(query.trim().toLowerCase()))
					.slice(0, 6)
			: []
	);
	const pathChain = $derived(
		path ? path.nodeIds.map((id) => model.nodes.find((n) => n.id === id)?.label ?? id) : []
	);

	/*
	 * What the reader has opened up, in the order they did it. Kept so a fresh snapshot can be
	 * explored to the same extent instead of collapsing the map back to the first ring.
	 */
	let expandedIds = new Set<string>();
	/** For a circle opened up for some roles only, which — so a resync reopens it the same way. */
	const expandedRoles = new Map<string, ReadonlySet<CircleRole>>();

	/*
	 * The selected circle's roles and which of them the next expansion opens. Everything starts
	 * chosen, so a plain "expand" still shows the whole circle. `roleOptionsFor` names the circle
	 * they belong to, so a slow answer for a circle the reader has since left is dropped.
	 */
	let roleOptions = $state<CircleRoleOption[]>([]);
	let roleOptionsFor: string | null = null;
	let chosenRoles = $state(new Set<CircleRole>());
	// A primitive, so growing the model (which may hand back new node objects) doesn't reset it.
	const peekCircleId = $derived(peekNode?.kind === 'circle' ? peekNode.id : null);
	$effect(() => {
		const circleId = peekCircleId;
		roleOptions = [];
		roleOptionsFor = null;
		chosenRoles = new Set();
		if (circleId === null) return;
		roleOptionsFor = circleId;
		void source.neighborhood(circleId).then((hood) => {
			if (!hood || roleOptionsFor !== circleId) return;
			roleOptions = circleRoles(hood);
			chosenRoles = new Set(roleOptions.map((o) => o.role));
		});
	});

	function toggleRole(role: CircleRole) {
		const next = new Set(chosenRoles);
		if (!next.delete(role)) next.add(role);
		chosenRoles = next;
	}
	/** The snapshot the model on screen was built from; a different one means resync. */
	let synced = untrack(() => graph);

	/*
	 * Follow a new snapshot. A person's page re-runs its load after every save (a relationship
	 * added, retyped or removed), so the map beside the list shows the same links the list
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
		// A traced chain belongs to the links as they were; the snapshot may have changed them.
		path = null;
		pathFrom = null;
		pathMissing = false;
		model = await rebuildExplored(source, centerId, expandedIds, 1, expandedRoles);
		expandedIds = new Set([...expandedIds].filter((id) => model.nodes.some((n) => n.id === id)));
		if (selected !== null && !model.nodes.some((n) => n.id === selected)) selected = null;
	}

	// Push the full (expanded) element set to the renderer whenever the model grows.
	$effect(() => {
		if (!ready || !controller) return;
		controller.setGraph(toCytoscapeElements(model, { centerId: centerId ?? undefined, edgeLabel }));
	});
	// Apply filtering as show/hide (no re-layout).
	$effect(() => {
		if (!ready || !controller) return;
		controller.setVisible(
			new Set(visible.nodes.map((n) => n.id)),
			new Set(visible.edges.map((e) => e.id))
		);
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

	async function onTapNode(id: string) {
		if (pathMode) {
			await pickPath(id);
			return;
		}
		if (selected === id) {
			await expand(id);
			return;
		}
		selected = id;
		path = null;
		pathMissing = false;
	}

	function onTapBackground() {
		if (pathMode) return;
		selected = null;
		path = null;
	}

	async function expand(id: string) {
		// The embedded map is one person's neighbourhood, not a way into the whole household:
		// past its last ring the reader is sent to the explorer route instead (docs/02 §2.7).
		if (centerId !== null && !canExpand(rings, id, maxRings)) return;
		// Until the circle's roles have arrived there is nothing to narrow by: open it whole.
		const roles =
			peekCircleId === id && roleOptions.length > 0 ? new Set(chosenRoles) : undefined;
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
		query = '';
		if (!model.nodes.some((n) => n.id === id)) {
			model = mergeModels(model, await buildEgoNetwork(source, id, 1));
			expandedIds.add(id);
		}
		selected = id;
		path = null;
		controller?.focus(id);
	}

	/*
	 * The three ways to arrange the map (docs/05 §5.8). Each is a one-off action, not a mode: an
	 * expand afterwards still only adds people around the one expanded. The family tree reads
	 * what is shown, so a filtered-out line cannot pull someone into a generation; the groups by
	 * circle read every membership, so the grouping holds while the Circles chip is off.
	 */
	const ARRANGEMENTS = [
		{ key: 'force', label: 'graph.arrange.force', hint: 'graph.arrange.force.hint' },
		{ key: 'tree', label: 'graph.arrange.tree', hint: 'graph.arrange.tree.hint' },
		{ key: 'circles', label: 'graph.arrange.circles', hint: 'graph.arrange.circles.hint' }
	] as const;

	/** The arrangement last chosen, which the Arrange pill names; free until one is picked. */
	let arrangedBy = $state<(typeof ARRANGEMENTS)[number]['key']>('force');
	const arrangedLabel = $derived(ARRANGEMENTS.find((a) => a.key === arrangedBy)!.label);

	function arrangeBy(key: (typeof ARRANGEMENTS)[number]['key']) {
		const canvas = controller;
		if (!canvas) return;
		arrangedBy = key;
		if (key === 'force') return canvas.arrange();
		// The room each node really takes, its name included; a node the canvas is not drawing
		// (filtered out) has none to measure, and is given the usual room.
		const sizeOf = (id: string) => {
			const size = canvas.sizeOf(id);
			return size.width > 0 ? size : DEFAULT_NODE_SIZE;
		};
		canvas.arrangeAt(
			key === 'tree' ? familyTreeLayout(visible, sizeOf) : circleClustersLayout(model, sizeOf)
		);
	}

	function togglePath() {
		pathMode = !pathMode;
		pathFrom = null;
		path = null;
		pathMissing = false;
		if (pathMode) selected = null;
	}

	async function pickPath(id: string) {
		if (!pathFrom) {
			pathFrom = id;
			return;
		}
		if (id === pathFrom) {
			pathFrom = null;
			return;
		}
		const found = await findConnectionPath(pathSource, pathFrom, id);
		if (found) {
			model = mergeModels(model, found.model);
			path = found;
			pathMissing = false;
		} else {
			path = null;
			pathMissing = true;
		}
		pathFrom = null;
	}

	function toggleFilter(key: string) {
		const next = new Set(active);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		active = next;
	}

	// The one place a stylesheet is built: theme changes and the label toggle share it, so
	// re-theming can never drop the toggle and vice versa.
	function stylesheet() {
		return buildStylesheet(paletteFromDom(), { edgeLabels });
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
	 * Full screen is the browser's own, on the whole frame — canvas, toolbar and peek panel
	 * together — so nothing the map needs is left behind. The state follows the browser rather
	 * than the button, because Esc leaves it without asking us. Where the browser cannot do it
	 * (iOS Safari on an element) the button is simply absent.
	 */
	let canFullscreen = $state(false);
	let fullscreen = $state(false);
	const syncFullscreen = () => (fullscreen = document.fullscreenElement === frame);

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement === frame) await document.exitFullscreen();
			else await frame.requestFullscreen();
		} catch (error) {
			console.error('Could not switch full screen', error);
		}
	}

	// An effect rather than onMount/onDestroy: it runs in the browser only (the server renders
	// this component too, and has no `document`), and a button present there but not here
	// would be a hydration mismatch.
	$effect(() => {
		canFullscreen = document.fullscreenEnabled;
		document.addEventListener('fullscreenchange', syncFullscreen);
		return () => document.removeEventListener('fullscreenchange', syncFullscreen);
	});

	onMount(async () => {
		// Build the initial ego view around the centre from the in-memory snapshot.
		if (centerId) model = await buildEgoNetwork(source, centerId, 1);

		// A link may arrive with the question already asked (docs/05 §5.5): trace it before the
		// canvas is built, so the chain is what the first layout lays out rather than a jump.
		if (centerId && tracePathTo) {
			const found = await findConnectionPath(pathSource, centerId, tracePathTo);
			if (found) {
				model = mergeModels(model, found.model);
				path = found;
			} else {
				pathMissing = true;
			}
			pathMode = true;
		}

		if (disposed) return;

		const explorer = await createExplorer({
			container,
			elements: toCytoscapeElements(model, { centerId: centerId ?? undefined, edgeLabel }),
			stylesheet: stylesheet(),
			reducedMotion,
			topInset: toolbarBottom(),
			onTapNode,
			onTapBackground
		});
		if (disposed) {
			explorer.destroy();
			return;
		}
		controller = explorer;
		controller.setVisible(
			new Set(visible.nodes.map((n) => n.id)),
			new Set(visible.edges.map((e) => e.id))
		);
		controller.highlightNeighborhood(selected);
		ready = true;

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

<div bind:this={frame} class="relative h-full w-full overflow-hidden bg-bg">
	<!-- Cytoscape stamps `position: relative` on its container, which would cancel an
	     `absolute inset-0` box and collapse the canvas to zero height — size it directly. -->
	<div bind:this={container} class="h-full w-full"></div>

	{#if !ready}
		<div class="absolute inset-0 grid place-items-center text-sm text-fg-subtle">
			Loading the graph…
		</div>
	{/if}

	<!-- Toolbar. It keeps clear of the peek panel while that is open: the chips wrap on a
	     narrow window, and the row that wraps would otherwise slide underneath it — leaving
	     the button under there unclickable. -->
	<div
		bind:this={toolbar}
		bind:clientHeight={toolbarHeight}
		class="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-center gap-2 transition-[padding]"
		class:sm:pr-[17rem]={peekNode && !pathMode}
	>
		<!-- Above the chips: on a narrow window the chip row wraps under the field, and the
		     suggestion list would otherwise be hidden behind it. Embedded, there is nobody to
		     find: the map holds one person's neighbourhood and the page has its own search. -->
		{#if !compact}
			<div class="pointer-events-auto relative z-20">
				<input
					bind:value={query}
					placeholder={t('graph.findPlaceholder')}
					aria-label={t('graph.find')}
					class="w-56 rounded-app border border-border bg-card/90 px-3 py-2 text-sm text-fg backdrop-blur"
				/>
				{#if suggestions.length}
					<ul
						data-testid="graph-suggestions"
						class="absolute left-0 top-full mt-1 w-full overflow-hidden rounded-app border border-border bg-card shadow-pop"
					>
						{#each suggestions as c (c.id)}
							<li>
								<button
									onclick={() => reveal(c.id)}
									class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-bg-sunken"
								>
									{c.displayName}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<!-- The line kinds and their names live in one menu: it is the legend too, each kind
		     drawn in its colour and line style, and the pill counts what is shown so a narrowed
		     map is never mistaken for a sparse one (docs/05 §5.8). -->
		<MenuButton
			label={t('graph.filter.summary', filters)}
			highlighted={filters.narrowed}
		>
			{#snippet trigger()}
				{t('graph.filter')}
				<span class="rounded-full bg-bg-sunken px-1.5 tabular-nums text-fg-muted">
					{filters.shown}/{filters.total}
				</span>
			{/snippet}
			{#snippet children()}
				{#each FILTERS as f (f.key)}
					<button
						type="button"
						role="menuitemcheckbox"
						aria-checked={active.has(f.key)}
						onclick={() => toggleFilter(f.key)}
						class={MENU_ITEM}
					>
						<span
							class="inline-block w-5 shrink-0 border-t-2"
							style="border-color:{f.token};border-top-style:{f.line}"
							aria-hidden="true"
						></span>
						<span class="flex-1">{t(f.label)}</span>
						<span
							class="grid size-4 shrink-0 place-items-center rounded border-[1.5px] text-[10px] leading-none"
							class:border-border={!active.has(f.key)}
							style={active.has(f.key)
								? 'background:var(--primary);border-color:var(--primary);color:var(--primary-fg)'
								: ''}
							aria-hidden="true"
						>
							{#if active.has(f.key)}✓{/if}
						</span>
					</button>
				{/each}
				<div role="separator" class="mx-1 my-1 border-t border-border"></div>
				<button
					type="button"
					role="menuitemcheckbox"
					aria-checked={edgeLabels}
					onclick={() => (edgeLabels = !edgeLabels)}
					class={MENU_ITEM}
				>
					<span class="flex-1">
						{t('graph.labels')}
						<span class="block text-[11px] text-fg-subtle">{t('graph.labels.hint')}</span>
					</span>
					<span
						class="relative h-4 w-7 shrink-0 rounded-full transition-colors"
						style="background:{edgeLabels ? 'var(--primary)' : 'var(--border)'}"
						aria-hidden="true"
					>
						<span
							class="absolute top-0.5 size-3 rounded-full bg-card transition-[left]"
							style="left:{edgeLabels ? '0.875rem' : '0.125rem'}"
						></span>
					</span>
				</button>
			{/snippet}
		</MenuButton>

		<MenuButton label={t('graph.arrange.current', { name: t(arrangedLabel) })}>
			{#snippet trigger()}
				{t('graph.arrange.current', { name: t(arrangedLabel) })}
			{/snippet}
			{#snippet children({ close })}
				{#each ARRANGEMENTS as arrangement (arrangement.key)}
					<button
						type="button"
						role="menuitemradio"
						aria-checked={arrangedBy === arrangement.key}
						onclick={() => {
							arrangeBy(arrangement.key);
							close();
						}}
						class={MENU_ITEM}
					>
						<span class="w-3 shrink-0 font-bold text-primary" aria-hidden="true">
							{#if arrangedBy === arrangement.key}✓{/if}
						</span>
						<span class="flex-1">
							{t(arrangement.label)}
							<span class="block text-[11px] text-fg-subtle">{t(arrangement.hint)}</span>
						</span>
					</button>
				{/each}
			{/snippet}
		</MenuButton>

		{#if canFullscreen}
			<Button
				variant="ghost"
				size="sm"
				icon={fullscreen ? 'exitFullscreen' : 'enterFullscreen'}
				label={t(fullscreen ? 'graph.fullscreen.exit' : 'graph.fullscreen.enter')}
				aria-pressed={fullscreen}
				class="pointer-events-auto ml-auto"
				onclick={toggleFullscreen}
			/>
		{/if}
		{#if !compact}
			<button
				onclick={togglePath}
				aria-pressed={pathMode}
				class="pointer-events-auto rounded-full border border-border bg-card/90 px-3 py-1 text-xs font-medium text-fg-muted backdrop-blur transition-colors hover:text-fg"
				class:!border-transparent={pathMode}
				style={pathMode
					? 'background:color-mix(in srgb, var(--warning) 22%, transparent); color:var(--warning)'
					: ''}
			>
				{t('graph.connectionPath')}
			</button>
		{/if}
	</div>

	<!-- Path prompt / result -->
	{#if pathMode}
		<div
			class="pointer-events-none absolute inset-x-0 top-16 flex justify-center"
		>
			<div
				data-testid="path-prompt"
				class="rounded-full border border-border bg-card/90 px-4 py-1.5 text-xs text-fg-muted backdrop-blur"
			>
				{#if path}
					{pathChain.join(' → ')}
				{:else if pathMissing}
					{t('graph.path.none')}
				{:else if pathFrom}
					{t('graph.path.pickSecond')}
				{:else}
					{t('graph.path.pickTwo')}
				{/if}
			</div>
		</div>
	{/if}

	<!-- Peek panel -->
	{#if peekNode && !pathMode}
		<!-- Full height beside a full-screen canvas; embedded it is only as tall as what it
		     says, so it does not sit as an empty panel over half a card-sized map. -->
		<aside
			class="absolute right-3 top-3 overflow-auto rounded-app border border-border bg-card/95 p-4 shadow-pop backdrop-blur"
			class:bottom-3={!compact}
			class:w-64={!compact}
			class:w-52={compact}
			class:max-h-[calc(100%-1.5rem)]={compact}
		>
			<Button variant="ghost" size="sm" icon="remove" label={t('common.close')} class="float-right" onclick={() => (selected = null)} />
			{#if peekNode.kind === 'person'}
				<div class="mb-3">
					<Avatar id={peekNode.id} name={peekNode.label} avatarPhotoId={peekNode.avatarPhotoId ?? null} size={56} deceased={peekNode.deceased} />
				</div>
			{/if}
			<div class="text-lg font-semibold text-fg">{peekNode.label}</div>
			<div class="mb-4 text-xs text-fg-subtle">
				{peekNode.kind === 'circle' ? t('graph.peek.sharedContext') : t('graph.peek.person')}
				{#if peekNode.deceased}· {t('graph.peek.deceased')}{/if}
			</div>
			<div class="flex flex-col gap-2">
				{#if peekNode.kind === 'circle' && peekExpandable && roleOptions.length > 1}
					<fieldset class="flex flex-col gap-1 text-sm" data-testid="circle-roles">
						<legend class="mb-1 text-xs text-fg-subtle">{t('graph.peek.rolesToOpen')}</legend>
						{#each roleOptions as option (option.role)}
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									checked={chosenRoles.has(option.role)}
									onchange={() => toggleRole(option.role)}
								/>
								<span class="text-fg">{option.role ?? t('circles.noRole')} · {option.count}</span>
							</label>
						{/each}
					</fieldset>
				{/if}
				{#if peekExpandable}
					<Button type="button" disabled={peekNode.kind === 'circle' && roleOptions.length > 0 && chosenRoles.size === 0} onclick={() => expand(peekNode.id)}>{t('graph.peek.expand')}</Button>
				{:else if fullGraphHref}
					<!-- The map ends here, so the honest offer is the one place that goes further. -->
					<Button icon="graph" href={fullGraphHref(peekNode.id)}>{t('graph.openInGraph')}</Button>
				{/if}
				{#if peekNode.kind === 'person'}
					<Button variant="primary" href="/contacts/{peekNode.id}">{t('graph.peek.openProfile')}</Button>
				{:else if peekNode.kind === 'circle'}
					<Button variant="primary" href="/circles/{peekNode.id}">{t('graph.peek.openCircle')}</Button>
				{/if}
			</div>
			<p class="mt-4 text-xs text-fg-subtle">
				{#if !peekExpandable}
					{t('graph.peek.edgeOfMap')}
				{:else}
					{compact ? t('graph.peek.tipCompact') : t('graph.peek.tip')}
				{/if}
			</p>
		</aside>
	{/if}
</div>
