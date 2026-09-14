<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import EgoGraph from '$lib/components/EgoGraph.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { PERSON_MAP_RINGS } from '$lib/graph/model/person-map';
	import type { GraphModel } from '$lib/graph/model/types';

	/*
	 * The map on a person's page (docs/05 §5.5): the same explorer the graph route runs, with a
	 * narrower brief — this person stays in the middle and the map reaches two steps.
	 *
	 * The plain SVG ego graph is what the server renders and what the reader sees first; the
	 * ~400 KB engine is fetched afterwards and takes its place once it is ready. So the map is
	 * never a blank box waiting on a download, the page costs nothing extra to open, and a
	 * browser that never finishes the fetch still shows the relationships — the SVG it already
	 * had is the fallback, not an error state.
	 */
	interface Props {
		centerId: string;
		centerName: string;
		/** The person's own face, for the SVG that is drawn before the engine arrives. */
		centerPhotoId: string | null;
		/** This person's slice of the visible graph, cut by `personMap` on the server. */
		graph: GraphModel;
		/** The same relationships as the plain SVG draws them, for the first paint. */
		nodes: {
			id: string;
			name: string;
			label: string;
			category: string;
			avatarPhotoId: string | null;
		}[];
		/** Where a node at the edge of the map leads, when the reader wants to go further. */
		fullGraphHref: (nodeId: string) => string;
	}
	let { centerId, centerName, centerPhotoId, graph, nodes, fullGraphHref }: Props = $props();

	const t = useTranslate();

	let Explorer = $state<Component<{
		graph: GraphModel;
		centerId: string | null;
		compact?: boolean;
		maxRings?: number;
		fullGraphHref?: (nodeId: string) => string;
	}> | null>(null);

	onMount(async () => {
		// A person with no links has nothing for an interactive canvas to show.
		if (nodes.length === 0) return;
		const module = await import('./GraphExplorer.svelte');
		Explorer = module.default;
	});
</script>

{#if Explorer}
	<div
		class="h-[24rem] overflow-hidden rounded-app border border-border lg:h-[28rem]"
		role="group"
		aria-label={t('graph.onPerson.label', { name: centerName })}
	>
		<Explorer {graph} {centerId} compact maxRings={PERSON_MAP_RINGS} {fullGraphHref} />
	</div>
{:else}
	<EgoGraph {centerName} {centerPhotoId} {nodes} />
{/if}
