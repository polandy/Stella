<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { reachability } from '$lib/pwa/reachability.svelte';

	/*
	 * First name, last name and nickname, edited in place under the shown name (docs/02 §2.2,
	 * docs/concepts/surnames.md §3.4). Enter saves, Escape puts the fields back. A real form
	 * posting to a real action, so it works without JavaScript too.
	 *
	 * The shown name follows the parts only when the parts made it; a name a member chose (*Opa
	 * Hans*) stays, and the editor says so rather than leaving anyone wondering why the directory
	 * did not change.
	 */
	let {
		name,
		shownNameChosen,
		focus,
		error = null,
		onclose
	}: {
		name: {
			displayName: string;
			firstName: string | null;
			lastName: string | null;
			nickname: string | null;
			formerName: string | null;
		};
		shownNameChosen: boolean;
		/** Which field takes the focus on opening: *Add last name* opens on the last name. */
		focus: 'firstName' | 'lastName';
		error?: string | null;
		onclose: () => void;
	} = $props();

	const t = useTranslate();
	const uid = $props.id();
	// The drafts are this form's own: seeded once, never overwritten while being typed.
	// svelte-ignore state_referenced_locally
	let lastName = $state(name.lastName ?? '');
	// Ticked when nothing holds a former name yet; replacing one is a decision, not a default.
	// svelte-ignore state_referenced_locally
	let keepFormerName = $state(!name.formerName);
	const replacing = $derived(name.lastName !== null && lastName.trim() !== '' && lastName.trim() !== name.lastName);
	// Editing is not queued like adding (docs/02 §2.18), so Save waits for a connection.
	const offline = $derived(!reachability.reachable);
	const saved = savedEnhance(useRemovals(), t('components.saved'), () => onclose());

	let form = $state<HTMLFormElement | null>(null);
	$effect(() => {
		form?.querySelector<HTMLInputElement>(`[name="${focus}"]`)?.focus();
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		onclose();
	}

	const FIELD =
		'w-full min-w-0 rounded-control border border-border-input bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:border-primary';
</script>

<!-- Escape from any of its fields lands here; the fields themselves stay plain inputs. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
	bind:this={form}
	method="POST"
	action="?/editNameParts"
	use:enhance={saved}
	onkeydown={onKeydown}
	class="mt-2 flex flex-col gap-2 rounded-app bg-bg-sunken p-3"
	data-testid="name-parts"
>
	<div class="grid gap-2 sm:grid-cols-3">
		<label class="flex flex-col gap-1 text-xs text-fg-muted" for="{uid}-first">
			{t('contact.nameParts.firstName')}
			<input id="{uid}-first" name="firstName" value={name.firstName ?? ''} autocomplete="off" class={FIELD} />
		</label>
		<label class="flex flex-col gap-1 text-xs text-fg-muted" for="{uid}-last">
			{t('contact.nameParts.lastName')}
			<input id="{uid}-last" name="lastName" bind:value={lastName} autocomplete="off" class={FIELD} />
		</label>
		<label class="flex flex-col gap-1 text-xs text-fg-muted" for="{uid}-nick">
			{t('contact.nameParts.nickname')}
			<input id="{uid}-nick" name="nickname" value={name.nickname ?? ''} autocomplete="off" class={FIELD} />
		</label>
	</div>
	{#if replacing}
		<label class="flex items-center gap-2 text-sm text-fg">
			<input type="checkbox" name="keepFormerName" bind:checked={keepFormerName} />
			{t('contact.nameParts.keepFormer', { name: name.lastName ?? '' })}
		</label>
	{/if}
	{#if shownNameChosen}
		<p class="text-xs text-fg-subtle">{t('contact.nameParts.shownAs', { name: name.displayName })}</p>
	{/if}
	<FormError message={error} variant="inline" size="xs" />
	{#if offline}
		<p class="text-xs text-fg-muted">{t('surnames.offline')}</p>
	{/if}
	<div class="flex gap-2">
		<Button variant="primary" size="sm" disabled={offline}>{t('common.save')}</Button>
		<Button variant="ghost" size="sm" type="button" onclick={onclose}>{t('common.cancel')}</Button>
	</div>
</form>
