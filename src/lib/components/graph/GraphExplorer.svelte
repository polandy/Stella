<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { createExplorer, type ExplorerController } from '$lib/graph/cytoscape/explorer';
	import { toCytoscapeElements } from '$lib/graph/cytoscape/elements';
	import { buildStylesheet } from '$lib/graph/cytoscape/stylesheet';
	import { paletteFromDom } from '$lib/graph/cytoscape/theme';
	import { applyFilters, emptyModel, mergeModels } from '$lib/graph/model/graph-model';
	import { buildEgoNetwork, expandNode } from '$lib/graph/model/ego-network';
	import { findConnectionPath } from '$lib/graph/model/connection-path';
	import { inMemoryGraphSource } from '$lib/graph/model/in-memory-source';
	import type { ConnectionPath, GraphFilters, GraphModel } from '$lib/graph/model/types';

	interface Props {
		/** The whole visible graph, delivered once by the server; explored entirely client-side. */
		graph: GraphModel;
		centerId: string | null;
	}
	let { graph, centerId }: Props = $props();

	// All exploration runs against this in-memory source — no further requests to the server.
	// `graph` is fixed for the component's life (the route remounts via {#key centerId}).
	const source = inMemoryGraphSource(untrack(() => graph));
	const contacts = untrack(() => graph).nodes
		.filter((n) => n.kind === 'person')
		.map((n) => ({ id: n.id, displayName: n.label }))
		.sort((a, b) => a.displayName.localeCompare(b.displayName));

	// The filterable connection kinds, each tied to its category colour (docs/05 §5.6).
	const FILTERS = [
		{ key: 'family', label: 'Family', ctp: 'green' },
		{ key: 'romantic', label: 'Romantic', ctp: 'pink' },
		{ key: 'social', label: 'Social', ctp: 'blue' },
		{ key: 'professional', label: 'Work', ctp: 'peach' },
		{ key: 'circles', label: 'Circles', ctp: 'lavender' },
		{ key: 'kinship', label: 'Kinship', ctp: 'overlay2' }
	] as const;

	const reducedMotion =
		typeof window !== 'undefined' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	let container: HTMLDivElement;
	let controller: ExplorerController | null = null;
	let ready = $state(false);

	// Starts empty; the ego view around the centre is built client-side on mount.
	let model = $state<GraphModel>(emptyModel());
	let selected = $state<string | null>(untrack(() => centerId));
	let active = $state<Set<string>>(new Set(FILTERS.map((f) => f.key)));
	let query = $state('');
	let pathMode = $state(false);
	let pathFrom = $state<string | null>(null);
	let path = $state<ConnectionPath | null>(null);
	let pathMissing = $state(false);

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

	// Push the full (expanded) element set to the renderer whenever the model grows.
	$effect(() => {
		if (!ready || !controller) return;
		controller.setGraph(toCytoscapeElements(model, { centerId: centerId ?? undefined }));
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
		model = await expandNode(source, model, id);
	}

	async function reveal(id: string) {
		query = '';
		if (!model.nodes.some((n) => n.id === id)) {
			model = mergeModels(model, await buildEgoNetwork(source, id, 1));
		}
		selected = id;
		path = null;
		controller?.focus(id);
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
		const found = await findConnectionPath(source, pathFrom, id);
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

	function retheme() {
		controller?.setStylesheet(buildStylesheet(paletteFromDom()));
	}

	let themeObserver: MutationObserver | null = null;
	let colorScheme: MediaQueryList | null = null;

	onMount(async () => {
		// Build the initial ego view around the centre from the in-memory snapshot.
		if (centerId) model = await buildEgoNetwork(source, centerId, 1);

		controller = await createExplorer({
			container,
			elements: toCytoscapeElements(model, { centerId: centerId ?? undefined }),
			stylesheet: buildStylesheet(paletteFromDom()),
			reducedMotion,
			onTapNode,
			onTapBackground
		});
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
		themeObserver?.disconnect();
		colorScheme?.removeEventListener('change', retheme);
		controller?.destroy();
	});
</script>

<div class="relative h-full w-full overflow-hidden">
	<div bind:this={container} class="absolute inset-0"></div>

	{#if !ready}
		<div class="absolute inset-0 grid place-items-center text-sm text-fg-subtle">
			Loading the graph…
		</div>
	{/if}

	<!-- Toolbar -->
	<div
		class="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-center gap-2"
	>
		<div class="pointer-events-auto relative">
			<input
				bind:value={query}
				placeholder="Find a person…"
				aria-label="Find a person"
				class="w-56 rounded-app border border-border bg-card/90 px-3 py-2 text-sm text-fg backdrop-blur"
			/>
			{#if suggestions.length}
				<ul
					class="absolute left-0 top-full mt-1 w-full overflow-hidden rounded-app border border-border bg-card shadow-lg"
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

		<div class="pointer-events-auto flex flex-wrap gap-1.5">
			{#each FILTERS as f (f.key)}
				<button
					onclick={() => toggleFilter(f.key)}
					aria-pressed={active.has(f.key)}
					class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur transition-opacity"
					class:opacity-40={!active.has(f.key)}
					style="border-color:color-mix(in srgb, var(--ctp-{f.ctp}) 45%, transparent); background:color-mix(in srgb, var(--ctp-{f.ctp}) 12%, var(--card)); color:var(--fg)"
				>
					<span
						class="size-2 rounded-full"
						style="background:{active.has(f.key) ? `var(--ctp-${f.ctp})` : 'var(--fg-subtle)'}"
					></span>
					{f.label}
				</button>
			{/each}
		</div>

		<button
			onclick={togglePath}
			aria-pressed={pathMode}
			class="pointer-events-auto rounded-full border border-border bg-card/90 px-3 py-1 text-xs font-medium text-fg-muted backdrop-blur transition-colors hover:text-fg"
			class:!border-transparent={pathMode}
			style={pathMode
				? 'background:color-mix(in srgb, var(--ctp-yellow) 22%, transparent); color:var(--ctp-yellow)'
				: ''}
		>
			🧭 Connection path
		</button>
	</div>

	<!-- Path prompt / result -->
	{#if pathMode}
		<div
			class="pointer-events-none absolute inset-x-0 top-16 flex justify-center"
		>
			<div
				class="rounded-full border border-border bg-card/90 px-4 py-1.5 text-xs text-fg-muted backdrop-blur"
			>
				{#if path}
					🧭 {pathChain.join(' → ')}
				{:else if pathMissing}
					No connection found between those two.
				{:else if pathFrom}
					Now pick the second person…
				{:else}
					Pick two people to trace how they’re connected.
				{/if}
			</div>
		</div>
	{/if}

	<!-- Legend -->
	<div
		class="pointer-events-none absolute bottom-3 left-3 rounded-app border border-border bg-card/90 p-3 text-xs backdrop-blur"
	>
		<div class="mb-1.5 font-semibold uppercase tracking-wide text-fg-subtle">Connections</div>
		<div class="flex flex-col gap-1 text-fg-muted">
			<span><span class="mr-2 inline-block w-4 border-t-2" style="border-color:var(--ctp-green)"></span>Family</span>
			<span><span class="mr-2 inline-block w-4 border-t-2" style="border-color:var(--ctp-pink)"></span>Romantic</span>
			<span><span class="mr-2 inline-block w-4 border-t-2" style="border-color:var(--ctp-blue)"></span>Social</span>
			<span><span class="mr-2 inline-block w-4 border-t-2" style="border-color:var(--ctp-peach)"></span>Professional</span>
			<span><span class="mr-2 inline-block w-4 border-t-2 border-dashed" style="border-color:var(--ctp-lavender)"></span>Circle</span>
			<span><span class="mr-2 inline-block w-4 border-t-2 border-dotted" style="border-color:var(--fg-subtle)"></span>Kinship</span>
		</div>
	</div>

	<!-- Peek panel -->
	{#if peekNode && !pathMode}
		<aside
			class="absolute right-3 top-3 bottom-3 w-64 overflow-auto rounded-app border border-border bg-card/95 p-4 shadow-lg backdrop-blur"
		>
			<button
				onclick={() => (selected = null)}
				class="float-right text-fg-subtle hover:text-fg"
				aria-label="Close">×</button
			>
			<div class="text-lg font-semibold text-fg">{peekNode.label}</div>
			<div class="mb-4 text-xs capitalize text-fg-subtle">
				{peekNode.kind === 'circle' ? 'Shared context' : 'Person'}
				{#if peekNode.deceased}· deceased{/if}
			</div>
			<div class="flex flex-col gap-2">
				<button
					onclick={() => expand(peekNode.id)}
					class="rounded-app border border-border px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg"
				>
					Expand connections
				</button>
				{#if peekNode.kind === 'person'}
					<a
						href="/contacts/{peekNode.id}"
						class="rounded-app bg-primary px-3 py-2 text-center text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
					>
						Open profile
					</a>
				{/if}
			</div>
			<p class="mt-4 text-xs text-fg-subtle">
				Tip: click a selected node to expand it, or use the connection path to see how two
				people are linked.
			</p>
		</aside>
	{/if}
</div>
