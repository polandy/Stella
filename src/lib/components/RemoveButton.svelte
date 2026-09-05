<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import { submitAction } from '$lib/undo/submit-action';

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
		class?: string;
	}
	let { kind, id, action, fields, label, removed, bare = false, class: className = '' }: Props = $props();

	const removals = useRemovals();

	function defer(event: SubmitEvent) {
		event.preventDefault();
		const body = new FormData(event.currentTarget as HTMLFormElement);
		removals.remove({
			key: removalKey(kind, id),
			label: removed,
			commit: async () => {
				await submitAction(fetch, action, body);
				await invalidateAll();
			}
		});
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
