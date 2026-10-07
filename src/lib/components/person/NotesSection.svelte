<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import MentionTextarea from '$lib/components/MentionTextarea.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import { cardShape } from '$lib/contacts/empty-cards';
	import { sectionAnchor } from '$lib/contacts/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { asTyped } from '$lib/mentions/picks';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { ulid } from 'ulid';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	// What was written down about someone (docs/02 §2.5): the person page's notes card.
	let {
		data,
		form,
		otherContacts
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Whom a note can @-mention: everyone visible but this person. */
		otherContacts: PersonPageData['people'];
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	// Saving through `enhance` keeps the page — and with it any open undo window — alive, so
	// each section closes itself here instead of on the reload a redirect used to cause.
	// Logging a touchpoint too: the story timeline, which owns its paged list, is keyed on the
	// page's story, so the reloaded data hands it the new item as a fresh first page.
	let openSection = $state({ note: false });
	type SectionName = keyof typeof openSection;
	// The note's audience narrows whom the @-picker offers (docs/02 §2.20.1).
	let noteVisibility = $state<'shared' | 'private'>('shared');
	let noteBody = $state('');
	let notePinned = $state(false);
	// A typed @Thomas that could be several people keeps saving off until one is picked.
	let noteUnclear = $state(false);

	/*
	 * Notes written here while Stella was out of reach (docs/02 §2.18): kept on the device and
	 * shown at the top of this person's notes until they are sent. One can be opened in the
	 * note form again until it is on its way; the form then saves into the kept copy.
	 */
	const keptNotes = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'note.add'> =>
				isKept(item, 'note.add') && item.command.payload.contactId === data.contact.id
		)
	);
	let editingNote = $state<KeptOf<'note.add'> | null>(null);
	async function editKeptNote(item: KeptOf<'note.add'>) {
		if (!(await outbox.hold(item.command.id))) return;
		editingNote = item;
		noteBody = item.command.payload.body;
		noteVisibility = item.command.payload.visibility;
		notePinned = item.command.payload.isPinned;
		openSection.note = true;
	}
	async function stopEditingNote() {
		const item = editingNote;
		editingNote = null;
		noteBody = '';
		notePinned = false;
		if (item) await outbox.release(item.command.id);
	}
	async function saveKeptNote(item: KeptOf<'note.add'>) {
		editingNote = null;
		await outbox.revise(
			item.command.id,
			{
				...item.command.payload,
				body: noteBody.trim(),
				visibility: noteVisibility,
				isPinned: notePinned
			},
			ulid()
		);
		noteBody = '';
		notePinned = false;
		openSection.note = false;
	}
	// Closing the section abandons an edit, so the kept note goes back to waiting.
	$effect(() => {
		if (!openSection.note && editingNote) void stopEditingNote();
	});
	const saved = (name: SectionName) =>
		savedEnhance(removals, t('components.saved'), () => (openSection[name] = false));
	/** What a form saved through the outbox does once Stella took it: say so, then `close`. */
	const savedThen = (close: () => void) => () => {
		removals.notify(t('components.saved'));
		close();
	};
	function clearNote() {
		noteBody = '';
		notePinned = false;
		openSection.note = false;
	}
	// The note form saves through the outbox, keeping the note when Stella cannot take it (§2.18).
	const keepNote = $derived(
		keepable(
			{
				toCommand: (form, id) => {
					const body = String(form.get('body') ?? '').trim();
					if (!body) return null;
					return {
						id,
						type: 'note.add',
						payload: {
							contactId: data.contact.id,
							body,
							visibility: form.get('visibility') === 'private' ? 'private' : 'shared',
							isPinned: form.get('isPinned') === 'on'
						},
						issuedAt: Date.now()
					};
				},
				about: data.contact.displayName,
				errorKey: 'noteError',
				onApplied: savedThen(clearNote),
				onKept: clearNote
			},
			saved('note')
		)
	);
	// While a kept note is open, the form saves into it instead of posting.
	const noteForm: SubmitFunction = (input) => {
		if (!editingNote) return keepNote(input);
		input.cancel();
		void saveKeptNote(editingNote);
	};
	// Nothing noted and nothing waiting to be sent: the card is one line (docs/05 §5.5).
	const holdsSomething = $derived(data.notes.length > 0 || keptNotes.length > 0);
</script>

<Section
	id={sectionAnchor('notes')}
	title={t('contact.section.notes')}
	count={data.notes.length}
	addLabel={t('contact.notes.add')}
	empty={cardShape('notes', holdsSomething) === 'line' ? t('contact.notes.none') : undefined}
	error={form?.noteError ?? null}
	bind:open={openSection.note}
>
	{#if keptNotes.length > 0}
		<ul class="mb-3 flex flex-col gap-2" data-testid="kept-notes">
			{#each keptNotes as item (item.command.id)}
				<li>
					<KeptItem {item} onEdit={() => editKeptNote(item)}>
						<p class="mt-1 whitespace-pre-line text-fg">
							{asTyped(item.command.payload.body, [...otherContacts, data.contact])}
						</p>
					</KeptItem>
				</li>
			{/each}
		</ul>
	{/if}
	{#if data.notes.length > 0}
		<ul class="flex flex-col gap-3">
			{#each data.notes as note (note.id)}
				<li class="rounded-control bg-bg-sunken p-3">
					<div class="mb-1 flex items-center gap-2">
						{#if note.isPinned}
							<span class="inline-flex items-center gap-1 text-xs font-medium text-primary">
								<Icon name="pinned" size={12} />{t('contact.notes.pinned')}
							</span>
						{/if}
						{#if note.title}<span class="font-medium text-fg">{note.title}</span>{/if}
						{#if note.visibility === 'private'}
							<span class="ml-auto inline-flex items-center gap-1 text-xs text-fg-subtle">
								<Icon name="private" size={11} />{t('common.privateInline')}
							</span>
						{/if}
					</div>
					<!-- server-rendered, already-safe Markdown (docs/02 §2.5) -->
					<div class="note-body text-fg">{@html note.bodyHtml}</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#snippet editor()}
		<form method="POST" action="?/addNote" use:enhance={noteForm} class="flex flex-col gap-3">
			<MentionTextarea
				bind:value={noteBody}
				bind:unclear={noteUnclear}
				name="body"
				label={t('contact.notes.label')}
				required
				candidates={otherContacts}
				visibility={noteVisibility}
				placeholder={t('contact.notes.placeholder')}
				class="{INPUT} w-full"
			/>
			<div class="flex flex-wrap items-center gap-4 text-sm">
				<label class="flex items-center gap-1.5">
					<input type="checkbox" name="isPinned" bind:checked={notePinned} />
					{t('contact.notes.pin')}
				</label>
				<fieldset class="flex flex-wrap items-center gap-4">
					<legend class="sr-only">{t('common.visibility')}</legend>
					<label class="flex items-center gap-1.5">
						<input type="radio" name="visibility" value="shared" bind:group={noteVisibility} />
						{t('common.shared')}
					</label>
					<label class="flex items-center gap-1.5">
						<input type="radio" name="visibility" value="private" bind:group={noteVisibility} />
						{t('common.private')}
					</label>
				</fieldset>
				<Button variant="primary" size="sm" class="ml-auto" disabled={noteUnclear}
					>{editingNote ? t('common.save') : t('contact.notes.add')}</Button
				>
			</div>
		</form>
	{/snippet}
</Section>
