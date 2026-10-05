<script lang="ts">
	import { onMount, tick, type Component } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import EgoGraph from '$lib/components/EgoGraph.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { dismissesFullscreenOnDrag } from '$lib/ui/fullscreen';
	import { PHONE_MAP_AT_REST, mapLayers, phoneMapAfter, type PhoneMapStep } from '$lib/graph/phone-map';
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
	 * preview offers two ways in, two icons in its corner (docs/05 §5.5): *Enlarge map* grows
	 * this same explorer inside the card to about a screen's height, the reader still on the
	 * page, and *Shrink map* in the map's own toolbar puts the preview back; *Full screen* opens
	 * it full screen, and leaving full screen brings the preview back. Without full screen — or
	 * before the engine has arrived — that second one is a plain link into the graph. `mapViewAfter` decides which view follows which.
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
		onShrink?: () => void;
		onReady?: () => void;
	}> | null>(null);

	/** Below `sm`: the preview stands in for the canvas (Tailwind's breakpoint, docs/05 §5.4). */
	const phone = new MediaQuery('(width < 40rem)', false);
	const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)', false);
	let mapState = $state(PHONE_MAP_AT_REST);
	const view = $derived(mapState.view);
	const layers = $derived(mapLayers(mapState));
	function go(step: PhoneMapStep) {
		mapState = phoneMapAfter(mapState, step);
		// Without motion there is no glide to wait for: the height is where it goes at once.
		
		void handFocusOver();
	}
	/** *Enlarge map* was pressed and the cursor goes to *Shrink map* once the live map shows. */
	let focusFollows = false;
	async function handFocusOver() {
		if (!focusFollows || !mapLayers(mapState).explorerShown) return;
		focusFollows = false;
		await tick();
		// The button is the explorer's own (its toolbar), so it is found rather than bound.
		frame?.querySelector<HTMLButtonElement>('[data-map-shrink]')?.focus({ preventScroll: true });
	}
	let enlargeButton = $state<HTMLButtonElement>();
	/** The disc an icon on the preview sits on, so it reads over the drawing in either theme. */
	const MAP_ICON_DISC = 'grid size-8 place-items-center rounded-full bg-card text-fg shadow-card';
	/**
	 * The enlarged height: about a screen less the top bar, the jump bar and the tab bar, so the
	 * whole map fits on one screen with a strip of page below it to scroll by — the canvas takes
	 * a swipe as a pan, so it must never fill the screen. The live map is mounted at this height
	 * once the frame has glided there and keeps it while the frame shrinks over it, so its
	 * canvas is never resized while the frame moves and is framed once, at its final size.
	 */
	const ENLARGED_HEIGHT = 'h-[max(20rem,calc(100dvh-12.75rem))]';
	let frame = $state<HTMLDivElement>();
	const scrolling = (): ScrollBehavior => (reducedMotion.current ? 'auto' : 'smooth');

	/* The frame's height has arrived. Only its own height counts: the fades inside it end too,
	   and a reversed glide cancels the first one without having arrived anywhere. */
	function arrived(event: TransitionEvent) {
		if (event.target !== frame || event.propertyName !== 'height') return;
		go('settled');
		if (view === 'enlarged') frame?.scrollIntoView({ block: 'start', behavior: scrolling() });
		else enlargeButton?.scrollIntoView({ block: 'nearest', behavior: scrolling() });
	}
	// A frame that stops being shown mid-glide (the window widened past `sm`) never arrives.
	$effect(() => {
		if (!phone.current && !mapState.settled) go('settled');
	});

	function openFullscreen(event: MouseEvent) {
		// A modified click means "elsewhere" — a new tab — which the link already does.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		if (!Explorer || !(document.fullscreenEnabled || dismissesFullscreenOnDrag(navigator))) return;
		event.preventDefault();
		go('openFullscreen');
	}

	/* The cursor goes with the map: to *Shrink map* once it has grown, back to *Enlarge map* as
	   it shrinks, and the page keeps the card in view either way. */
	async function enlarge() {
		// Until the live map shows, the cursor stays on this button, which is still there.
		focusFollows = true;
		go('enlarge');
		await tick();
		// The frame's top stays put while it grows, so the page can glide there alongside it.
		frame?.scrollIntoView({ block: 'start', behavior: scrolling() });
	}
	async function shrink() {
		focusFollows = false;
		go('shrink');
		await tick();
		// The card's top holds still while the frame shrinks under it; nothing to scroll yet.
		enlargeButton?.focus({ preventScroll: true });
	}

	onMount(async () => {
		// A person with no links has nothing for an interactive canvas to show.
		if (nodes.length === 0) return;
		const module = await import('./GraphExplorer.svelte');
		Explorer = module.default;
	});
