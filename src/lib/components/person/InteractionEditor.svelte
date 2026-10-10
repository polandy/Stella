<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import PersonSearchSelect from '$lib/components/people/PersonSearchSelect.svelte';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { SelectablePerson } from '$lib/people/select';
	import { INTERACTION_KINDS, KIND_PRESENTATION } from '$lib/story/interaction-kinds';
	import type { StoryInteractionItem } from '$lib/story/item';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { INPUT } from './inputs';

	/*
	 * A touchpoint corrected in place (docs/02 §2.6): the log form's fields but who sees it,
	 * which stays as it was. Its author's alone; online only, like removing.
	 */
	let {
		item,
		contactId,
		candidates,
		onDone
	}: {
		item: StoryInteractionItem;
		contactId: string;
		/** Whom else it can name: everyone visible but this person. */
		candidates: SelectablePerson[];
		/** The editor is finished, saved or not. */
		onDone: () => void;
	} = $props();

	const t = useI18n().t;
	const removals = useRemovals();

	// Seeded once from the item; a save reloads the story, which starts the editor afresh.
	// svelte-ignore state_referenced_locally
	let kind = $state(item.interactionKind);
	// svelte-ignore state_referenced_locally
	let participantIds = $state(item.participants.map((p) => p.contactId));
	let saving = $state(false);
	let error = $state<string | null>(null);

	/*
	 * Someone already on it stays a chip though the picker would not offer them now — archived
	 * since, say — so saving never drops a person nobody took off.
	 */
	const people = $derived([
		...candidates,
		...item.participants
			.filter((p) => !candidates.some((c) => c.id === p.contactId))
			.map((p) => ({
				id: p.contactId,
				displayName: p.displayName,
				firstName: null,
				lastName: null,
				nickname: null,
				description: null,
				avatarPhotoId: null
			}))
	]);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = null;
		try {
			const res = await fetch(`/contacts/${contactId}?/editInteraction`, {
				method: 'POST',
				body: new FormData(event.currentTarget as HTMLFormElement),
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text());
			// A refusal says why and keeps what was typed.
			if (result.type === 'failure') {
				error = (result.data?.interactionError as string | undefined) ?? t('story.saveFailed');
				return;
			}
			if (result.type === 'error') throw new Error();
			removals.notify(t('components.saved'));
			onDone();
			// The day may have moved it: the story is read again in its order.
			await invalidateAll();
		} catch {
			error = t('story.saveFailed');
		} finally {
			saving = false;
		}
	}
</script>

<form
	method="POST"
	action="?/editInteraction"
	onsubmit={save}
	class="mt-1 flex flex-col gap-3"
	data-testid="interaction-editor"
>
	<input type="hidden" name="id" value={item.id} />
	<FormError message={error} />
	<div class="flex flex-wrap items-end gap-2">
		<select name="kind" aria-label={t('contact.kind')} class={INPUT} bind:value={kind}>
			{#each INTERACTION_KINDS as option (option)}
				<option value={option}>{t(KIND_PRESENTATION[option].label)}</option>
			{/each}
		</select>
		<DateField name="happenedAt" value={item.day} required label={t('contact.day')} />
		<input
			name="title"
			value={item.title ?? ''}
			placeholder={t('contact.interaction.titlePlaceholder')}
			aria-label={t('contact.interaction.titlePlaceholder')}
			class="min-w-48 flex-1 {INPUT}"
		/>
	</div>
	<textarea
		name="description"
		rows="2"
		placeholder={t('contact.interaction.detailsPlaceholder')}
		aria-label={t('contact.interaction.detailsPlaceholder')}
		class={INPUT}>{item.description ?? ''}</textarea
	>
	{#if people.length > 0}
		<div class="flex flex-col gap-1 text-sm">
			<label for="interaction-participants-{item.id}" class="text-fg-muted"
				>{t('contact.interaction.whoElse')}</label
			>
			<PersonSearchSelect
				id="interaction-participants-{item.id}"
				{people}
				name="participants"
				bind:selectedIds={participantIds}
				multiple
				allowCreate
			/>
		</div>
	{/if}
	<div class="flex flex-wrap items-center gap-3">
		<Button variant="primary" size="sm" disabled={saving}>
			{saving ? t('common.saving') : t('common.save')}
		</Button>
		<Button variant="ghost" size="sm" type="button" onclick={onDone}>
			{t('common.cancel')}
		</Button>
	</div>
</form>
