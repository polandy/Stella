<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import { useTranslate } from '#lib/i18n/context.svelte.js';
	import type { Outside } from '#lib/graph/cytoscape/viewport.js';

	/*
	 * The family tree's edge hint (docs/dev/05 §5.8): framed on the core family, the tree says how
	 * many stand off screen to either side, and a tap pans the view one screen that way.
	 */
	interface Props {
		outside: Outside;
		/** Screen pixels from the canvas's top, clear of the toolbar. */
		top: number;
		/** Screen pixels from the canvas's right, clear of a panel beside the map. */
		right: number;
		onStep: (side: keyof Outside) => void;
	}
	let { outside, top, right, onStep }: Props = $props();

	const t = useTranslate();
	const pill =
		'tap-target pointer-events-auto absolute flex items-center gap-1 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-fg-muted backdrop-blur transition-colors hover:text-fg';
</script>

{#if outside.left > 0}
	<button
		type="button"
		class="{pill} left-3"
		style="top: {top}px"
		aria-label={t('graph.tree.offScreenLeft', { count: outside.left })}
		data-testid="graph-off-screen-left"
		onclick={() => onStep('left')}
	>
		<Icon name="back" size={14} />
		{t('graph.tree.offScreen', { count: outside.left })}
	</button>
{/if}
{#if outside.right > 0}
	<button
		type="button"
		class={pill}
		style="top: {top}px; right: {right + 12}px"
		aria-label={t('graph.tree.offScreenRight', { count: outside.right })}
		data-testid="graph-off-screen-right"
		onclick={() => onStep('right')}
	>
		{t('graph.tree.offScreen', { count: outside.right })}
		<Icon name="forward" size={14} />
	</button>
{/if}
