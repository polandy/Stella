<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import MomentComposer from '$lib/components/MomentComposer.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import Section from '$lib/components/Section.svelte';
	import StoryTimeline from '$lib/components/StoryTimeline.svelte';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import type { JsonCommand } from '$lib/commands/commands';
	import { contactSectionPath, sectionAnchor } from '$lib/contacts/sections';
	import {
		draftWorthUndo,
		withLogAsked,
		withMomentAsked,
		type MomentDraft,
		type StoryForm
	} from '$lib/contacts/story-forms';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import {
		INTERACTION_KINDS,
		isInteractionKind,
		KIND_PRESENTATION,
		type InteractionKind
	} from '$lib/interactions/kinds';
	import { asTyped, newPeopleAsCandidates } from '$lib/mentions/picks';
	import { reveal } from '$lib/motion/motion.svelte';
	import { scrollBehavior } from '$lib/motion/motion';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { tick } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { ulid } from 'ulid';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * What has happened with someone (docs/02 §2.23): the person page's story card, with the
	 * moment composer and the log form sharing the spot at its top, one at a time (docs/05 §5.5).
	 * The identity card opens either through `writeMoment` and `logContact`.
	 */
	let {
		data,
		form,
		otherContacts
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Whom else a touchpoint or a moment can name: everyone visible but this person. */
		otherContacts: PersonPageData['people'];
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	// Today in the browser's zone, as the default day for a new interaction.
	const today = new Date().toLocaleDateString('en-CA');
	const removals = useRemovals();
	/** What a form saved through the outbox does once Stella took it: say so, then `close`. */
	const savedThen = (close: () => void) => () => {
		removals.notify(t('components.saved'));
		close();
	};

	let participantIds = $state<string[]>([]);

	// Which form holds the spot at the top of the card; the other keeps what was typed in it.
	let openForm = $state<StoryForm | null>(null);
	const logOpen = $derived(openForm === 'log');
	function closeForm(which: StoryForm) {
		if (openForm === which) openForm = null;
	}

	/*
	 * The moment composer, anchored on this person (docs/02 §2.20). Its draft lives here, so it
	 * survives the composer folding away for the log form; `composerRun` starts a fresh composer
	 * from it, which an *Undo* needs while the old one may still be folding away.
	 */
	let momentDraft = $state<MomentDraft | null>(null);
	let composerRun = $state(0);
	let editingMoment = $state<KeptOf<'moment.capture'> | null>(null);

	/** Open the composer — or, open already, bring the reader back to it. */
	export async function writeMoment() {
		const next = withMomentAsked(openForm);
		openForm = next.open;
		if (next.opened) await tick();
		const card = document.getElementById(sectionAnchor('story'));
		const field = card?.querySelector<HTMLTextAreaElement>('[data-moment-body]');
		// Just under the top bar, so on a phone the field sits above the keyboard.
		card?.scrollIntoView({
			block: 'start',
			behavior: scrollBehavior(prefersReducedMotion.current)
		});
		field?.focus({ preventScroll: true });
		field?.setSelectionRange(field.value.length, field.value.length);
	}

	export function logContact() {
		openForm = withLogAsked(openForm, true);
	}

	/*
	 * The composer folds away with the cursor in it; the browser would drop focus on the page
	 * and the next Tab start at the top. It goes to the card's *Log contact* instead, as a
	 * closing log form hands it back (WCAG 2.4.3).
	 */
	function closeMoment() {
		const active = document.activeElement;
		const focusInComposer =
			!active || active === document.body || active.closest('[data-testid="story-composer"]');
		closeForm('moment');
		if (!focusInComposer) return;
		document
			.getElementById(sectionAnchor('story'))
			?.querySelector<HTMLElement>('[data-section-toggle]')
			?.focus({ preventScroll: true });
	}

	function momentCancelled(draft: MomentDraft) {
		momentDraft = null;
		closeMoment();
		const offered = draftWorthUndo(draft);
		if (!offered) return;
		removals.notify(t('composer.discarded'), () => {
			momentDraft = offered;
			composerRun++;
			void writeMoment();
		});
	}

	async function momentSaved() {
		momentDraft = null;
		closeMoment();
		removals.notify(t('components.saved'));
		// The timeline is the page's: a fresh first page shows the moment at the top.
		await invalidateAll();
	}

	function momentKept() {
		momentDraft = null;
		closeMoment();
	}

	/*
	 * Moments written here while Stella was out of reach, kept on the device beside the kept
	 * logs until they are sent. Editing one opens it in the composer, which saves into the copy.
	 */
	const keptMoments = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'moment.capture'> =>
				isKept(item, 'moment.capture') && item.command.payload.anchorId === c.id
		)
	);
	async function editKeptMoment(item: KeptOf<'moment.capture'>) {
		if (!(await outbox.hold(item.command.id))) return;
		const held = outbox.mine.find((i) => i.command.id === item.command.id);
		editingMoment = held && isKept(held, 'moment.capture') ? held : null;
		composerRun++;
		await writeMoment();
	}
	function stopEditingMoment() {
		closeMoment();
	}
	// However the edit ends — saved, cancelled, or the log form taking the spot — the kept
	// moment is let go, to be sent with the rest.
	$effect(() => {
		if (openForm === 'moment' || !editingMoment) return;
		const item = editingMoment;
		editingMoment = null;
		composerRun++;
		void outbox.release(item.command.id);
	});

	/*
	 * Calls and visits logged here while Stella was out of reach (docs/02 §2.18): kept on the
	 * device and shown at the top of this person's story until they are sent. Editing one
	 * reopens the log form on it, which then saves into the kept copy.
	 */
	const keptLogs = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'interaction.log'> =>
				isKept(item, 'interaction.log') && item.command.payload.contactId === c.id
		)
	);
	// The form's first kind is its default, as it was before it could be reopened on a kept one.
	let logKind = $state<InteractionKind>(INTERACTION_KINDS[0]);
	let logDay = $state(today);
	let logTitle = $state('');
	let logDescription = $state('');
	let logVisibility = $state<'shared' | 'private'>('shared');
	// Bumped to start the day field afresh with `logDay`; it keeps its own parts otherwise.
	let logFresh = $state(0);
	let editingLog = $state<KeptOf<'interaction.log'> | null>(null);
	function clearLog() {
		logKind = INTERACTION_KINDS[0];
		logDay = today;
		logTitle = '';
		logDescription = '';
		logVisibility = 'shared';
		participantIds = [];
		logFresh++;
	}
	function closeLog() {
		clearLog();
		closeForm('log');
	}
	async function editKeptLog(item: KeptOf<'interaction.log'>) {
		if (!(await outbox.hold(item.command.id))) return;
		const p = item.command.payload;
		editingLog = item;
		logKind = p.kind;
		logDay = p.happenedAt;
		logTitle = p.title ?? '';
		logDescription = p.description ?? '';
		logVisibility = p.visibility;
		participantIds = [...p.participantIds];
		logFresh++;
		openForm = 'log';
	}
	$effect(() => {
		if (logOpen || !editingLog) return;
		const item = editingLog;
		editingLog = null;
		clearLog();
		void outbox.release(item.command.id);
	});
	/** The log form's fields as the command they stand for. */
	function logCommandFrom(form: FormData, id: string): JsonCommand | null {
		const kind = String(form.get('kind') ?? '');
		const happenedAt = String(form.get('happenedAt') ?? '');
		if (!isInteractionKind(kind) || !happenedAt) return null;
		return {
			id,
			type: 'interaction.log',
			payload: {
				contactId: c.id,
				kind,
				happenedAt,
				title: String(form.get('title') ?? '').trim() || null,
				description: String(form.get('description') ?? '').trim() || null,
				visibility: form.get('visibility') === 'private' ? 'private' : 'shared',
				participantIds: form
					.getAll('participants')
					.filter((p): p is string => typeof p === 'string')
			},
			issuedAt: Date.now()
		};
	}
	const keepLog = $derived(
		keepable(
			{
				toCommand: logCommandFrom,
				about: c.displayName,
				errorKey: 'interactionError',
				// Back on the story card it was logged from, not at the top of the page.
				onApplied: async () => {
					savedThen(closeLog)();
					await goto(contactSectionPath(c.id, 'story'), { keepFocus: true });
				},
				onKept: closeLog
			},
			savedEnhance(removals, t('components.saved'), closeLog)
		)
	);
	const logForm: SubmitFunction = (input) => {
		if (!editingLog) return keepLog(input);
		input.cancel();
		const item = editingLog;
		const command = logCommandFrom(input.formData, item.command.id);
		editingLog = null;
		if (command?.type === 'interaction.log')
			void outbox.revise(item.command.id, command.payload, ulid());
		clearLog();
		closeForm('log');
	};
