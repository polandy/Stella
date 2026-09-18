<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { deferredRemoval } from '$lib/undo/deferred-removal';
	import type { RemovalKind } from '$lib/undo/keys';
	import type { PendingSink } from '$lib/sync/pending-work';

	/*
	 * The one way to remove something with undo (docs/02 §2.23). It is a real form with the
	 * action's own fields, so it still works without JavaScript; with JavaScript the submit is
	 * held back and the toast offers Undo. The list around it hides the row whose key is
	 * pending — `removalKey(kind, id)` builds the same key on both sides.
	 */
	interface Props {
		/** What is being removed; with `id` it makes the key the surrounding list checks. */
		kind: RemovalKind;
		id: string;
		/** The form action, e.g. `?/removeField`. */
		action: string;
		/** The action's own form fields, e.g. `{ fieldId: f.id }`. */
		fields: Record<string, string>;
		/** The button's accessible name, e.g. "Remove birthday". */
		label: string;
		/** What the toast says, e.g. "Date removed". */
		removed: string;
		/** A bare icon for a chip, where a bordered button would be too much. */
		bare?: boolean;
		/**
		 * Counts the commit — the real request plus the reload behind it — for a section that
		 * shows how long it is taking. The undo window itself is not counted: nothing is on its
		 * way to the server yet (docs/05 §5.7).
		 */
		pending?: PendingSink;
		class?: string;
	}
	let {
		kind,
		id,
		action,
		fields,
		label,
		removed,
		bare = false,
		pending,
		class: className = ''
	}: Props = $props();

	const removals = useRemovals();

	function defer(event: SubmitEvent) {
		event.preventDefault();
		const body = new FormData(event.currentTarget as HTMLFormElement);
		removals.remove(
			deferredRemoval(
				{ kind, id, label: removed, action, body },
				{ fetch, reload: invalidateAll, pending }
			)
		);
	}
</script>

<form method="POST" {action} class={className} onsubmit={defer}>
	{#each Object.entries(fields) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
	{#if bare}
		<button class="opacity-60 transition-opacity hover:opacity-100" aria-label={label}>
			<Icon name="remove" size={13} />
		</button>
	{:else}
		<Button variant="danger" size="sm" icon="remove" {label} title={label} />
	{/if}
</form>
