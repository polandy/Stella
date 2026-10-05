<script lang="ts">
	import { onMount, tick, type Component } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import EgoGraph from '$lib/components/EgoGraph.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { dismissesFullscreenOnDrag } from '$lib/ui/fullscreen';
	import { mapViewAfter, type PhoneMapEvent, type PhoneMapView } from '$lib/graph/phone-map';
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
	}> | null>(null);

	/** Below `sm`: the preview stands in for the canvas (Tailwind's breakpoint, docs/05 §5.4). */
	const phone = new MediaQuery('(width < 40rem)', false);
	let view = $state<PhoneMapView>('preview');
	const go = (event: PhoneMapEvent) => (view = mapViewAfter(view, event));
	let enlargeButton = $state<HTMLButtonElement>();
	/** The disc an icon on the preview sits on, so it reads over the drawing in either theme. */
	const MAP_ICON_DISC = 'grid size-8 place-items-center rounded-full bg-card text-fg shadow-card';
	let enlargedFrame = $state<HTMLDivElement>();

	function openFullscreen(event: MouseEvent) {
		// A modified click means "elsewhere" — a new tab — which the link already does.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		if (!Explorer || !(document.fullscreenEnabled || dismissesFullscreenOnDrag(navigator))) return;
		event.preventDefault();
		go('openFullscreen');
	}

	/* The cursor goes with the map: to *Shrink map* when it grows, back to *Enlarge map* when it
	   shrinks, and the page keeps the card in view either way. */
	async function enlarge() {
		go('enlarge');
		await tick();
		enlargedFrame?.scrollIntoView({ block: 'start' });
		// The button is the explorer's own (its toolbar), so it is found rather than bound.
		enlargedFrame?.querySelector<HTMLButtonElement>('[data-map-shrink]')?.focus();
	}
	async function shrink() {
		go('shrink');
		await tick();
		enlargeButton?.scrollIntoView({ block: 'nearest' });
		enlargeButton?.focus();
	}

	onMount(async () => {
		// A person with no links has nothing for an interactive canvas to show.
		if (nodes.length === 0) return;
		const module = await import('./GraphExplorer.svelte');
		Explorer = module.default;
	});
</script>

{#if Explorer && (!phone.current || view !== 'preview')}
	{#if phone.current && view === 'enlarged'}
		<!--
			Enlarged inside the card: about a screen's height less the top bar, the jump bar and the tab
			bar, so the whole map fits on one screen with a strip of page below it to scroll by — the
			canvas takes a swipe as a pan, so it must never fill the screen. *Shrink map* is in the
			map's own toolbar, beside full screen.
		-->
		<div
			bind:this={enlargedFrame}
			class="h-[calc(100dvh-12.75rem)] min-h-80 scroll-mt-2 overflow-hidden rounded-app border border-border"
			role="group"
			aria-label={t('graph.onPerson.label', { name: centerName })}
			data-testid="person-map-enlarged"
		>
			<Explorer {graph} {centerId} compact maxRings={PERSON_MAP_RINGS} {fullGraphHref} onShrink={shrink} />
		</div>
	{:else}
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
	{/if}
{:else}
	<!-- Both drawn by the server, the width picks one: the phone's preview, the map elsewhere. -->
	<div
		class="relative h-25 overflow-hidden rounded-app border border-border bg-bg-sunken sm:hidden"
		data-testid="person-map-preview"
	>
		<!--
			The whole picture is the way to enlarge it, its icon in the corner beside full screen's;
			until the engine is here there is nothing to enlarge. Each icon is a 44 px target around
			a smaller disc, so the drawing keeps its room.
		-->
		<button
			bind:this={enlargeButton}
			type="button"
			onclick={enlarge}
			disabled={!Explorer}
			aria-label={t('graph.onPerson.enlarge')}
			title={t('graph.onPerson.enlarge')}
			class="block size-full py-1.5 text-left"
		>
			<EgoGraph {centerName} {centerPhotoId} {nodes} thumbnail />
			<span class="absolute right-13 bottom-1 grid size-11 place-items-center" class:invisible={!Explorer}>
				<span class={MAP_ICON_DISC}><Icon name="enlargeMap" size={15} /></span>
			</span>
		</button>
		<a
			href={fullGraphHref(centerId)}
			onclick={openFullscreen}
			aria-label={t('graph.fullscreen.enter')}
			title={t('graph.fullscreen.enter')}
			class="absolute right-1 bottom-1 grid size-11 place-items-center"
		>
			<span class={MAP_ICON_DISC}><Icon name="enterFullscreen" size={15} /></span>
		</a>
	</div>
	<div class="max-sm:hidden">
		<EgoGraph {centerName} {centerPhotoId} {nodes} />
	</div>
{/if}
