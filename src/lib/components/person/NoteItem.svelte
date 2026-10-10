<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import MentionTextarea from '$lib/components/stream/MentionTextarea.svelte';
	import RemoveButton from '$lib/components/ui/RemoveButton.svelte';
	import Swap from '$lib/components/ui/Swap.svelte';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { INPUT } from './inputs';
	import type { PersonPageData } from './types';

	// One note on the person page (docs/02 §2.5): the text, and its editor in place.
	let {
		note,
		contactId,
		candidates,
		editing,
		onEdit,
		onDone
	}: {
		note: PersonPageData['notes'][number];
		contactId: string;
		/** Whom the note can @-mention: everyone visible but this person. */
		candidates: PersonPageData['people'];
		editing: boolean;
		/** The editor was asked for. */
		onEdit: () => void;
		/** The editor is finished, saved or not. */
		onDone: () => void;
	} = $props();

	const t = useI18n().t;
	const removals = useRemovals();

	let title = $state('');
	let body = $state('');
	let saving = $state(false);
	// A typed @Thomas that could be several people keeps saving off until one is picked.
	let unclear = $state(false);
	let error = $state<string | null>(null);

	function toggle() {
		if (editing) return onDone();
		title = note.title ?? '';
		body = note.bodyForEdit ?? '';
		error = null;
		onEdit();
	}

	// Online only, like removing: the right to edit is checked when the edit lands.
	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = null;
		try {
			const res = await fetch(`/contacts/${contactId}?/editNote`, {
				method: 'POST',
				body: new FormData(event.currentTarget as HTMLFormElement),
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text());
			// A refusal says why — a namesake to pick, say (docs/02 §2.2.3) — and keeps the text.
			if (result.type === 'failure') {
				error = (result.data?.noteError as string | undefined) ?? t('contact.notes.saveFailed');
				return;
			}
			if (result.type === 'error') throw new Error();
			removals.notify(t('components.saved'));
			onDone();
			await invalidateAll();
		} catch {
			error = t('contact.notes.saveFailed');
		} finally {
			saving = false;
		}
	}
</script>

<li class="rounded-control bg-bg-sunken p-3">
	<div class="mb-1 flex items-center gap-2">
		{#if note.isPinned}
			<span class="inline-flex items-center gap-1 text-xs font-medium text-primary">
				<Icon name="pinned" size={12} />{t('contact.notes.pinned')}
			</span>
		{/if}
		{#if note.title}<span class="font-medium text-fg">{note.title}</span>{/if}
		{#if note.author}
			<span class="text-xs text-fg-subtle">{note.title ? `· ${note.author}` : note.author}</span>
		{/if}
		<span class="ml-auto inline-flex items-center gap-2">
			{#if note.visibility === 'private'}
				<span class="inline-flex items-center gap-1 text-xs text-fg-subtle">
					<Icon name="private" size={11} />{t('common.privateInline')}
				</span>
			{/if}
			<!-- Its author's alone (docs/03 §3.7). Online only. -->
			{#if note.editable}
				<Button
					variant="ghost"
					size="sm"
					type="button"
					icon="write"
					label={t('contact.notes.edit')}
					title={t('contact.notes.edit')}
					aria-expanded={editing}
					onclick={toggle}
				/>
			{/if}
			<!-- Its author's, or an admin's on a shared one (docs/03 §3.7). Online only. -->
			{#if note.removable}
				<RemoveButton
					kind="note"
					id={note.id}
					action="?/removeNote"
					fields={{ id: note.id }}
					label={t('contact.notes.remove')}
					removed={t('contact.notes.removed')}
				/>
			{/if}
		</span>
	</div>
	<!-- The note and its editor glide into each other in place (docs/05 §5.11). -->
	<Swap when={editing}>
		<form method="POST" action="?/editNote" onsubmit={save} class="flex flex-col gap-3">
			<input type="hidden" name="id" value={note.id} />
			<FormError message={error} />
			<label class="flex flex-col gap-1 text-sm">
				<span class="text-fg-muted">{t('contact.notes.titleOptional')}</span>
				<input name="title" bind:value={title} class="{INPUT} w-full" />
			</label>
			<MentionTextarea
				name="body"
				label={t('contact.notes.label')}
				required
				bind:value={body}
				bind:unclear
				names={note.mentionNames}
				{candidates}
				visibility={note.visibility}
				class="{INPUT} w-full"
			/>
			<div class="flex flex-wrap items-center gap-3">
				<Button variant="primary" size="sm" disabled={saving || unclear}>
					{saving ? t('common.saving') : t('common.save')}
				</Button>
				<Button variant="ghost" size="sm" type="button" onclick={onDone}>
					{t('common.cancel')}
				</Button>
			</div>
		</form>
		{#snippet otherwise()}
			<!-- server-rendered, already-safe Markdown (docs/02 §2.5) -->
			<div class="note-body text-fg">{@html note.bodyHtml}</div>
		{/snippet}
	</Swap>
</li>
