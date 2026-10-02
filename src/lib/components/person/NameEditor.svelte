<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import Button from '$lib/components/Button.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { withNameParts } from '$lib/people/display-name';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { focusDestination } from '$lib/ui/focus-destination';
	import { focusLeftForm, owesFocusBack } from '$lib/ui/focus-return';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';

	/*
	 * The person's name, edited where it is read (docs/02 §2.2, docs/concepts/surnames.md §3.4).
	 * A tap on the name opens one editor for all of it: first name, last name, nickname and,
	 * below them, *Shown as*. While the shown name follows the parts it changes as they are
	 * typed; once the member types their own, it stays as typed. The server applies the same rule
	 * (`withNameEdit`), so a form without JavaScript, or a stale one, ends up the same way.
	 *
	 * Built for a finger first (docs/05 §5.9): on a coarse pointer every control here is at least
	 * 44 px tall with room between neighbours, and the fields use 16 px text so a phone does not
	 * zoom into them. Enter saves, Escape puts everything back, and focus returns to the name.
	 */
	let {
		name,
		shownNameChosen,
		error = null
	}: {
		name: {
			displayName: string;
			firstName: string | null;
			lastName: string | null;
			nickname: string | null;
			formerName: string | null;
		};
		shownNameChosen: boolean;
		error?: string | null;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const uid = $props.id();
	let editing = $state(false);
	const open = $derived(editing || error !== null);

	/*
	 * The drafts are this editor's own: seeded from the stored name (also for an editor opened by
	 * a refused save) and again on each open, never overwritten while being typed.
	 */
	// svelte-ignore state_referenced_locally
	let firstName = $state(name.firstName ?? '');
	// svelte-ignore state_referenced_locally
	let lastName = $state(name.lastName ?? '');
	// svelte-ignore state_referenced_locally
	let nickname = $state(name.nickname ?? '');
	// svelte-ignore state_referenced_locally
	let shownAs = $state(name.displayName);
	// svelte-ignore state_referenced_locally
	let following = $state(!shownNameChosen);
	// svelte-ignore state_referenced_locally
	let keepFormerName = $state(!name.formerName);

	function start() {
		firstName = name.firstName ?? '';
		lastName = name.lastName ?? '';
		nickname = name.nickname ?? '';
		shownAs = name.displayName;
		following = !shownNameChosen;
		// Ticked while no former name is on record; replacing one is a decision, not a default.
		keepFormerName = !name.formerName;
		editing = true;
	}

	/** While it follows, *Shown as* is what the server would make of these parts. */
	function partsTyped() {
		if (following) shownAs = withNameParts(name, { firstName, lastName, nickname }, i18n.locale).displayName;
	}

	const replacing = $derived(name.lastName !== null && lastName.trim() !== '' && lastName.trim() !== name.lastName);
	// Editing is not queued like adding (docs/02 §2.18), so Save waits for a connection.
	const offline = $derived(!reachability.reachable);
	const saved = savedEnhance(useRemovals(), t('components.saved'), () => (editing = false));

	let field = $state<HTMLInputElement | null>(null);
	$effect(() => {
		if (open) field?.focus();
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		editing = false;
	}

	// Focus goes back to the name once the editor closes, so the next Tab carries on from here.
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

	const FIELD =
		'w-full min-w-0 rounded-control border border-border-input bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:border-primary pointer-coarse:min-h-11 pointer-coarse:text-base';
	const LABEL = 'flex flex-col gap-1 text-xs text-fg-muted';
</script>

{#if open}
	<h1 class="truncate text-2xl font-semibold tracking-tight text-fg">{name.displayName}</h1>
	<!-- Escape from any of its fields lands here; the fields themselves stay plain inputs. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<form
		method="POST"
		action="?/editNameParts"
		use:enhance={saved}
		onkeydown={onKeydown}
		onfocusin={() => (focusInForm = true)}
		onfocusout={onFocusOut}
		class="mt-2 flex flex-col gap-2 rounded-app bg-bg-sunken p-3 pointer-coarse:gap-3"
		data-testid="name-editor"
	>
		<div class="grid gap-2 sm:grid-cols-3 pointer-coarse:gap-3">
			<label class={LABEL} for="{uid}-first">
				{t('contact.nameParts.firstName')}
				<input id="{uid}-first" bind:this={field} name="firstName" bind:value={firstName} oninput={partsTyped} autocomplete="off" class={FIELD} />
			</label>
			<label class={LABEL} for="{uid}-last">
				{t('contact.nameParts.lastName')}
				<input id="{uid}-last" name="lastName" bind:value={lastName} oninput={partsTyped} autocomplete="off" class={FIELD} />
			</label>
			<label class={LABEL} for="{uid}-nick">
				{t('contact.nameParts.nickname')}
				<input id="{uid}-nick" name="nickname" bind:value={nickname} oninput={partsTyped} autocomplete="off" class={FIELD} />
			</label>
		</div>
		<label class={LABEL} for="{uid}-shown">
			{t('contact.nameParts.shownAs')}
			<input
				id="{uid}-shown"
				name="displayName"
				bind:value={shownAs}
				oninput={() => (following = false)}
				autocomplete="off"
				aria-invalid={error ? 'true' : undefined}
				aria-describedby="{uid}-shown-hint"
				class={FIELD}
			/>
			<span id="{uid}-shown-hint" class="text-fg-subtle">
				{following ? t('contact.nameParts.shownAsFollows') : t('contact.nameParts.shownAsChosen')}
			</span>
		</label>
		{#if replacing}
			<label class="flex items-center gap-2 text-sm text-fg pointer-coarse:min-h-11 pointer-coarse:gap-3">
				<input type="checkbox" name="keepFormerName" class="size-5 shrink-0" bind:checked={keepFormerName} />
				{t('contact.nameParts.keepFormer', { name: name.lastName ?? '' })}
			</label>
		{/if}
		<FormError message={error} variant="inline" size="xs" />
		{#if offline}
			<p class="text-xs text-fg-muted">{t('surnames.offline')}</p>
		{/if}
		<div class="flex gap-2 pointer-coarse:gap-3">
			<Button variant="primary" size="sm" class="pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:px-4" disabled={offline}>{t('common.save')}</Button>
			<Button variant="ghost" size="sm" type="button" class="pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:px-4" onclick={() => (editing = false)}>
				{t('common.cancel')}
			</Button>
		</div>
	</form>
{:else}
	<!--
		The whole name line is the target, with a pencil that says so on touch too. Named by the
		value itself, never by an `aria-label`: it sits inside the page's `h1`, and a label would
		replace the heading's accessible name.
	-->
	<h1 class="tracking-tight text-fg">
		<button
			bind:this={trigger}
			type="button"
			onclick={start}
			title={t('contact.editName')}
			class="-mx-1 flex w-full max-w-full items-center gap-2 rounded-control px-1 text-left transition-colors hover:bg-card-hover pointer-coarse:min-h-11"
		>
			<span class="truncate text-2xl font-semibold">{name.displayName}</span><Icon name="rename" size={16} class="text-fg-subtle" />
		</button>
	</h1>
{/if}
