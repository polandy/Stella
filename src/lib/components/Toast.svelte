<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';

	/*
	 * The toast region (docs/05 §5.7): bottom-left, one card per message. A removal's card
	 * carries Undo for as long as the removal is held back; a notice is read-only and goes on
	 * its own. A polite live region (no `status` role, which would make it the page's second
	 * status and steal `getByRole('status')` from inline hints) so a screen reader hears
	 * "Entry removed" without losing focus.
	 */
	const removals = useRemovals();
</script>

<div
	class="pointer-events-none fixed bottom-20 left-4 z-30 flex max-w-[calc(100vw-2rem)] flex-col gap-2 md:bottom-4 md:left-[17rem]"
	aria-live="polite"
	data-testid="toasts"
>
	{#each removals.snapshot.removals as removal (removal.key)}
		<div class="toast" data-testid="toast-undo">
			<span class="pl-2">{removal.label}</span>
			<Button variant="secondary" size="sm" onclick={() => removals.undo(removal.key)}>Undo</Button>
		</div>
	{/each}
	{#each removals.snapshot.notices as notice (notice.id)}
		<div class="toast" data-testid="toast-notice">
			<span class="px-2">{notice.text}</span>
		</div>
	{/each}
</div>

<style>
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		border-radius: var(--radius-app);
		border: 1px solid var(--border);
		background: var(--card);
		padding: 0.375rem 0.375rem 0.375rem 0.5rem;
		font-size: 0.875rem;
		color: var(--fg);
		box-shadow: var(--shadow-pop);
		animation: toast-in 160ms ease-out;
	}
	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(0.5rem);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.toast {
			animation: none;
		}
	}
</style>