</script>

<Section
	id={sectionAnchor('story')}
	title={t('contact.story.title')}
	addLabel={t('contact.logContact')}
	addIcon="met"
	bind:open={() => logOpen, (wanted) => (openForm = withLogAsked(openForm, wanted))}
	error={form?.interactionError ?? null}
>
	{#snippet action()}
		<Button variant="ghost" size="sm" icon="journal" href="/contacts/{c.id}/journal"
			>{t('contact.openJournal')}</Button
		>
	{/snippet}
	{#if openForm === 'moment'}
		<!-- Unfolds in place (docs/05 §5.11); keyed so an Undo starts from the draft it offers. -->
		<div transition:reveal class="mb-3" data-testid="story-composer">
			{#key composerRun}
				<MomentComposer
					candidates={otherContacts}
					me={{ id: data.user.id, name: data.user.name }}
					{today}
					anchor={c}
					held={editingMoment ? null : momentDraft}
					editing={editingMoment}
					onEditDone={stopEditingMoment}
					onSaved={momentSaved}
					onKept={momentKept}
					onCancel={editingMoment ? undefined : momentCancelled}
					onDraft={editingMoment ? undefined : (draft) => (momentDraft = draft)}
				/>
			{/key}
		</div>
	{/if}
	{#if keptMoments.length > 0}
		<ul class="mb-3 flex flex-col gap-2" data-testid="kept-moments">
			{#each keptMoments as item (item.command.id)}
				<li>
					<KeptItem {item} onEdit={() => editKeptMoment(item)}>
						{#snippet meta()}
							<span class="ml-auto text-xs whitespace-nowrap text-fg-subtle"
								>{dayLabel(i18n, item.command.payload.entryDate)}</span
							>
						{/snippet}
						<p class="mt-1 font-serif whitespace-pre-line text-fg">
							{asTyped(item.command.payload.body, [
								...data.people,
								...newPeopleAsCandidates(item.command.payload.newPeople)
							])}
						</p>
					</KeptItem>
				</li>
			{/each}
		</ul>
	{/if}
	{#if keptLogs.length > 0}
		<ul class="mb-3 flex flex-col gap-2" data-testid="kept-logs">
			{#each keptLogs as item (item.command.id)}
				{@const kind = KIND_PRESENTATION[item.command.payload.kind]}
				<li>
					<KeptItem {item} onEdit={() => editKeptLog(item)}>
						{#snippet meta()}
							<span>· {t(kind.label)}</span>
							<span class="ml-auto text-xs whitespace-nowrap text-fg-subtle"
								>{dayLabel(i18n, item.command.payload.happenedAt)}</span
							>
						{/snippet}
						{#if item.command.payload.title}<p class="mt-1 text-fg">
								{item.command.payload.title}
							</p>{/if}
						{#if item.command.payload.description}<p class="mt-1 text-sm text-fg-muted">
								{item.command.payload.description}
							</p>{/if}
					</KeptItem>
				</li>
			{/each}
		</ul>
	{/if}
	<!-- Keyed on the story itself: the timeline owns its paged list, so a new touchpoint
		     reaches it as a fresh first page when the page's data is reloaded. -->
	<!-- A person with nothing yet: the empty state steps aside while the composer is open. -->
	{#if !(openForm === 'moment' && data.story.items.length === 0)}
		{#key data.story}
			<StoryTimeline contactId={c.id} initial={data.story} />
		{/key}
	{/if}

	{#snippet editor()}
		<form method="POST" action="?/logInteraction" use:enhance={logForm} class="flex flex-col gap-3">
			<div class="flex flex-wrap items-end gap-2">
				<!-- Bound, so the kind chosen survives the composer taking the spot for a while. -->
				<select name="kind" aria-label={t('contact.kind')} class={INPUT} bind:value={logKind}>
					{#each data.interactionKinds as kind (kind)}
						<option value={kind}>{t(KIND_PRESENTATION[kind].label)}</option>
					{/each}
				</select>
				{#key logFresh}<DateField
						name="happenedAt"
						value={logDay}
						required
						label={t('contact.day')}
					/>{/key}
				<input
					name="title"
					bind:value={logTitle}
					placeholder={t('contact.interaction.titlePlaceholder')}
					aria-label={t('contact.interaction.titlePlaceholder')}
					class="min-w-48 flex-1 {INPUT}"
				/>
			</div>
			<textarea
				name="description"
				bind:value={logDescription}
				rows="2"
				placeholder={t('contact.interaction.detailsPlaceholder')}
				aria-label={t('contact.interaction.detailsPlaceholder')}
				class={INPUT}></textarea>
			{#if otherContacts.length > 0}
				<!-- The label names the field only, not the chips and list around it. -->
				<div class="flex flex-col gap-1 text-sm">
					<label for="interaction-participants" class="text-fg-muted"
						>{t('contact.interaction.whoElse')}</label
					>
					<PersonSearchSelect
						id="interaction-participants"
						people={otherContacts}
						name="participants"
						bind:selectedIds={participantIds}
						multiple
						allowCreate
					/>
				</div>
			{/if}
			<div class="flex flex-wrap items-center gap-4 text-sm">
				<fieldset class="flex flex-wrap items-center gap-4">
					<legend class="sr-only">{t('common.visibility')}</legend>
					<label class="flex items-center gap-1.5">
						<input type="radio" name="visibility" value="shared" bind:group={logVisibility} />
						{t('common.shared')}
					</label>
					<label class="flex items-center gap-1.5">
						<input type="radio" name="visibility" value="private" bind:group={logVisibility} />
						{t('common.private')}
					</label>
				</fieldset>
				<Button variant="primary" size="sm" class="ml-auto">
					{editingLog ? t('common.save') : t('contact.interaction.submit')}
				</Button>
			</div>
		</form>
	{/snippet}
</Section>
