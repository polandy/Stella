<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import DayPill from '$lib/components/DayPill.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KnowThemBy from '$lib/components/KnowThemBy.svelte';
	import NamesakeLine from '$lib/components/NamesakeLine.svelte';
	import WhichNamesake from '$lib/components/WhichNamesake.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { processImage } from '$lib/image/process-image';
	import { allowedForAudience } from '$lib/mentions/audience';
	import { createHandleResolver, mentionKey, resolveMentions } from '$lib/mentions/mentions';
	import {
		activeHandle,
		handleFor,
		insertHandle,
		listPlacement,
		suggest,
		type ActiveHandle,
		type ListPlacement
	} from '$lib/mentions/picker';
	import {
		isQueuedName,
		newPeopleAsCandidates,
		shiftPicks,
		toEditable,
		toStored,
		type MentionPick
	} from '$lib/mentions/picks';
	import { unclearHandles } from '$lib/mentions/unclear';
	import { usePeopleContext } from '$lib/people/context.svelte';
	import { tellApart } from '$lib/people/namesakes';
	import {
		capitalisedIfTypedLowercase,
		isKnownByMoreThanAFirstName,
		splitTypedName,
		wantsSomethingToKnowThemBy
	} from '$lib/people/new-person';
	import type { MomentCapturePayload, MomentNewPerson } from '$lib/commands/commands';
	import type { KeptOf, KeptPhoto } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { linkHintHref } from '$lib/stream/link-hint';
	import { tick } from 'svelte';
	import { ulid } from 'ulid';

	/*
	 * The "What happened?" field (docs/02 §2.22.1). A plain textarea that posts natively; the
	 * @-picker, inline "Create …" queue and browser-side photo processing are enhancements.
	 *
	 * With JavaScript it saves as a named command through the outbox, in reach or not
	 * (docs/concepts/offline-capture.md §4, §8 #10): in reach it waits for Stella's answer, and
	 * when there is none it keeps the moment on the device. The name is what makes that safe: a
	 * moment whose answer was lost on the way is recognised when it arrives a second time.
	 * `editing` opens a kept moment that has not been sent yet.
	 *
	 * A person picked in the list is remembered against the `@Handle` it wrote and saved as their
	 * id token, so two people called Thomas stay two people (docs/02 §2.2.3, `picks.ts`).
	 * Creating somebody opens a small panel for their name and what to know them by; the text
	 * then mentions them by a placeholder the server swaps for their id once it has them.
	 */

	interface Candidate {
		id: string;
		displayName: string;
		firstName: string | null;
		lastName: string | null;
		visibility: 'shared' | 'private';
		/** What tells namesakes apart in the list (docs/02 §2.2.3). */
		description?: string | null;
		metPlace?: string | null;
		metDate?: string | null;
	}
	interface Props {
		/** People the author may see; the picker narrows to the moment's audience itself. */
		candidates: Candidate[];
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
		onKept
	}: Props = $props();

	const t = useTranslate();

	// svelte-ignore state_referenced_locally -- the kept moment is only a starting value on purpose
	const kept = editing?.command.payload ?? null;
	let newPeople = $state<(string | MomentNewPerson)[]>(kept ? [...kept.newPeople] : []);
	// A kept moment and a draft are stored text: picked people come back as picks.
	// svelte-ignore state_referenced_locally -- the draft is only a starting value on purpose
	const startingPeople = [...candidates, ...newPeopleAsCandidates(newPeople)];
	// svelte-ignore state_referenced_locally -- see above
	const start = toEditable(kept?.body ?? draft ?? '', (id) => {
		const person = startingPeople.find((c) => c.id === id);
		return person ? handleFor(person) : null;
	});
	let body = $state(start.text);
	// Whom each picked handle in the text stands for.
	let picks: MentionPick[] = start.picks;
	let visibility = $state<'shared' | 'private'>(kept?.visibility ?? 'shared');
	// The command this draft will be saved as; a new one after every save.
	let commandId = $state(ulid());
	// Bumped after a save to start the day and photo fields afresh. `form.reset()` cannot:
	// it empties the date field's parts instead of returning them to the default day.
	let fresh = $state(0);

	// A page kept on the device may be days old, and so is the day it was rendered with. The
	// device's own calendar is the writer's; it only ever moves the default forward.
	const localDay = () => new Date().toLocaleDateString('en-CA');
	const day = $derived(browser && localDay() > today ? localDay() : today);
	let picked = $state<File[]>([]);
	let saving = $state(false);
	let localError = $state<string | null>(null);
	let textarea: HTMLTextAreaElement | undefined = $state();
	let composer: HTMLFormElement | undefined = $state();
	let list: HTMLUListElement | undefined = $state();
	let placement: ListPlacement = $state({ side: 'below', maxHeight: Number.POSITIVE_INFINITY });

	// Picker state: the handle under the caret and the ranked suggestions for it.
	let active = $state<ActiveHandle | null>(null);
	let selected = $state(0);
	const audience = $derived(
		allowedForAudience(candidates, visibility)
	);
	const created = $derived(newPeopleAsCandidates(newPeople));
	const createdIds = $derived(new Set(created.map((c) => c.id)));
	const known = $derived([...audience, ...created]);
	const suggestions = $derived(
		active ? suggest(active.query, known) : { people: [], create: null, createsAnother: false }
	);
	// The second line counts everyone the list could offer, not only what the query left.
	const peopleContext = usePeopleContext();
	const namesakes = $derived(tellApart(audience, peopleContext()));
	const rows = $derived([
		...suggestions.people.map((p) => ({ kind: 'person' as const, person: p })),
		...(suggestions.create
			? [{ kind: 'create' as const, name: suggestions.create, another: suggestions.createsAnother }]
			: [])
	]);

	/*
	 * Somebody being created from the picker: their name, what to know them by, and where in the
	 * text the `@` they came from sits. Open, it stands in for the list.
	 */
	let creating = $state<{
		firstName: string;
		lastName: string;
		description: string;
		at: ActiveHandle;
		caret: number;
	} | null>(null);
	let createFirstName: HTMLInputElement | undefined = $state();
	const askForSomethingToKnowThemBy = $derived(
		creating ? wantsSomethingToKnowThemBy({ firstName: creating.firstName, lastName: creating.lastName }) : false
	);

	// The people the text currently references, for the "goes to …'s journal" line — read the
	// way the server will: picks by id, anything typed by name, a namesake nobody picked as a
	// question rather than a guess.
	const resolved = $derived(resolveMentions(toStored(body, picks), createHandleResolver(known)));
	const referenced = $derived(
		resolved.ids.flatMap((id) => known.filter((c) => c.id === id))
	);
	const unclear = $derived(unclearHandles(toStored(body, picks), known, peopleContext()));
	const canSave = $derived(body.trim().length > 0 && referenced.length > 0 && unclear.length === 0 && !saving);

	// Leaving the field closes the picker a moment later, so a click on a suggestion still
	// lands. Coming back must cancel that: a navigation that returns focus to the page after a
	// save would otherwise close the picker under whoever is already typing the next moment.
	let closingPicker: ReturnType<typeof setTimeout> | undefined;
	function closePickerSoon() {
		closingPicker = setTimeout(() => (active = null), 120);
	}

	/** Take the field's new text, carrying the picks across the change. */
	function changeText(next: string, picked?: MentionPick) {
		picks = shiftPicks(body, next, picks);
		if (picked) picks = [...picks, picked];
		body = next;
	}

	function onInput(event: Event) {
		changeText((event.currentTarget as HTMLTextAreaElement).value);
		refreshPicker();
	}

	function refreshPicker() {
		clearTimeout(closingPicker);
		if (!textarea) return;
		active = activeHandle(body, textarea.selectionStart);
		selected = 0;
	}

	async function choose(index: number) {
		const row = rows[index];
		if (!row || !active || !textarea) return;
		if (row.kind === 'create') return openCreate(row.name, active, textarea.selectionStart);
		const handle = handleFor(row.person);
		// A name an older build queued has no id or placeholder; the server finds it by name.
		const picked = isQueuedName(row.person.id)
			? undefined
			: { start: active.start, end: active.start + handle.length, id: row.person.id };
		await insert(handle, active, textarea.selectionStart, picked);
	}

	async function insert(handle: string, at: ActiveHandle, caret: number, picked?: MentionPick) {
		if (!textarea) return;
		const r = insertHandle(body, at, caret, handle);
		changeText(r.text, picked);
		active = null;
		await tick();
		textarea.focus();
		textarea.setSelectionRange(r.caret, r.caret);
	}

	/** Open the panel for a new person, named as typed — or as the namesake is, when there is one. */
	async function openCreate(typed: string, at: ActiveHandle, caret: number) {
		const namesake = audience.find((c) => mentionKey(c.displayName) === mentionKey(typed));
		const asTyped = splitTypedName(typed);
		const name = namesake?.firstName
			? { firstName: namesake.firstName, lastName: '' }
			: { ...asTyped, firstName: capitalisedIfTypedLowercase(asTyped.firstName) };
		creating = { firstName: name.firstName, lastName: name.lastName, description: '', at, caret };
		active = null;
		clearTimeout(closingPicker);
		await tick();
		createFirstName?.focus();
	}

	async function cancelCreate() {
		const was = creating;
		creating = null;
		await tick();
		textarea?.focus();
		if (was) textarea?.setSelectionRange(was.caret, was.caret);
	}

	/** Queue the new person with the moment and mention them by their placeholder. */
	async function addCreated() {
		if (!creating || !creating.firstName.trim()) return;
		// Stella refuses a first name alone (docs/02 §2.2.3); the button says so by staying off.
		if (!isKnownByMoreThanAFirstName(creating)) return;
		const person: MomentNewPerson = {
			key: ulid(),
			firstName: creating.firstName.trim(),
			lastName: creating.lastName.trim() || null,
			description: creating.description.trim() || null
		};
		newPeople = [...newPeople, person];
		const [candidate] = newPeopleAsCandidates([person]);
		const handle = handleFor(candidate);
		const { at, caret } = creating;
		creating = null;
		await insert(handle, at, caret, { start: at.start, end: at.start + handle.length, id: candidate.id });
	}

	function onCreateKeydown(event: KeyboardEvent) {
		// The panel sits inside the moment's form: Enter adds the person, it never saves the moment.
		if (event.key === 'Enter') {
			event.preventDefault();
			void addCreated();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			void cancelCreate();
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (active && rows.length > 0) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				selected = (selected + 1) % rows.length;
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				selected = (selected - 1 + rows.length) % rows.length;
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				event.preventDefault();
				void choose(selected);
				return;
			}
			if (event.key === 'Escape') {
				active = null;
				return;
			}
		}
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSave) {
			event.preventDefault();
			(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
		}
	}

	function onFiles(event: Event) {
		picked = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
	}

	/** What the form says, as the command's payload. */
	function payloadFrom(formEl: HTMLFormElement): MomentCapturePayload {
		const data = new FormData(formEl);
		return {
			body: toStored(body, picks).trim(),
			entryDate: String(data.get('entryDate') ?? day),
			visibility,
			// Plain objects: the payload is kept in IndexedDB, which cannot clone a state proxy.
			newPeople: $state.snapshot(newPeople)
		};
	}

	function clear() {
		body = '';
		picks = [];
		picked = [];
		newPeople = [];
		fresh++;
		commandId = ulid();
	}

	/**
	 * The picked photos, processed in the browser (downscaled, location stripped) and each named
	 * as a command of its own — once per save, so a save that ends up kept for later sends the
	 * very same photos under the very same names.
	 */
	async function preparePhotos(): Promise<KeptPhoto[]> {
		const photos: KeptPhoto[] = [];
		for (const file of picked) {
			const { image, thumb, width, height } = await processImage(file);
			photos.push({ id: ulid(), image, thumb, width, height });
		}
		return photos;
	}

	/** Keep the moment, and its photos, on this device until Stella answers again. */
	async function keepForLater(formEl: HTMLFormElement, photos: KeptPhoto[]) {
		try {
			await outbox.add(
				{ id: commandId, type: 'moment.capture', payload: payloadFrom(formEl), issuedAt: Date.now() },
				photos
			);
			clear();
			onKept?.();
		} catch {
			// The text stays in the field: nothing is half-saved.
			localError = t('composer.couldNotKeep');
		}
	}

	/** Save an edit into the kept moment it came from. */
	async function saveEdit(formEl: HTMLFormElement, item: KeptOf<'moment.capture'>) {
		const saved = await outbox.revise(item.command.id, payloadFrom(formEl), ulid());
		if (!saved) {
			localError = t('composer.alreadySending');
			return;
		}
		clear();
		onEditDone?.();
	}

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		saving = true;
		localError = null;
		try {
			if (editing) return await saveEdit(formEl, editing);
			const photos = await preparePhotos();
			if (!reachability.reachable) return await keepForLater(formEl, photos);

			const delivery = await outbox.submit(
				{ id: commandId, type: 'moment.capture', payload: payloadFrom(formEl), issuedAt: Date.now() },
				photos
			);
			if (delivery.status === 'refused') {
				// The text stays in the field, to be corrected and saved as a new moment.
				localError = delivery.reason;
				commandId = ulid();
				return;
			}
			clear();
			if (delivery.status === 'kept') return onKept?.();
			// Back to the stream, offering to link the first two people in it (§2.22.1).
			const { linkSuggestion } = delivery.result as { linkSuggestion: [string, string] | null };
			await goto(linkHintHref(linkSuggestion), { invalidateAll: true });
		} catch {
			localError = t('composer.saveFailed');
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		if (autofocus) textarea?.focus();
	});

	/** Where the list starts below the composer's top edge (`top-16`), and its gap to a screen edge. */
	const LIST_OFFSET = 64;
	const EDGE_GAP = 8;

	// The list stays on screen: in the phone's sheet the composer sits at the bottom, with the
	// keyboard shrinking the visible part further, so it opens upwards when there is more room.
	$effect(() => {
		if (!list || !composer) return;
		void rows.length;
		const viewport = window.visualViewport;
		const visibleTop = viewport?.offsetTop ?? 0;
		const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight);
		const top = composer.getBoundingClientRect().top;
		placement = listPlacement(
			{ above: top - visibleTop - EDGE_GAP, below: visibleBottom - top - LIST_OFFSET - EDGE_GAP },
			list.scrollHeight
		);
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
	{#if error || localError}
		<p class="mx-3 mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error ?? localError}</p>
	{/if}
	<div class="flex items-start gap-3 p-3 pb-2">
		<Avatar id={me.id} name={me.name} avatarPhotoId={me.avatarPhotoId ?? null} size={40} />
		<textarea
			bind:this={textarea}
			value={body}
			name="body"
			rows="2"
			required
			data-moment-body
			placeholder={t('composer.placeholder')}
			aria-label={t('composer.label')}
			aria-autocomplete="list"
			onkeydown={onKeydown}
			oninput={onInput}
			onclick={refreshPicker}
			onkeyup={(e) => (e.key.startsWith('Arrow') ? refreshPicker() : undefined)}
			onfocus={() => clearTimeout(closingPicker)}
			onblur={closePickerSoon}
			class="min-h-14 flex-1 resize-y bg-transparent font-serif text-[17px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
		></textarea>
	</div>

	{#if creating}
		<!-- Plain inputs, not a nested form: the panel lives inside the moment's form. It takes
		     its place in the card rather than floating over it, so on a phone, where the composer
		     is a sheet at the bottom of the screen, it grows the sheet instead of leaving it. -->
		<div
			class="mx-3 mb-2 flex flex-col gap-2.5 rounded-app border border-border bg-bg p-3"
			data-testid="composer-create"
			onkeydown={onCreateKeydown}
			role="none"
		>
			<p class="text-sm font-semibold text-fg">{t('components.personSearch.createTitle')}</p>
			<div class="grid grid-cols-2 gap-2">
				<label class="flex flex-col gap-1 text-xs text-fg-muted">
					{t('components.personSearch.firstName')}
					<input
						bind:this={createFirstName}
						bind:value={creating.firstName}
						type="text"
						autocomplete="off"
						class="rounded-control border border-border bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs text-fg-muted">
					{t('components.personSearch.lastName')}
					<input
						bind:value={creating.lastName}
						type="text"
						autocomplete="off"
						class="rounded-control border border-border bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
					/>
				</label>
			</div>
			{#if askForSomethingToKnowThemBy}
				<KnowThemBy
					firstName={creating.firstName}
					compact
					label={t('components.personSearch.description')}
					bind:value={creating.description}
					inputClass="rounded-control border border-border bg-card px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
				/>
			{:else}
				<label class="flex flex-col gap-1 text-xs text-fg-muted">
					{t('components.personSearch.description')}
					<input
						bind:value={creating.description}
						type="text"
						autocomplete="off"
						placeholder={t('components.namesake.placeholder')}
						class="rounded-control border border-border bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
					/>
				</label>
			{/if}
			<div class="flex justify-end gap-2">
				<!-- `type="button"`: inside the moment's form, these must never save it. -->
				<Button type="button" variant="ghost" size="sm" onclick={cancelCreate}>{t('components.personSearch.cancel')}</Button>
				<Button type="button" variant="primary" size="sm" disabled={!creating.firstName.trim() || !isKnownByMoreThanAFirstName(creating)} onclick={addCreated}>
					{t('composer.addPerson')}
				</Button>
			</div>
		</div>
	{:else if active && rows.length > 0}
		<ul
			role="listbox"
			bind:this={list}
			style:max-height="{placement.maxHeight}px"
			class="absolute left-14 z-10 w-[min(320px,calc(100%-4rem))] overflow-y-auto rounded-app border border-border bg-card p-1 shadow-pop {placement.side ===
			'above'
				? 'bottom-full mb-1'
				: 'top-16'}"
		>
			<li class="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{t('composer.people')}</li>
			{#each rows as row, i (row.kind === 'person' ? row.person.id : 'create')}
				<li>
					<button
						type="button"
						role="option"
						aria-selected={i === selected}
						onmousedown={(e) => {
							e.preventDefault();
							void choose(i);
						}}
						onmouseenter={() => (selected = i)}
						class="flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left text-sm text-fg aria-selected:bg-primary-soft"
					>
						{#if row.kind === 'person'}
							<Avatar id={row.person.id} name={row.person.displayName} size={22} />
							<span class="min-w-0">
								<span class="block truncate">{row.person.displayName}</span>
								{#if namesakes.get(row.person.id)}<NamesakeLine distinction={namesakes.get(row.person.id)!} />{/if}
							</span>
							{#if createdIds.has(row.person.id)}<span class="ml-auto text-xs text-fg-subtle">{t('composer.justCreated')}</span>{/if}
						{:else}
							<span class="grid size-[22px] place-items-center rounded-full border border-dashed border-success text-success">+</span>
							<span class="font-semibold text-success">{row.another ? t('composer.createAnother', { name: row.name }) : t('composer.create', { name: row.name })}</span>
							<span class="ml-auto text-xs text-fg-subtle">{t('composer.newPerson')}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if unclear.length}
		<div class="mx-3 mb-2"><WhichNamesake {unclear} /></div>
	{/if}

	<div class="flex flex-wrap items-center gap-2 border-t border-border-subtle px-3 py-2">
		<label class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted has-checked:border-transparent has-checked:bg-primary-soft has-checked:font-semibold has-checked:text-primary">
			<input type="checkbox" class="sr-only" checked={visibility === 'shared'} onchange={(e) => (visibility = (e.currentTarget as HTMLInputElement).checked ? 'shared' : 'private')} />
			<Icon name={visibility === 'shared' ? 'shared' : 'private'} size={13} />
			{visibility === 'shared' ? t('common.shared') : t('common.private')}
		</label>
		<input type="hidden" name="visibility" value={visibility} />
		{#key fresh}
		{#if !editing}
			<label class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted hover:text-fg">
				<Icon name="photo" size={13} />
				{picked.length ? t('composer.photoCount', { count: picked.length }) : t('composer.photo')}
				<input type="file" accept="image/*" multiple onchange={onFiles} class="hidden" />
			</label>
		{/if}
		<DayPill name="entryDate" value={kept?.entryDate ?? day} today={day} />
		{/key}
		<span class="text-xs text-fg-subtle" aria-live="polite">
			{#if unclear.length}
				<!-- The box above asks which one. -->
			{:else if referenced.length}
				{t('composer.goesTo')}
				<b class="font-semibold text-fg-muted">{referenced[0].displayName}</b>{t(
					'composer.goesToJournal'
				)}{referenced.length > 1
					? t('composer.alsoMentions', { count: referenced.length - 1 })
					: ''}
			{:else if body.trim()}
				{t('composer.needMention')}
			{/if}
		</span>
		<div class="ml-auto flex items-center gap-2">
		{#if editing}
			<Button variant="ghost" type="button" onclick={() => onEditDone?.()}>{t('common.cancel')}</Button>
		{/if}
		<Button variant="primary" disabled={!canSave}>
			{saving ? t('common.saving') : reachability.reachable ? t('common.save') : t('composer.saveForLater')}
			<kbd class="rounded border border-primary-fg/40 px-1 text-[10px] font-medium opacity-75">⌘⏎</kbd>
		</Button>
		</div>
	</div>
</form>
