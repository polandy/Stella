<script lang="ts">
	/*
	 * "Still working" said as quietly as it can be said (docs/05 §5.7).
	 *
	 * A save that reloads what is on screen — a relationship change and the graph behind it —
	 * can take long enough to read as nothing having happened. This marks the section that is
	 * catching up without taking it away: the content stays put, stays readable and stays
	 * usable, and the badge disappears again by itself.
	 *
	 * The live region is always mounted, so a screen reader hears the badge arrive rather than
	 * the whole region appear.
	 */
	let { busy = false, label }: { busy?: boolean; label: string } = $props();
</script>

<span
	role="status"
	aria-live="polite"
	class="inline-flex min-h-6 items-center gap-2 rounded-full text-xs text-fg-muted transition-opacity"
	class:bg-primary-soft={busy}
	class:px-2.5={busy}
>
	{#if busy}
		<!-- Decorative: the label beside it says the same thing, and in words. -->
		<span
			aria-hidden="true"
			class="size-3 animate-spin rounded-full border-2 border-primary-soft border-t-primary motion-reduce:animate-none"
		></span>
		{label}
	{/if}
</span>
