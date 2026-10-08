<script lang="ts">
	import FormError from '$lib/components/FormError.svelte';
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
	import { processImage } from '$lib/media/process-image';
	import { listPlacement, type ListPlacement } from '$lib/mentions/picker';
	import { usePeopleContext } from '$lib/people/context.svelte';
	import { tellApart } from '$lib/people/namesakes';
	import { isKnownByMoreThanAFirstName, wantsSomethingToKnowThemBy } from '$lib/people/new-person';
	import type { MomentDraft } from '$lib/people/story-forms';
	import type { KeptOf, KeptPhoto } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { createPanelKey, keyupAsksPicker, textKey } from '$lib/stream/composer-keys';
	import {
		composerPeople,
		composerReading,
		defaultDay,
		draftOf,
		pickerRows
	} from '$lib/stream/composer-reading';
	import {
		composerAfter,
		composerAtOpen,
		type ComposerCandidate,
		type ComposerCommand,
		type ComposerError,
		type ComposerEvent,
		type Creating
	} from '$lib/stream/composer-state';
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
		onDraft
	}: Props = $props();

	const t = useTranslate();
	const uid = $props.id();
	const errorId = `${uid}-error`;
	const listboxId = `${uid}-people`;
	const optionId = (i: number) => `${uid}-person-${i}`;

	/*
	 * What the composer is doing — the text and its picks, the @-list, a person being created,
	 * the photos and a save on its way: the transitions are `composer-state.ts`, and this
	 * component carries out the commands they hand back. Raw, and read through one derived per
	 * field, so an event that changes one of them re-runs only what reads that one.
	 */
	// svelte-ignore state_referenced_locally -- the kept moment is only a starting value on purpose
	const kept = editing?.command.payload ?? null;
	let ui = $state.raw(
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
		)
	);
	const body = $derived(ui.body);
	const picks = $derived(ui.picks);
	const newPeople = $derived(ui.newPeople);
	const visibility = $derived(ui.visibility);
	const anchorId = $derived(ui.anchorId);
	const fresh = $derived(ui.fresh);
	const photos = $derived(ui.photos);
	const active = $derived(ui.active);
	const selected = $derived(ui.highlighted);
	const creating = $derived(ui.creating);
	const sending = $derived(ui.sending);
	const saving = $derived(sending !== null);
	const localError = $derived(errorText(ui.error));

	const anchorPerson = $derived(anchor ?? candidates.find((c) => c.id === anchorId) ?? null);

	// A page kept on the device may be days old, and so is the day it was rendered with.
	const localDay = () => new Date().toLocaleDateString('en-CA');
	const day = $derived(defaultDay(today, browser ? localDay() : null));
	let textarea: HTMLTextAreaElement | undefined = $state();
	let composer: HTMLFormElement | undefined = $state();
	let list: HTMLUListElement | undefined = $state();
	let placement: ListPlacement = $state({ side: 'below', maxHeight: Number.POSITIVE_INFINITY });

	const people = $derived(composerPeople({ anchorId, visibility, newPeople }, candidates));
	const audience = $derived(people.audience);
	const createdIds = $derived(new Set(people.created.map((c) => c.id)));
	const known = $derived(people.known);
	const rows = $derived(pickerRows(active, known));
	const listOpen = $derived(active !== null && rows.length > 0);
	// The second line counts everyone the list could offer, not only what the query left.
	const peopleContext = usePeopleContext();
	const namesakes = $derived(tellApart(audience, peopleContext()));
	const askForSomethingToKnowThemBy = $derived(
		creating
			? wantsSomethingToKnowThemBy({ firstName: creating.firstName, lastName: creating.lastName })
			: false
	);
	const reading = $derived(
		composerReading({ body, picks, anchorId, sending }, known, peopleContext())
	);
	const referenced = $derived(reading.referenced);
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

	/** Moves the state on, then carries out what it asks for; settles once all of it has. */
	async function dispatch(event: ComposerEvent): Promise<void> {
		// Untracked: an effect that dispatches must not come to depend on the state it writes, nor
		// on whatever a command reads on its way.
		const step = composerAfter(
			untrack(() => ui),
			event
		);
		ui = step.state;
		await Promise.all(untrack(() => step.commands.map(carryOut)));
	}

	async function carryOut(command: ComposerCommand): Promise<void> {
		switch (command.kind) {
			case 'focusText':
				await tick();
				textarea?.focus();
				if (command.caret !== null) textarea?.setSelectionRange(command.caret, command.caret);
				return;
			case 'focusCreate':
				clearTimeout(closingPicker);
				await tick();
				createFirstName?.focus();
				return;
			case 'preparePhotos': {
				const prepared = await preparePhotos(command.files);
				return dispatch({
					type: 'photosPrepared',
					photos: prepared,
					reachable: reachability.reachable
				});
			}
			case 'keep':
				// Keep the moment, and its photos, on this device until Stella answers again.
				try {
					await outbox.add(
						{
							id: command.id,
							type: 'moment.capture',
							payload: command.payload,
							issuedAt: Date.now()
						},
						command.photos
					);
					await dispatch({ type: 'keptOnDevice', nextCommandId: ulid() });
				} catch {
					await dispatch({ type: 'keepFailed' });
				}
				return;
			case 'submit': {
				const delivery = await outbox.submit(
					{
						id: command.id,
						type: 'moment.capture',
						payload: command.payload,
						issuedAt: Date.now()
					},
					command.photos
				);
				return dispatch({
					type: 'answered',
					delivery,
					inPlace: onSaved !== undefined,
					nextCommandId: ulid()
				});
			}
			case 'revise': {
				const saved = await outbox.revise(command.id, command.payload, ulid());
				return dispatch({ type: 'revised', saved, nextCommandId: ulid() });
			}
			case 'backToStream':
				return goto(command.href, { invalidateAll: true });
			case 'onSaved':
				return onSaved?.();
			case 'onKept':
				return onKept?.();
			case 'onEditDone':
				return onEditDone?.();
			case 'onCancel':
				return onCancel?.(command.draft);
		}
	}

	// Leaving the field closes the picker a moment later, so a click on a suggestion still
	// lands. Coming back must cancel that: a navigation that returns focus to the page after a
	// save would otherwise close the picker under whoever is already typing the next moment.
	let closingPicker: ReturnType<typeof setTimeout> | undefined;
	function closePickerSoon() {
		closingPicker = setTimeout(() => void dispatch({ type: 'pickerClosed' }), 120);
	}

	function onInput(event: Event) {
		const field = event.currentTarget as HTMLTextAreaElement;
		clearTimeout(closingPicker);
		void dispatch({ type: 'typed', text: field.value, caret: field.selectionStart });
	}

	function onKeyup(event: KeyboardEvent) {
		if (keyupAsksPicker(event.key, listOpen)) refreshPicker();
	}

	function refreshPicker() {
		clearTimeout(closingPicker);
		if (textarea) void dispatch({ type: 'caretMoved', caret: textarea.selectionStart });
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

	// Picks change only with the text, so the text alone says when the draft has changed.
	$effect(() => {
		if (!onDraft) return;
		onDraft(draftOf({ body, visibility, newPeople, picks: untrack(() => picks) }));
	});

	/**
	 * The picked photos, processed in the browser (downscaled, location stripped) and each named
	 * as a command of its own — once per save, so a save that ends up kept for later sends the
	 * very same photos under the very same names.
	 */
	async function preparePhotos(files: readonly File[]): Promise<KeptPhoto[]> {
		const prepared: KeptPhoto[] = [];
		for (const file of files) {
			const { image, thumb, width, height, takenAt } = await processImage(file);
			prepared.push({ id: ulid(), image, thumb, width, height, takenAt });
		}
		return prepared;
	}

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
	<FormError message={error ?? localError} id={errorId} class="mx-3 mt-3" />
	{#if anchorPerson}
		<!-- Not removable: the moment is on this person's page, so it is theirs. -->
		<p class="flex flex-wrap items-center gap-1.5 px-3 pt-3 text-xs text-fg-subtle" data-anchor>
			<span
				class="inline-flex items-center gap-1.5 rounded-full bg-primary-soft py-0.5 pr-2.5 pl-0.5 font-semibold text-fg"
			>
				<Avatar
					id={anchorPerson.id}
					name={anchorPerson.displayName}
					avatarPhotoId={anchorPerson.avatarPhotoId}
					size={20}
				/>{anchorPerson.displayName}
			</span>
			{t('composer.anchorGoesTo', {
				name: anchorPerson.firstName ?? anchorPerson.displayName
			})}
		</p>
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
			aria-controls={listboxId}
			aria-activedescendant={!creating && active && rows[selected] ? optionId(selected) : undefined}
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
						bind:value={() => creating?.firstName ?? '', (v) => editCreating('firstName', v)}
						type="text"
						autocomplete="off"
						class="rounded-control border border-border-input bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs text-fg-muted">
					{t('components.personSearch.lastName')}
					<input
						bind:value={() => creating?.lastName ?? '', (v) => editCreating('lastName', v)}
						type="text"
						autocomplete="off"
						class="rounded-control border border-border-input bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
					/>
				</label>
			</div>
			{#if askForSomethingToKnowThemBy}
				<KnowThemBy
					firstName={creating.firstName}
					compact
					label={t('components.personSearch.description')}
					bind:value={() => creating?.description ?? '', (v) => editCreating('description', v)}
					inputClass="rounded-control border border-border-input bg-card px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
				/>
			{:else}
				<label class="flex flex-col gap-1 text-xs text-fg-muted">
					{t('components.personSearch.description')}
					<input
						bind:value={() => creating?.description ?? '', (v) => editCreating('description', v)}
						type="text"
						autocomplete="off"
						placeholder={t('components.namesake.placeholder')}
						class="rounded-control border border-border-input bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
					/>
				</label>
			{/if}
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
		</div>
	{:else if active && rows.length > 0}
		<ul
			id={listboxId}
			role="listbox"
			aria-label={t('composer.people')}
			bind:this={list}
			style:max-height="{placement.maxHeight}px"
			class="absolute left-14 z-10 w-[min(320px,calc(100%-4rem))] overflow-y-auto rounded-app border border-border bg-card p-1 shadow-pop {placement.side ===
			'above'
				? 'bottom-full mb-1'
				: 'top-16'}"
		>
			<!-- A caption for the eye; the listbox carries the same words as its name. -->
			<li
				role="presentation"
				aria-hidden="true"
				class="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-fg-muted uppercase"
			>
				{t('composer.people')}
			</li>
			{#each rows as row, i (row.kind === 'person' ? row.person.id : 'create')}
				<li role="none">
					<!-- tabindex -1: the field keeps focus and points here with aria-activedescendant. -->
					<button
						type="button"
						role="option"
						id={optionId(i)}
						tabindex="-1"
						aria-selected={i === selected}
						onmousedown={(e) => {
							e.preventDefault();
							void choose(i);
						}}
						onmouseenter={() => dispatch({ type: 'highlighted', index: i })}
						class="flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left text-sm text-fg aria-selected:bg-primary-soft"
					>
						{#if row.kind === 'person'}
							<Avatar
								id={row.person.id}
								name={row.person.displayName}
								avatarPhotoId={row.person.avatarPhotoId}
								size={22}
							/>
							<span class="min-w-0">
								<span class="block truncate">{row.person.displayName}</span>
								{#if namesakes.get(row.person.id)}<NamesakeLine
										distinction={namesakes.get(row.person.id)!}
									/>{/if}
							</span>
							{#if createdIds.has(row.person.id)}<span class="ml-auto text-xs text-fg-subtle"
									>{t('composer.justCreated')}</span
								>{/if}
						{:else}
							<span
								class="grid size-[22px] place-items-center rounded-full border border-dashed border-success text-success-text"
								aria-hidden="true">+</span
							>
							<span class="font-semibold text-success-text"
								>{row.another
									? t('composer.createAnother', { name: row.name })
									: t('composer.create', { name: row.name })}</span
							>
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
		<!--
			A switch, because it is one (docs/05 §5.7): a checkbox in the switch role whose name stays
			put — "Share with household", on or off — so a screen reader hears one control changing
			state rather than a label that swaps under it. The visible word is the state with its
			icon, for the eye.
		-->
		<label
			class="group/share inline-flex cursor-pointer items-center gap-2 rounded-full px-1 py-1 text-xs text-fg-muted has-checked:font-semibold has-checked:text-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring"
		>
			<input
				type="checkbox"
				role="switch"
				class="sr-only"
				aria-label={t('composer.shareWithHousehold')}
				checked={visibility === 'shared'}
				onchange={(e) =>
					dispatch({
						type: 'visibilitySet',
						visibility: (e.currentTarget as HTMLInputElement).checked ? 'shared' : 'private'
					})}
			/>
			<span
				class="relative h-4.5 w-7.5 shrink-0 rounded-full bg-border transition-colors duration-(--motion-fade) ease-standard group-has-checked/share:bg-primary"
				aria-hidden="true"
				><span
					class="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-card shadow-card transition-transform duration-(--motion-fade) ease-standard group-has-checked/share:translate-x-3"
				></span></span
			>
			<span class="inline-flex items-center gap-1" aria-hidden="true"
				><Icon name={visibility === 'shared' ? 'shared' : 'private'} size={13} />{visibility ===
				'shared'
					? t('common.shared')
					: t('common.private')}</span
			>
		</label>
		<input type="hidden" name="visibility" value={visibility} />
		{#key fresh}
			{#if !editing}
				<!-- An icon button, as it acts at once (docs/05 §5.7); the badge counts what was picked.
				     `sr-only`, not `hidden`: a hidden input is out of the tab order, and the photo
				     button with it (WCAG 2.1.1). The button shows where focus is instead. -->
				<label
					title={t('composer.addPhotos')}
					class="relative grid size-8 cursor-pointer place-items-center rounded-full text-fg-muted transition-colors hover:bg-card-hover hover:text-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring"
				>
					<Icon name="photo" size={17} />
					{#if photos.length}<span
							class="absolute -top-0.5 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-fg tabular-nums"
							aria-hidden="true"
							data-testid="photo-count">{photos.length}</span
						>{/if}
					<input
						type="file"
						accept="image/*"
						multiple
						aria-label={t('composer.addPhotos')}
						onchange={(e) =>
							dispatch({
								type: 'photosPicked',
								files: Array.from((e.currentTarget as HTMLInputElement).files ?? [])
							})}
						class="sr-only"
					/>
				</label>
			{/if}
			<DayPill name="entryDate" value={kept?.entryDate ?? day} today={day} />
		{/key}
		<span class="text-xs text-fg-subtle" aria-live="polite">
			{#if unclear.length}
				<!-- The box above asks which one. -->
			{:else if anchorId}
				{t('composer.mentionsSomeoneElse')}
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