</script>

{#if Explorer && (!phone.current || view === 'fullscreen')}
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
			startFullscreen={view === 'fullscreen'}
			onFullscreenExit={() => go('leftFullscreen')}
		/>
	</div>
{:else}
	<!--
		Both drawn by the server, the width picks one: the phone's frame, the map elsewhere. The
		phone's frame holds the preview and, once enlarged, the live map under it; its height
		glides between the two and the layers cross-fade (`mapLayers`, docs/05 §5.5).
	-->
	<div
		bind:this={frame}
		class="relative scroll-mt-2 overflow-hidden rounded-app border border-border bg-bg-sunken transition-[height] duration-300 ease-[cubic-bezier(0.2,0,0,1)] sm:hidden {layers.tall
			? 'h-50 min-w-[380px]'
			: 'h-25'}"
		style:contain={mapState.settled ? undefined : 'layout'}
		ontransitionend={arrived}
		data-testid="person-map-preview"
	>
		{#if Explorer && layers.explorerMounted}
			<div
				class="absolute inset-x-0 top-0 transition-opacity duration-200 {ENLARGED_HEIGHT}"
				class:opacity-0={!layers.explorerShown}
				class:pointer-events-none={!layers.explorerShown}
				inert={!layers.tall}
				role="group"
				aria-label={t('graph.onPerson.label', { name: centerName })}
				data-testid="person-map-enlarged"
			>
				<Explorer
					{graph}
					{centerId}
					compact
					maxRings={PERSON_MAP_RINGS}
					{fullGraphHref}
					onShrink={shrink}
					onReady={() => go('drawn')}
				/>
			</div>
		{/if}
		<!--
			The whole picture is the way to enlarge it, its icon in the corner beside full screen's;
			until the engine is here there is nothing to enlarge. Each icon is a 44 px target around
			a smaller disc, so the drawing keeps its room. The drawing keeps its size and rides in the
			middle of the frame while it grows, until the live map has drawn and takes over.
		-->
		<div
			class="absolute inset-0 bg-bg-sunken transition-opacity duration-200"
			class:opacity-0={!layers.previewShown}
			class:pointer-events-none={!layers.previewControlsShown}
			inert={!layers.previewShown}
		>
			<button
				bind:this={enlargeButton}
				type="button"
				onclick={enlarge}
				disabled={!Explorer}
				aria-label={t('graph.onPerson.enlarge')}
				title={t('graph.onPerson.enlarge')}
				class="flex size-full items-center text-left"
			>
				<span class="block h-22 w-full"><EgoGraph {centerName} {centerPhotoId} {nodes} thumbnail /></span>
			</button>
			<div
				class="pointer-events-none absolute right-1 bottom-1 flex transition-opacity duration-200"
				class:opacity-0={!layers.previewControlsShown}
			>
				<span class="grid size-11 place-items-center" class:invisible={!Explorer}>
					<span class={MAP_ICON_DISC}><Icon name="enlargeMap" size={15} /></span>
				</span>
				<a
					href="/graph"
					onclick={openFullscreen}
					aria-label={t('graph.fullscreen.enter')}
					title={t('graph.fullscreen.enter')}
					class="grid size-11 place-items-center"
					class:pointer-events-auto={layers.previewControlsShown}
				>
					<span class={MAP_ICON_DISC}><Icon name="enterFullscreen" size={15} /></span>
				</a>
			</div>
		</div>
	</div>
	<div class="max-sm:hidden">
		<EgoGraph {centerName} {centerPhotoId} {nodes} />
	</div>
{/if}
