<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';

	/*
	 * Edit one line where it is read (docs/02 §2.2, docs/05 §5.7). Click the value, a field
	 * appears in its place, Enter saves and Escape puts it back. It is a real form posting to a
	 * real action, so it works without JavaScript too — then the field is simply always open.
	 *
	 * The value is not bound to the page's data: the input keeps the draft, and only a save
	 * changes what the page shows. Cancelling therefore needs no undo.
	 */
	interface Props {
		/** The action to post to, e.g. `?/editProfile`. */
		action: string;
		/** The field being edited, and the current value. */
		name: string;
		value: string;
		/** Fields the action needs that this control does not edit. */
		extra?: Record<string, string>;
		/** What a screen reader hears on the trigger, e.g. "Edit name". */
		label: string;
		placeholder?: string;
		/** An error from the last save; keeps the editor open so the message has a home. */
		error?: string | null;
		/** Larger type for the person's name; the description stays body-sized. */
		heading?: boolean;
		/** Shown in place of an empty value, e.g. "Add a description". */
		empty?: string;
	}
	let {
		action,
		name,
		value,
		extra = {},
		label,
		placeholder = '',
		error = null,
		heading = false,
		empty = 'Add'
	}: Props = $props();

	let editing = $state(false);
	// Seeded on each open, not from the prop: the draft is this control's own state, and a page
	// update while the field is open must not overwrite what is being typed.
	let draft = $state('');
	let field = $state<HTMLInputElement | null>(null);
	const open = $derived(editing || error !== null);
	// Saving says *Saved* in the toast region like every other form (docs/05 §5.7).
	const saved = savedEnhance(useRemovals(), () => (editing = false));

	function start() {
		draft = value;
		editing = true;
	}

	function cancel() {
		editing = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			cancel();
		}
	}

	// Focus the field the moment it appears, so the click lands in the text.
	$effect(() => {
		if (open) field?.focus();
	});
</script>

{#if open}
	<form
		method="POST"
		{action}
		class="flex items-center gap-2"
		use:enhance={saved}
	>
		{#each Object.entries(extra) as [key, val] (key)}
			<input type="hidden" name={key} value={val} />
		{/each}
		<input
			bind:this={field}
			bind:value={draft}
			{name}
			{placeholder}
			aria-label={label}
			onkeydown={onKeydown}
			class="min-w-0 flex-1 rounded-control border border-border bg-bg px-2 py-1 text-fg outline-none focus:border-primary"
			class:text-2xl={heading}
			class:font-semibold={heading}
		/>
		<Button variant="primary" size="sm">Save</Button>
		<Button variant="ghost" size="sm" type="button" onclick={cancel}>Cancel</Button>
	</form>
	{#if error}<p class="mt-1 text-sm text-danger">{error}</p>{/if}
{:else}
	<!--
		The trigger is named by the value itself, never by an `aria-label`: this button sits
		inside the page's `h1`, and a label here would replace the heading's accessible name
		with "Edit name". The affordance is carried by the tooltip instead.
	-->
	<button
		type="button"
		onclick={start}
		title={label}
		class="group/inline -mx-1 flex max-w-full items-center gap-1.5 rounded-control px-1 text-left transition-colors hover:bg-card-hover"
	>
		{#if value}
			<span class="truncate" class:text-2xl={heading} class:font-semibold={heading}>{value}</span>
		{:else}
			<span class="text-fg-subtle">{empty}</span>
		{/if}
	</button>
{/if}
