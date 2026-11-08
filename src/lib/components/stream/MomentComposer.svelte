<script lang="ts">
	import FormError from '$lib/components/ui/FormError.svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import DayPill from '$lib/components/ui/DayPill.svelte';
	import ShareSwitch from '$lib/components/ui/ShareSwitch.svelte';
	import ImmichLibraryPicker from '$lib/components/immich/ImmichLibraryPicker.svelte';
	import CreatePersonPanel from '$lib/components/people/CreatePersonPanel.svelte';
	import ComposerPeopleList from '$lib/components/stream/ComposerPeopleList.svelte';
	import ComposerPhotos from '$lib/components/stream/ComposerPhotos.svelte';
	import ComposerSaveHint from '$lib/components/stream/ComposerSaveHint.svelte';
	import ComposerSubjects from '$lib/components/stream/ComposerSubjects.svelte';
	import TagListbox from '$lib/components/journal/TagListbox.svelte';
	import TagsLine from '$lib/components/journal/TagsLine.svelte';
	import type { KnownTag } from '$lib/hashtags/picker';
	import { TagPicker } from '$lib/hashtags/tag-picker.svelte';
	import WhichNamesake from '$lib/components/people/WhichNamesake.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { usePeopleContext } from '$lib/people/context.svelte';
	import { tellApart } from '$lib/people/namesakes';
	import { isKnownByMoreThanAFirstName } from '$lib/people/new-person';
	import type { MomentDraft } from '$lib/people/story-forms';
	import type { KeptOf } from '$lib/pwa/outbox';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { createPanelKey, keyupAsksPicker, textKey } from '$lib/stream/composer-keys';
	import { SAVED_NOTICE_MS, savedMomentAnchor } from '$lib/stream/saved-moment';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { deviceDay, writersDay } from '$lib/dates/today';
	import {
		composerPeople,
		composerReading,
		draftOf,
		pickerRows
	} from '$lib/stream/composer-reading';
	import {
		composerAtOpen,
		type ComposerCandidate,
		type ComposerError,
		type Creating
	} from '$lib/stream/composer-state';
	import { subjectsUnfit, type HomeMembers } from '$lib/stream/composer-subjects';
	import { ComposerController } from '$lib/stream/composer.svelte';
	import { tick, untrack } from 'svelte';
	import { ulid } from 'ulid';

	/*
	 * The "What happened?" field (docs/02 §2.22.1). A plain textarea that posts natively; the
	 * @-picker, inline "Create …" queue and browser-side photo processing are enhancements.
	 *
	 * With JavaScript it saves as a named command through the outbox, in reach or not
	 * (docs/02 §2.18.1, docs/04 ADR-076): in reach it waits for Stella's answer, and
	 * when there is none it keeps the moment on the device. The name is what makes that safe: a
	 * moment whose answer was lost on the way is recognised when it arrives a second time.
	 * `editing` opens a kept moment that has not been sent yet.
	 *
	 * A person picked in the list is remembered against the `@Handle` it wrote and saved as their
	 * id token, so two people called Thomas stay two people (docs/02 §2.2.3, `picks.ts`).
	 * Creating somebody opens a small panel for their name and what to know them by; the text
	 * then mentions them by a placeholder the server swaps for their id once it has them.
	 *
	 * With an `anchor` it is written on that person's own page (docs/02 §2.20): the moment
	 * belongs to them without an `@`, shown as a chip above the field, and `@` offers everyone
	 * else. There it saves in place (`onSaved`), can be cancelled (`onCancel`) and reports what
	 * is typed (`onDraft`), so the page can keep a draft while the spot holds another form.
	 *
	 * `#` offers the household's tags (docs/02 §2.20.2) from a list of its own beside the state
	 * below: a chosen tag comes back as typed text, so the transitions never learn about tags.
	 */

	interface Props {
		/** People the author may see; the picker narrows to the moment's audience itself. */
		candidates: ComposerCandidate[];
		me: { id: string; name: string; avatarPhotoId?: string | null };
		today: string;
		error?: string | null;
		/** Body to start from: after a failed submit, or a person to write about, as stored. */
		draft?: string | null;
		autofocus?: boolean;
		/** A moment kept on this device, open for editing before it is sent. */
		editing?: KeptOf<'moment.capture'> | null;
		/** The edit was saved or abandoned. */
		onEditDone?: () => void;
		/** A moment was kept on this device for later. */
		onKept?: () => void;
		/** The person whose page this is: the moment lands in their journal without an `@`. */
		anchor?: Anchor | null;
		/** A draft to start from, as `onDraft` or `onCancel` handed it over. */
		held?: MomentDraft | null;
		/** Stella took the moment; without it the composer goes back to the stream. */
		onSaved?: () => void;
		/** Cancel or Esc, with what was typed; without it the composer has no Cancel. */
		onCancel?: (draft: MomentDraft) => void;
		/** What is typed, as it changes. */
		onDraft?: (draft: MomentDraft) => void;
		/** The tags the author can see, for the `#` list. */
		tags?: readonly KnownTag[];
		/** Immich is on the instance: the photo button offers *From Immich* (docs/02 §2.24.9). */
		immichLibrary?: boolean;
		/** The households the author can see, offered in one tap beside the moment's person. */
		homes?: readonly HomeMembers[];
	}
	interface Anchor {
		id: string;
		displayName: string;
		firstName: string | null;
		avatarPhotoId: string | null;
	}
	let {
		candidates,
		me,
		today,
		error = null,
		draft = null,
		autofocus = false,
		editing = null,
		onEditDone,
		onKept,
		anchor = null,
		held = null,
		onSaved,
		onCancel,
		onDraft,
		tags = [],
		immichLibrary = false,
		homes = []
	}: Props = $props();

	const t = useTranslate();
	const removals = useRemovals();
	const uid = $props.id();
	const errorId = `${uid}-error`;
	const listboxId = `${uid}-people`;
	const optionId = (i: number) => `${uid}-person-${i}`;
	const tagListId = `${uid}-tags`;
	const tagOptionId = (i: number) => `${uid}-tag-${i}`;
	const tagPicker = new TagPicker(() => tags);

	/*
	 * What the composer is doing — the text and its picks, the @-list, a person being created,
	 * the photos and a save on its way: the transitions are `composer-state.ts`, and
	 * `composer.svelte.ts` carries out the commands they hand back, asking this component for
	 * whatever touches the page.
	 */
	// svelte-ignore state_referenced_locally -- the kept moment is only a starting value on purpose
	const kept = editing?.command.payload ?? null;
	const controller = new ComposerController(
		untrack(() =>
			composerAtOpen({
				candidates,
				// Plain objects: the payload is kept in IndexedDB, which cannot clone a state proxy.
				kept: $state.snapshot(kept),
				held: $state.snapshot(held),
				draft,
				anchorId: anchor?.id ?? null,
				commandId: ulid()
			})
		),
		{
			async focusText(caret) {
				await tick();
				textarea?.focus();
				if (caret !== null) textarea?.setSelectionRange(caret, caret);
			},
			async focusCreate() {
				clearTimeout(closingPicker);
				await tick();
				createFirstName?.focus();
			},
			async backToStream(href, entryId) {
				await goto(href, { invalidateAll: true });
				// The sheet is gone and the moment somewhere in the stream: point to it (§2.22.1).
				removals.notifyWithLink(
					t('home.momentSaved'),
					{ label: t('home.momentSaved.show'), href: `#${savedMomentAnchor(entryId)}` },
					SAVED_NOTICE_MS
				);
			},
			savesInPlace: () => onSaved !== undefined,
			onSaved: () => onSaved?.(),
			onKept: () => onKept?.(),
			onEditDone: () => onEditDone?.(),
			onCancel: (held) => onCancel?.(held)
		}
	);
	const ui = $derived(controller.state);
	const dispatch = controller.dispatch;
	const body = $derived(ui.body);
	const picks = $derived(ui.picks);
	const newPeople = $derived(ui.newPeople);
	const visibility = $derived(ui.visibility);
	const anchorId = $derived(ui.anchorId);
	const subjectIds = $derived(ui.subjectIds);
	const fresh = $derived(ui.fresh);
	const photoCount = $derived(ui.photos.length + ui.immichPhotos.length);
	/*
	 * *From Immich* opens on the moment's day as the day field says it now (docs/02 §2.24.9).
	 */
	let libraryOpen = $state(false);
	let libraryDay = $state('');
	function openLibrary() {
		const entryDate = composer ? new FormData(composer).get('entryDate') : null;
		libraryDay = typeof entryDate === 'string' && entryDate !== '' ? entryDate : day;
		libraryOpen = true;
	}
	const active = $derived(ui.active);
	const selected = $derived(ui.highlighted);
	const creating = $derived(ui.creating);
	const sending = $derived(ui.sending);
	const saving = $derived(sending !== null);
	const localError = $derived(errorText(ui.error));

	const anchorPerson = $derived(anchor ?? candidates.find((c) => c.id === anchorId) ?? null);

	const day = $derived(writersDay(today, browser ? deviceDay() : null));
	let textarea: HTMLTextAreaElement | undefined = $state();
	let composer: HTMLFormElement | undefined = $state();

	const people = $derived(composerPeople({ anchorId, visibility, newPeople }, candidates));
	const audience = $derived(people.audience);
	const createdIds = $derived(new Set(people.created.map((c) => c.id)));
	const known = $derived(people.known);
	const rows = $derived(pickerRows(active, known));
	const listOpen = $derived(active !== null && rows.length > 0);
	// The second line counts everyone the list could offer, not only what the query left.
	const peopleContext = usePeopleContext();
	const namesakes = $derived(tellApart(audience, peopleContext()));
	const reading = $derived(
		composerReading(
			{ body, picks, anchorId, sending, photos: ui.photos, immichPhotos: ui.immichPhotos },
			known,
			peopleContext(),
			subjectsUnfit(subjectIds, visibility, candidates)
		)
	);
	// On Home the moment is the first @'s, so the chips beside it wait for that @ (§2.20.3).
	const subjectsAnchor = $derived(
		anchorPerson ?? candidates.find((c) => c.id === reading.referenced[0]?.id) ?? null
	);
	const unclear = $derived(reading.unclear);
	const canSave = $derived(reading.canSave);

	const ERRORS = {
		couldNotKeep: 'composer.couldNotKeep',
		alreadySending: 'composer.alreadySending',
		saveFailed: 'composer.saveFailed'
	} as const;
	function errorText(error: ComposerError | null): string | null {
		if (!error) return null;
		return error.kind === 'refused' ? error.reason : t(ERRORS[error.kind]);
	}

	// Leaving the field closes the picker a moment later, so a click on a suggestion still
	// lands. Coming back must cancel that: a navigation that returns focus to the page after a
	// save would otherwise close the picker under whoever is already typing the next moment.
	let closingPicker: ReturnType<typeof setTimeout> | undefined;
	function closePickerSoon() {
		closingPicker = setTimeout(() => {
			tagPicker.close();
			void dispatch({ type: 'pickerClosed' });
		}, 120);
	}

	function onInput(event: Event) {
		const field = event.currentTarget as HTMLTextAreaElement;
		clearTimeout(closingPicker);
		void dispatch({ type: 'typed', text: field.value, caret: field.selectionStart });
		tagPicker.follow(field.value, field.selectionStart);
	}

	function onKeyup(event: KeyboardEvent) {
		if (keyupAsksPicker(event.key, listOpen || tagPicker.open)) refreshPicker();
	}

	function refreshPicker() {
		clearTimeout(closingPicker);
		if (!textarea) return;
		void dispatch({ type: 'caretMoved', caret: textarea.selectionStart });
		tagPicker.follow(textarea.value, textarea.selectionStart);
	}

	async function chooseTag(index: number) {
		if (!textarea) return;
		const r = tagPicker.choose(textarea.value, textarea.selectionStart, index);
		if (!r) return;
		await dispatch({ type: 'typed', text: r.text, caret: r.caret });
		await tick();
		textarea.focus();
		textarea.setSelectionRange(r.caret, r.caret);
	}

	function choose(index: number) {
		const row = rows[index];
		if (!row || !textarea) return;
		void dispatch({ type: 'rowChosen', row, caret: textarea.selectionStart, audience });
	}

	let createFirstName: HTMLInputElement | undefined = $state();
	const addCreated = () => void dispatch({ type: 'createAdded', key: ulid() });
	const cancelCreate = () => void dispatch({ type: 'createCancelled' });
	const editCreating = (field: keyof Omit<Creating, 'at' | 'caret'>, value: string) =>
		void dispatch({ type: 'createEdited', field, value });

	function onCreateKeydown(event: KeyboardEvent) {
		const key = createPanelKey(event.key);
		if (!key) return;
		event.preventDefault();
		if (key === 'add') addCreated();
		else cancelCreate();
	}

	function onKeydown(event: KeyboardEvent) {
		if (tagPicker.key(event, (i) => void chooseTag(i))) return;
		const key = textKey(
			{ key: event.key, mod: event.metaKey || event.ctrlKey },
			{ listOpen, cancellable: onCancel !== undefined, canSave }
		);
		if (!key) return;
		if (key.consumed) event.preventDefault();
		switch (key.intent) {
			case 'next':
				return void dispatch({ type: 'highlightMoved', by: 1, rows: rows.length });
			case 'previous':
				return void dispatch({ type: 'highlightMoved', by: -1, rows: rows.length });
			case 'choose':
				return choose(selected);
			case 'closePicker':
				return void dispatch({ type: 'pickerClosed' });
			case 'cancel':
				return cancel();
			case 'save':
				return (event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
		}
	}

	const cancel = () => void dispatch({ type: 'cancelled', nextCommandId: ulid() });

	// Picks change only with the text, so the text and the chips say when the draft has changed.
	$effect(() => {
		if (!onDraft) return;
		onDraft(draftOf({ body, visibility, newPeople, subjectIds, picks: untrack(() => picks) }));
	});

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		const data = new FormData(event.currentTarget as HTMLFormElement);
		let failed = false;
		try {
			await dispatch({
				type: 'submitted',
				entryDate: String(data.get('entryDate') ?? day),
				editing: editing?.command.id ?? null
			});
		} catch {
			failed = true;
		}
		void dispatch({ type: 'settled', failed });
	}

	$effect(() => {
		if (autofocus) textarea?.focus();
	});
