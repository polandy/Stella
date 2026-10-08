<script lang="ts">
	import type { Snippet } from 'svelte';
	import { crossfade, glide } from '$lib/motion/motion.svelte';

	/*
	 * Two alternatives in one place — a line and the form that edits it, a question and its
	 * confirmation (docs/05 §5.11). The box glides from the height of the one to the height of
	 * the other while the two fade over each other, so nothing below jumps and no frame is blank.
	 *
	 * Both stand in one grid cell while they cross, so the one leaving keeps its place and adds
	 * no height of its own; it is inert from the moment it starts to go. Each keeps its own height
	 * (`self-start`) rather than stretching to the cell, so the box knows where it is going.
	 */
	interface Props {
		/** Which alternative shows: `children` when true, `otherwise` when false. */
		when: boolean;
		children: Snippet;
		otherwise?: Snippet;
		/** Classes for the box, e.g. its place in a parent grid. */
		class?: string;
		/** The glide has arrived; `grew` says which way, for a caller that keeps a button in view. */
		onsettled?: (grew: boolean) => void;
		'data-testid'?: string;
	}
	let {
		when,
		children,
		otherwise,
		class: className = '',
		onsettled,
		'data-testid': testId
	}: Props = $props();

	let box: HTMLDivElement | undefined = $state();
	/** The height of the alternative that is arriving — the leaving one is inert already. */
	function target(): number {
		const pane = box?.querySelector<HTMLElement>(
			`:scope > [data-pane="${when ? 'on' : 'off'}"]:not([inert])`
		);
		return pane?.getBoundingClientRect().height ?? 0;
	}
</script>

<div
	bind:this={box}
	class="grid grid-cols-1 {className}"
	use:glide={{ key: when, target, onsettled }}
	data-testid={testId}
>
	{#if when}
		<div class="col-start-1 row-start-1 min-w-0 self-start" data-pane="on" transition:crossfade>
			{@render children()}
		</div>
	{:else if otherwise}
		<div class="col-start-1 row-start-1 min-w-0 self-start" data-pane="off" transition:crossfade>
			{@render otherwise()}
		</div>
	{/if}
</div>
