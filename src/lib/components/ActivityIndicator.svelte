<script lang="ts">
	/*
	 * "Still working", said once for the whole app (docs/05 §5.7).
	 *
	 * A change that reloads what is on screen — a relationship and the graph behind it — or a
	 * page that is still loading, shows as a small label under the top edge of the window. It is
	 * fixed to the viewport and so takes **no space in the layout**: an indicator that pushes the
	 * page down as it appears makes the wait worse than showing nothing, because the line
	 * somebody was reading moves out from under them. Nothing is dimmed, covered or disabled
	 * while it runs.
	 *
	 * It arrives and leaves on a short fade — the shape is quiet enough that appearing outright
	 * reads as a flash, and a wait that announces itself abruptly feels longer than it is.
	 *
	 * The live region is always mounted, so a screen reader hears the work start rather than the
	 * region appear; the spinner is decorative and `label` is what is announced.
	 */
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';

	let { busy = false, label }: { busy?: boolean; label: string } = $props();

	/** Motion is the decoration here, so it is the first thing to go when it is not wanted. */
	const enterMs = $derived(prefersReducedMotion.current ? 0 : 260);
	const leaveMs = $derived(prefersReducedMotion.current ? 0 : 180);
</script>

<div role="status" aria-live="polite" class="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center">
	{#if busy}
		<div
			in:fly={{ y: -12, duration: enterMs, easing: cubicOut }}
			out:fade={{ duration: leaveMs }}
			data-testid="activity-indicator"
			class="flex items-center gap-2.5 rounded-full bg-card/95 py-2 pl-3 pr-4 text-sm font-medium text-fg shadow-pop ring-1 ring-border-subtle backdrop-blur-sm"
		>
			<span
				aria-hidden="true"
				class="size-4 shrink-0 animate-spin rounded-full border-2 border-primary-soft border-t-primary motion-reduce:animate-none"
			></span>
			{label}
		</div>
	{/if}
</div>