</script>

<form
	method="POST"
	action="/?/capture"
	enctype="multipart/form-data"
	onsubmit={onSubmit}
	bind:this={composer}
	class="relative flex flex-col rounded-app bg-card shadow-card transition-shadow focus-within:ring-2 focus-within:ring-primary/40"
>
	<FormError message={error ?? localError} id={errorId} class="mx-3 mt-3" />
	{#if subjectsAnchor}
		<ComposerSubjects
			anchor={subjectsAnchor}
			onPersonPage={anchorPerson !== null}
			{subjectIds}
			{candidates}
			{homes}
			{visibility}
			onadd={(ids) => void dispatch({ type: 'subjectsAdded', ids, anchorId: subjectsAnchor.id })}
			onremove={(id) => void dispatch({ type: 'subjectRemoved', id })}
		/>
	{/if}
	<div class="flex items-start gap-3 p-3 pb-2">
		{#if !anchorPerson}
			<Avatar id={me.id} name={me.name} avatarPhotoId={me.avatarPhotoId ?? null} size={40} />
		{/if}
		<textarea
			bind:this={textarea}
			value={body}
			name="body"
			rows="2"
			required
			data-moment-body
			placeholder={anchorPerson
				? t('composer.placeholderAbout', {
						name: anchorPerson.firstName ?? anchorPerson.displayName
					})
				: t('composer.placeholder')}
			aria-label={anchorPerson
				? t('composer.placeholderAbout', {
						name: anchorPerson.firstName ?? anchorPerson.displayName
					})
				: t('composer.label')}
			aria-autocomplete="list"
			aria-controls={tagPicker.open ? tagListId : listboxId}
			aria-activedescendant={tagPicker.open
				? tagOptionId(tagPicker.highlighted)
				: !creating && active && rows[selected]
					? optionId(selected)
					: undefined}
			aria-describedby={(error ?? localError) ? errorId : undefined}
			onkeydown={onKeydown}
			oninput={onInput}
			onclick={refreshPicker}
			onkeyup={onKeyup}
			onfocus={() => clearTimeout(closingPicker)}
			onblur={closePickerSoon}
			class="min-h-14 flex-1 resize-y bg-transparent font-serif text-[17px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
		></textarea>
	</div>
	{#if body.trim()}
		<div class="px-3 pb-2 {anchorPerson ? '' : 'pl-16'}">
			<TagsLine {body} known={tags} />
		</div>
	{/if}

	{#if creating}
		<!-- It takes its place in the card rather than floating over it, so on a phone, where the
		     composer is a sheet at the bottom of the screen, it grows the sheet instead of leaving it. -->
		<CreatePersonPanel
			bind:firstName={() => creating?.firstName ?? '', (v) => editCreating('firstName', v)}
			bind:lastName={() => creating?.lastName ?? '', (v) => editCreating('lastName', v)}
			bind:description={() => creating?.description ?? '', (v) => editCreating('description', v)}
			bind:firstNameInput={createFirstName}
			onkeydown={onCreateKeydown}
			data-testid="composer-create"
			class="mx-3 mb-2 rounded-app border border-border bg-bg p-3"
		>
			<div class="flex justify-end gap-2">
				<!-- `type="button"`: inside the moment's form, these must never save it. -->
				<Button type="button" variant="ghost" size="sm" onclick={cancelCreate}
					>{t('components.personSearch.cancel')}</Button
				>
				<Button
					type="button"
					variant="primary"
					size="sm"
					disabled={!creating.firstName.trim() || !isKnownByMoreThanAFirstName(creating)}
					onclick={addCreated}
				>
					{t('composer.addPerson')}
				</Button>
			</div>
		</CreatePersonPanel>
	{:else if tagPicker.open}
		<TagListbox
			id={tagListId}
			rows={tagPicker.rows}
			highlighted={tagPicker.highlighted}
			optionId={tagOptionId}
			onchoose={(i) => void chooseTag(i)}
			onhighlight={(i) => (tagPicker.highlighted = i)}
			class="top-16 left-14 w-[min(320px,calc(100%-4rem))]"
		/>
	{:else if active && rows.length > 0 && composer}
		<ComposerPeopleList
			id={listboxId}
			{rows}
			highlighted={selected}
			{optionId}
			{namesakes}
			{createdIds}
			{composer}
			onchoose={(i) => void choose(i)}
			onhighlight={(index) => dispatch({ type: 'highlighted', index })}
		/>
	{/if}

	{#if unclear.length}
		<div class="mx-3 mb-2"><WhichNamesake {unclear} /></div>
	{/if}

	<div class="flex flex-wrap items-center gap-2 border-t border-border-subtle px-3 py-2">
		<ShareSwitch
			shared={visibility === 'shared'}
			onchange={(shared) =>
				dispatch({ type: 'visibilitySet', visibility: shared ? 'shared' : 'private' })}
		/>
		<input type="hidden" name="visibility" value={visibility} />
		{#key fresh}
			{#if !editing}
				<ComposerPhotos
					count={photoCount}
					{immichLibrary}
					onfiles={(files) => dispatch({ type: 'photosPicked', files })}
					onimmich={openLibrary}
				/>
			{/if}
			<DayPill name="entryDate" value={kept?.entryDate ?? day} today={day} />
		{/key}
		<ComposerSaveHint {reading} anchored={anchorId !== null} />
		<div class="ml-auto flex items-center gap-2">
			{#if editing}
				<Button variant="ghost" type="button" onclick={() => onEditDone?.()}
					>{t('common.cancel')}</Button
				>
			{:else if onCancel}
				<Button variant="ghost" type="button" onclick={cancel}>{t('common.cancel')}</Button>
			{/if}
			<Button variant="primary" disabled={!canSave}>
				{saving
					? t('common.saving')
					: reachability.reachable
						? t('common.save')
						: t('composer.saveForLater')}
				<!-- A keyboard's shortcut; a touch screen has no keys to press (docs/05 §5.7). -->
				<kbd
					class="rounded border border-primary-fg/40 px-1 text-[10px] font-medium opacity-75 pointer-coarse:hidden"
					>⌘⏎</kbd
				>
			</Button>
		</div>
	</div>
</form>

{#if immichLibrary}
	<ImmichLibraryPicker
		bind:open={libraryOpen}
		day={libraryDay}
		onadd={(copies) => dispatch({ type: 'immichPhotosAdded', files: copies.map((c) => c.file) })}
	/>
{/if}
