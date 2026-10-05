<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import EgoGraph from '$lib/components/EgoGraph.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { dismissesFullscreenOnDrag } from '$lib/ui/fullscreen';
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
	 *
	 * On a phone the map is a preview: a card-sized canvas there is too small to read and too
	 * easy to pan by accident while scrolling past it, and it held the photos a screen away. The
	 * preview is one link, *View in the graph*; with script it opens this same explorer full
	 * screen, and leaving full screen brings the preview back (docs/05 §5.5). Without full
	 * screen — or before the engine has arrived — it is what it says, a link into the graph.
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
		startFullscreen?: boolean;
		onFullscreenExit?: () => void;
	}> | null>(null);

	/** Below `sm`: the preview stands in for the canvas (Tailwind's breakpoint, docs/05 §5.4). */
	const phone = new MediaQuery('(width < 40rem)', false);
	/** The preview was tapped and the explorer is up, full screen. */
	let opened = $state(false);

	function openFullscreen(event: MouseEvent) {
		// A modified click means "elsewhere" — a new tab — which the link already does.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		if (!Explorer || !(document.fullscreenEnabled || dismissesFullscreenOnDrag(navigator))) return;
		event.preventDefault();
		opened = true;
	}

	onMount(async () => {
		// A person with no links has nothing for an interactive canvas to show.
		if (nodes.length === 0) return;
		const module = await import('./GraphExplorer.svelte');
		Explorer = module.default;
	});
</script>

{#if Explorer && (!phone.current || opened)}
	<div
		class="h-[24rem] overflow-hidden rounded-app border border-border"
		role="group"
		aria-label={t('graph.onPerson.label', { name: centerName })}
	>
		<Explorer
			{graph}
			{centerId}
			compact
			maxRings={PERSON_MAP_RINGS}
			{fullGraphHref}
			startFullscreen={opened}
			onFullscreenExit={() => (opened = false)}
		/>
	</div>
{:else}
	<!-- Both drawn by the server, the width picks one: the phone's preview, the map elsewhere. -->
	<a
		href={fullGraphHref(centerId)}
		onclick={openFullscreen}
		class="relative block h-25 overflow-hidden rounded-app border border-border bg-bg-sunken py-1.5 sm:hidden"
		data-testid="person-map-preview"
	>
		<EgoGraph {centerName} {centerPhotoId} {nodes} thumbnail />
		<span
			class="absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-medium text-fg shadow-card"
		>
			<Icon name="enterFullscreen" size={13} />{t('graph.onPerson.view')}
		</span>
	</a>
	<div class="max-sm:hidden">
		<EgoGraph {centerName} {centerPhotoId} {nodes} />
	</div>
{/if}
