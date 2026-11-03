<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
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
{#if exportable}
	<Button
		variant="ghost"
		size="sm"
		icon="export"
		label={t('graph.export.open')}
		title={t('graph.export.open')}
		data-testid="tree-export-open"
		class="pointer-events-auto {onShrink ? '' : 'ml-auto'}"
		onclick={onExport}
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
		class="pointer-events-auto {onShrink || exportable ? '' : 'ml-auto'}"
		onclick={screen.toggle}
	/>
{/if}
{#if !compact}
	<button
		onclick={onTogglePath}
		aria-pressed={pathMode}
		class="pointer-events-auto rounded-full border px-3 py-1 text-xs font-medium backdrop-blur transition-colors {pathMode
			? 'border-transparent bg-warning-soft text-fg'
			: 'border-border bg-card/90 text-fg-muted hover:text-fg'}"
	>
		{t('graph.connectionPath')}
	</button>
{/if}
