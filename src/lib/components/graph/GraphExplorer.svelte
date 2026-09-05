<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { categoryVar } from '$lib/design/tokens';
	import { toCytoscapeElements } from '$lib/graph/cytoscape/elements';
	import { createExplorer, type ExplorerController } from '$lib/graph/cytoscape/explorer';
	import { buildStylesheet } from '$lib/graph/cytoscape/stylesheet';
	import { paletteFromDom } from '$lib/graph/cytoscape/theme';
	import { findConnectionPath } from '$lib/graph/model/connection-path';
	import { buildEgoNetwork, expandNode } from '$lib/graph/model/ego-network';
	import { applyFilters, emptyModel, mergeModels } from '$lib/graph/model/graph-model';
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
	// Each filter carries the same token the canvas draws that edge kind with (docs/05 §5.6),
	// so a chip and the line it toggles can never drift apart.
	// Each chip also draws its line style, so the chips are the legend (docs/05 §5.8).
	const FILTERS = [
		{ key: 'family', label: 'Family', token: categoryVar('family'), line: 'solid' },
		{ key: 'romantic', label: 'Romantic', token: categoryVar('romantic'), line: 'solid' },
		{ key: 'social', label: 'Social', token: categoryVar('social'), line: 'solid' },
		{ key: 'professional', label: 'Work', token: categoryVar('professional'), line: 'solid' },
		{ key: 'circles', label: 'Circles', token: 'var(--edge-membership)', line: 'dashed' },
		{ key: 'kinship', label: 'Kinship', token: 'var(--edge-kinship)', line: 'dotted' }
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
	<!-- Cytoscape stamps `position: relative` on its container, which would cancel an
	     `absolute inset-0` box and collapse the canvas to zero height — size it directly. -->
	<div bind:this={container} class="h-full w-full"></div>

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

		<div class="pointer-events-auto flex flex-wrap gap-1.5">
			{#each FILTERS as f (f.key)}
				<button
					onclick={() => toggleFilter(f.key)}
					aria-pressed={active.has(f.key)}
					class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur transition-opacity"
					class:opacity-40={!active.has(f.key)}
					style="border-color:color-mix(in srgb, {f.token} 45%, transparent); background:color-mix(in srgb, {f.token} 12%, var(--card)); color:var(--fg)"
				>
					<span
						class="inline-block w-4 border-t-2"
						style="border-color:{active.has(f.key) ? f.token : 'var(--fg-subtle)'};border-top-style:{f.line}"
						aria-hidden="true"
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
				? 'background:color-mix(in srgb, var(--warning) 22%, transparent); color:var(--warning)'
				: ''}
		>
			Connection path
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
					{pathChain.join(' → ')}
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

	<!-- Peek panel -->
	{#if peekNode && !pathMode}
		<aside
			class="absolute right-3 top-3 bottom-3 w-64 overflow-auto rounded-app border border-border bg-card/95 p-4 shadow-pop backdrop-blur"
		>
			<Button variant="ghost" size="sm" icon="remove" label="Close" class="float-right" onclick={() => (selected = null)} />
			{#if peekNode.kind === 'person'}
				<div class="mb-3">
					<Avatar id={peekNode.id} name={peekNode.label} avatarPhotoId={peekNode.avatarPhotoId ?? null} size={56} deceased={peekNode.deceased} />
				</div>
			{/if}
			<div class="text-lg font-semibold text-fg">{peekNode.label}</div>
			<div class="mb-4 text-xs capitalize text-fg-subtle">
				{peekNode.kind === 'circle' ? 'Shared context' : 'Person'}
				{#if peekNode.deceased}· deceased{/if}
			</div>
			<div class="flex flex-col gap-2">
				<Button type="button" onclick={() => expand(peekNode.id)}>Expand connections</Button>
				{#if peekNode.kind === 'person'}
					<Button variant="primary" href="/contacts/{peekNode.id}">Open profile</Button>
				{/if}
			</div>
			<p class="mt-4 text-xs text-fg-subtle">
				Tip: click a selected node to expand it, or use the connection path to see how two
				people are linked.
			</p>
		</aside>
	{/if}
</div>
