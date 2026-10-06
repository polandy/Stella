<script lang="ts">
	import FormError from '$lib/components/FormError.svelte';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { focusLeftForm, owesFocusBack } from '$lib/ui/focus-return';
	import { focusDestination } from '$lib/ui/focus-destination';
	import { tick } from 'svelte';

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
		/** Shown in place of an empty value, e.g. "Add a description"; defaults to *Add*. */
		empty?: string;
		/**
		 * Show a pencil beside the value. For a value that does not look editable on its own — a
		 * small heading — and on touch, where the tooltip that otherwise says so never appears.
		 */
		pencil?: boolean;
		/** Classes for the value as read, when it is styled unlike the field it opens into. */
		valueClass?: string;
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
		empty,
		pencil = false,
		valueClass = ''
	}: Props = $props();

	const t = useTranslate();
	const uid = $props.id();
	const errorId = `${uid}-error`;
	const emptyLabel = $derived(empty ?? t('common.add'));

	let editing = $state(false);
	// Seeded on each open, not from the prop: the draft is this control's own state, and a page
	// update while the field is open must not overwrite what is being typed.
	let draft = $state('');
	let field = $state<HTMLInputElement | null>(null);
	const open = $derived(editing || error !== null);
	// Saving says *Saved* in the toast region like every other form (docs/05 §5.7).
	const saved = savedEnhance(useRemovals(), t('components.saved'), () => (editing = false));

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

	/*
	 * And hand it back to the value once the field goes — saved, cancelled or escaped — so the
	 * next Tab carries on from here rather than from the top of the page (WCAG 2.4.3).
	 */
	let trigger = $state<HTMLButtonElement | null>(null);
	let focusInForm = false;
	let wasOpen = false;
	function onFocusOut(event: FocusEvent) {
		const formEl = event.currentTarget as HTMLFormElement;
		if (focusLeftForm(focusDestination(formEl, event.relatedTarget))) focusInForm = false;
	}
	$effect(() => {
		const justClosed = wasOpen && !open;
		wasOpen = open;
		if (!justClosed) return;
		const hadFocusInside = focusInForm;
		focusInForm = false;
		void tick().then(() => {
			const active = document.activeElement;
			const focusNow = active === null || active === document.body ? 'page' : 'elsewhere';
			if (owesFocusBack({ hadFocusInside, focusNow })) trigger?.focus();
		});
	});
</script>

{#if open}
	<form
		method="POST"
		{action}
		class="flex items-center gap-2"
		use:enhance={saved}
		onfocusin={() => (focusInForm = true)}
		onfocusout={onFocusOut}
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
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? errorId : undefined}
			onkeydown={onKeydown}
			class="min-w-0 flex-1 rounded-control border border-border-input bg-bg px-2 py-1 text-fg outline-none focus:border-primary"
			class:text-2xl={heading}
			class:font-semibold={heading}
		/>
		<Button variant="primary" size="sm">{t('common.save')}</Button>
		<Button variant="ghost" size="sm" type="button" onclick={cancel}>{t('common.cancel')}</Button>
	</form>
	<FormError message={error} id={errorId} variant="inline" class="mt-1" />
{:else}
	<!--
		The trigger is named by the value itself, never by an `aria-label`: this button sits
		inside the page's `h1`, and a label here would replace the heading's accessible name
		with "Edit name". The affordance is carried by the tooltip instead.
	-->
	<button
		bind:this={trigger}
		type="button"
		onclick={start}
		title={label}
		class="group/inline -mx-1 flex max-w-full items-center gap-1.5 rounded-control px-1 text-left transition-colors hover:bg-card-hover"
		class:min-h-8={pencil}
	>
		<!-- The pencil follows the value with no whitespace, which would join a heading's text. -->
		{#if value}
			<span class="truncate {valueClass}" class:text-2xl={heading} class:font-semibold={heading}
				>{value}</span
			>
		{:else}
			<span class="text-fg-subtle">{emptyLabel}</span>
		{/if}{#if pencil}<Icon name="rename" size={14} class="text-fg-subtle" />{/if}
	</button>
{/if}
