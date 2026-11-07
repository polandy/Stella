<script lang="ts">
	import { FIELD } from '$lib/components/ui/field';
	import Button from '$lib/components/ui/Button.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import CreatePersonPanel from '$lib/components/people/CreatePersonPanel.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { isKnownByMoreThanAFirstName, splitTypedName } from '$lib/people/new-person';
	import type { SelectablePerson } from '$lib/people/select';
	import { untrack } from 'svelte';

	/*
	 * The person picker's create panel (docs/02 §2.2.2): the typed name split into first and last,
	 * a little more on request, and a save that posts to the quick-add endpoint and hands the
	 * picker the person it answers with.
	 */

	/** Where the panel posts; the endpoint answers with the created person. */
	const QUICK_ADD_ENDPOINT = '/contacts/quick-add';

	const VISIBILITY_LEVELS = ['shared', 'private'] as const;
	type Visibility = (typeof VISIBILITY_LEVELS)[number];

	interface Props {
		/** What was typed in the search, as the name to start from. */
		typed: string;
		/** See PersonSearchSelect's prop of the same name. */
		suggestedDescription: string;
		oncreated: (person: SelectablePerson) => void;
		oncancel: () => void;
	}
	let { typed, suggestedDescription, oncreated, oncancel }: Props = $props();

	const t = useTranslate();

	// The panel opens once per create: the typed name and the suggestion are where it starts.
	let draft = $state(
		untrack(() => ({
			...splitTypedName(typed),
			nickname: '',
			description: suggestedDescription,
			birthDate: '',
			visibility: 'shared' as Visibility
		}))
	);
	let saving = $state(false);
	let createError = $state<string | null>(null);
	let firstNameInput: HTMLInputElement | undefined = $state();

	$effect(() => {
		firstNameInput?.focus();
	});

	// The suggestion follows the form while nobody has made the description their own: another
	// type chosen with the panel open is a new suggestion, a typed description stays.
	let offered = untrack(() => suggestedDescription);
	$effect(() => {
		const next = suggestedDescription;
		if (next === offered) return;
		if (untrack(() => draft.description) === offered) draft.description = next;
		offered = next;
	});

	async function submitCreate() {
		// Stella refuses a first name alone (docs/02 §2.2.3); Enter must not get past the button.
		if (saving || !isKnownByMoreThanAFirstName(draft)) return;
		saving = true;
		createError = null;
		try {
			const response = await fetch(QUICK_ADD_ENDPOINT, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(draft)
			});
			if (!response.ok) {
				createError = await failureText(response);
				return;
			}
			oncreated(await response.json());
		} catch {
			createError = t('errors.contact.couldNotCreate');
		} finally {
			saving = false;
		}
	}

	/** SvelteKit's `error()` answers JSON `{ message }`; anything else is not ours to parse. */
	async function failureText(response: Response): Promise<string> {
		try {
			const body = await response.json();
			if (typeof body?.message === 'string') return body.message;
		} catch {
			// Fall through to the generic message below.
		}
		return t('errors.contact.couldNotCreate');
	}

	/** Enter inside the panel saves the person; it must never submit the form around it. */
	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			submitCreate();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			oncancel();
		}
	}
</script>

<CreatePersonPanel
	bind:firstName={draft.firstName}
	bind:lastName={draft.lastName}
	bind:description={draft.description}
	bind:firstNameInput
	onkeydown={onKeydown}
	class="p-3"
>
	<details class="text-xs text-fg-muted">
		<summary class="cursor-pointer">{t('components.personSearch.more')}</summary>
		<div class="mt-2 grid grid-cols-2 gap-2">
			<label class="flex flex-col gap-1">
				{t('components.personSearch.nickname')}
				<input
					bind:value={draft.nickname}
					type="text"
					autocomplete="off"
					class="{FIELD} px-2 py-1.5 text-sm"
				/>
			</label>
			<div class="col-span-2 flex flex-col gap-1">
				{t('components.personSearch.birthDate')}
				<DateField
					bind:value={draft.birthDate}
					label={t('components.personSearch.birthDate')}
					allowYearUnknown
				/>
			</div>
		</div>
	</details>

	<fieldset class="flex items-center gap-2">
		<legend class="sr-only">{t('components.personSearch.visibility')}</legend>
		{#each VISIBILITY_LEVELS as level (level)}
			<button
				type="button"
				aria-pressed={draft.visibility === level}
				onclick={() => (draft.visibility = level)}
				class="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-fg"
			>
				<Icon name={level} size={12} />
				{t(`components.personSearch.${level}`)}
			</button>
		{/each}
	</fieldset>

	{#if createError}
		<p class="text-xs text-danger" role="alert">{createError}</p>
	{/if}

	<div class="flex justify-end gap-2">
		<!-- `type="button"`: these sit inside the caller's form and must never submit it. -->
		<Button type="button" variant="ghost" size="sm" onclick={oncancel}>
			{t('components.personSearch.cancel')}
		</Button>
		<Button
			type="button"
			variant="primary"
			size="sm"
			disabled={saving || !isKnownByMoreThanAFirstName(draft)}
			onclick={submitCreate}
		>
			{saving ? t('components.personSearch.submitting') : t('components.personSearch.submit')}
		</Button>
	</div>
</CreatePersonPanel>
