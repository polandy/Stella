<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/icons';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { FrameFullscreen } from './frame-fullscreen.svelte';

	/*
	 * The toolbar's right end: shrinking the map, exporting the tree, full screen and the
	 * connection path. The first of them present pushes them all to the right.
	 */
	let {
		compact,
		onShrink,
		exportable,
		onExport,
		screen,
		pathMode,
		onTogglePath
	}: {
		compact: boolean;
		onShrink?: () => void;
		exportable: boolean;
		onExport: () => void;
		screen: FrameFullscreen;
		pathMode: boolean;
		onTogglePath: () => void;
	} = $props();

	const t = useTranslate();
</script>

<!--
	A ghost icon button that turns a round pill on a phone, matching Filter, Arrange and the
	connection path there. A plain button: Button's scoped styles would outrank the phone utilities.
-->
{#snippet viewButton(
	icon: IconName,
	label: string,
	onclick: () => void,
	extra: { pushRight: boolean; pressed?: boolean; attrs?: Record<string, string> }
)}
	<button
		{onclick}
		aria-label={label}
		aria-pressed={extra.pressed}
		title={label}
		{...extra.attrs}
		class="tap-target pointer-events-auto grid place-items-center text-fg-muted transition-colors hover:text-fg max-sm:size-9 max-sm:rounded-full max-sm:border max-sm:border-border max-sm:bg-card/90 max-sm:backdrop-blur sm:rounded-control sm:p-1.5 sm:hover:bg-bg-sunken {extra.pushRight
			? 'ml-auto'
			: ''}"
	>
		<Icon name={icon} size={16} />
	</button>
{/snippet}

{#if onShrink}
	{@render viewButton('shrinkMap', t('graph.onPerson.shrink'), onShrink, {
		pushRight: true,
		attrs: { 'data-map-shrink': '' }
	})}
{/if}
{#if exportable}
	{@render viewButton('export', t('graph.export.open'), onExport, {
		pushRight: !onShrink,
		attrs: { 'data-testid': 'tree-export-open' }
	})}
{/if}
{#if screen.available}
	{@render viewButton(
		screen.on ? 'exitFullscreen' : 'enterFullscreen',
		t(screen.on ? 'graph.fullscreen.exit' : 'graph.fullscreen.enter'),
		screen.toggle,
		{ pushRight: !onShrink && !exportable, pressed: screen.on }
	)}
{/if}
{#if !compact}
	<!-- An icon on a phone, so the toolbar keeps one row beside the search. -->
	<button
		type="button"
		onclick={onTogglePath}
		aria-pressed={pathMode}
		aria-label={t('graph.connectionPath')}
		class="tap-target pointer-events-auto rounded-full border px-3 py-1 text-xs font-medium backdrop-blur transition-colors max-sm:grid max-sm:size-9 max-sm:place-items-center max-sm:p-0 {pathMode
			? 'border-transparent bg-warning-soft text-fg'
			: 'border-border bg-card/90 text-fg-muted hover:text-fg'}"
	>
		<Icon name="connectionPath" size={16} class="sm:hidden" />
		<span class="max-sm:hidden">{t('graph.connectionPath')}</span>
	</button>
{/if}
