<script lang="ts">
	import { FIELD } from '$lib/components/ui/field';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import MentionTextarea from '$lib/components/stream/MentionTextarea.svelte';
	import PersonSearchSelect from '$lib/components/people/PersonSearchSelect.svelte';
	import { subjectPool, type SubjectFace } from '$lib/story/subjects';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { ComponentProps } from 'svelte';

	/*
	 * A journal entry corrected in place (docs/02 §2.20): its title and text, the day, who sees
	 * it and its photos staying as they are, and the people it is about (§2.20.3). One editor for the journal page and the person's
	 * Activity card, so both save the same way. Its author's alone; online only, like removing.
	 */
	let {
		contactId,
		entry,
		candidates,
		tags,
		onDone
	}: {
		/** Whose journal the entry is in — where it is saved. */
		contactId: string;
		entry: {
			id: string;
			title: string | null;
			/** The stored body, mention tokens and all. */
			bodyForEdit: string | null;
			/** Whom each mention names, so the field shows them as handles. */
			mentionNames: Record<string, string>;
			visibility: 'shared' | 'private';
			/** Whom it is about that the author sees, the anchor first. */
			subjects: SubjectFace[];
		};
		/** Whom the @-picker offers: everyone visible but the person whose journal it is. */
		candidates: ComponentProps<typeof MentionTextarea>['candidates'];
		tags: ComponentProps<typeof MentionTextarea>['tags'];
		/** The editor is finished; `saved` when the entry was changed. */
		onDone: (saved: boolean) => void;
	} = $props();

	const t = useI18n().t;

	// Seeded once from the entry; a save reloads the page, which starts the editor afresh.
	// svelte-ignore state_referenced_locally
	let title = $state(entry.title ?? '');
	// svelte-ignore state_referenced_locally
	let body = $state(entry.bodyForEdit ?? '');
	// svelte-ignore state_referenced_locally
	let subjectIds = $state(entry.subjects.map((s) => s.id));
	const pool = $derived(subjectPool(entry.subjects, candidates, entry.visibility));
	let saving = $state(false);
	let unclear = $state(false);
	let error = $state<string | null>(null);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = null;
		try {
			const res = await fetch(`/contacts/${contactId}/journal?/edit`, {
				method: 'POST',
				body: new FormData(event.currentTarget as HTMLFormElement),
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text());
			// A refusal says why — a namesake to pick, say (docs/02 §2.2.3) — and keeps the text.
			if (result.type === 'failure') {
				error = (result.data?.journalError as string | undefined) ?? t('journal.editSaveFailed');
				return;
			}
			if (result.type === 'error') throw new Error();
			onDone(true);
			await invalidateAll();
		} catch {
			error = t('journal.editSaveFailed');
		} finally {
			saving = false;
		}
	}
</script>

<form
	method="POST"
	action="/contacts/{contactId}/journal?/edit"
	onsubmit={save}
	class="flex flex-col gap-3"
	data-testid="journal-entry-editor"
>
	<input type="hidden" name="id" value={entry.id} />
	<FormError message={error} />
	<div class="flex flex-col gap-1 text-sm">
		<label for="journal-subjects-{entry.id}" class="text-fg-muted">
			{t('journal.subjects.label')}
		</label>
		<PersonSearchSelect
			id="journal-subjects-{entry.id}"
			people={pool}
			name="subjectIds"
			multiple
			min={1}
			bind:selectedIds={subjectIds}
			describedBy={subjectIds.length === 1 ? `journal-subjects-hint-${entry.id}` : undefined}
			placeholder={t('journal.subjects.add')}
		/>
		{#if subjectIds.length === 1}
			<p id="journal-subjects-hint-{entry.id}" class="text-xs text-fg-muted">
				{t('journal.subjects.lastOne')}
			</p>
		{/if}
	</div>
	<label class="flex flex-col gap-1 text-sm">
		<span class="text-fg-muted">{t('journal.titleOptional')}</span>
		<input
			name="title"
			bind:value={title}
			placeholder={t('journal.titlePlaceholder')}
			class="{FIELD} px-3 py-2"
		/>
	</label>
	<MentionTextarea
		name="body"
		label={t('journal.entry')}
		rows={5}
		required
		bind:value={body}
		bind:unclear
		names={entry.mentionNames}
		{candidates}
		{tags}
		visibility={entry.visibility}
		placeholder={t('journal.bodyPlaceholder')}
		class="{FIELD} w-full px-3 py-2"
	/>
	<div class="flex items-center gap-3">
		<Button variant="primary" disabled={saving || unclear}>
			{saving ? t('common.saving') : t('journal.saveChanges')}
		</Button>
		<Button variant="ghost" type="button" onclick={() => onDone(false)}>
			{t('common.cancel')}
		</Button>
	</div>
</form>
