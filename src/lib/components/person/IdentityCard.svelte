<script lang="ts">
	import { reveal } from '$lib/motion/motion.svelte';
	import AvatarUploader from '$lib/components/person/AvatarUploader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import InlineEdit from '$lib/components/ui/InlineEdit.svelte';
	import { page } from '$app/state';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import {
		addMoreLabel,
		addressLines,
		birthdayFact,
		identityLayout,
		initialPanel,
		otherDateFacts,
		recordMenu,
		type Fillable,
		type Missing
	} from '$lib/people/identity-card';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { jobShortForm } from '$lib/people/job';
	import { homesShown } from '$lib/people/home';
	import { tick, untrack } from 'svelte';
	import IdentityFacts, { type EditedFact } from './IdentityFacts.svelte';
	import IdentityMarkers from './IdentityMarkers.svelte';
	import IdentityMenu from './IdentityMenu.svelte';
	import IdentityRows from './IdentityRows.svelte';
	import LastNameHelp from './LastNameHelp.svelte';
	import NameEditor from './NameEditor.svelte';
	import RecordActions from './RecordActions.svelte';
	import { refusedMergeOf, type PersonForm, type PersonPageData } from './types';

	/*
	 * The top of a person's page (docs/05 §5.5): who this is. Portrait, name and description, a
	 * few labelled facts — only what the record holds, each edited where it is read — and below
	 * them the rows that have no fact (*Contact*, *Tags*, *How we met*). What the record does not
	 * hold yet waits behind one quiet button that names it. One thing to do here (write a
	 * moment); everything else is in the ⋯ menu. Which facts, slots and rows show is decided in
	 * `identity-card.ts`; the facts, the rows and the ⋯ menu render in parts of their own.
	 */
	let {
		data,
		form,
		otherContacts,
		metLine,
		isSelf,
		archived,
		logContact,
		writeMoment,
		tracePath
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Everyone visible but this person. */
		otherContacts: PersonPageData['people'];
		/** How this person came into the household's life, as one line, or null. */
		metLine: string | null;
		isSelf: boolean;
		archived: boolean;
		/** Opens the story card's own form, wherever the reader is. */
		logContact: () => void;
		/** Opens the moment composer at the top of the story card, and brings the reader there. */
		writeMoment: () => void;
		/** Opens "How are we connected?" on the relationships card. */
		tracePath: () => void;
	} = $props();

	const t = useTranslate();

	/*
	 * *Write a moment* opens the composer on this page (docs/05 §5.5). It stays a link to the
	 * journal page underneath: without JavaScript, or opened in a new tab, it still leads
	 * somewhere a moment can be written.
	 */
	function writeInPlace(event: MouseEvent) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		event.preventDefault();
		writeMoment();
	}
	const c = $derived(data.contact);

	/** The viewer's day, for the age beside a birthday and the years since a date. */
	const today = new Date().toLocaleDateString('en-CA');

	// Something on its way out (docs/02 §2.23) is gone from the facts while its undo window is open.
	const removals = useRemovals();
	const dates = $derived(data.dates.filter((d) => !removals.isPending(removalKey('date', d.id))));
	const fields = $derived(
		data.fields.filter((f) => !removals.isPending(removalKey('field', f.id)))
	);
	const circles = $derived(
		data.circles.filter((m) => !removals.isPending(removalKey('membership', m.membershipId)))
	);

	/*
	 * Circles joined while Stella was out of reach: kept on the device and shown as dashed chips
	 * beside the real ones until they are sent (docs/02 §2.18).
	 */
	const keptCircles = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'circle.join'> =>
				isKept(item, 'circle.join') && item.command.payload.contactId === c.id
		)
	);

	const birthday = $derived(
		birthdayFact(
			{
				derivedBirthday: data.derivedBirthday,
				estimatedBirthYear: data.estimatedBirthYear,
				dates
			},
			today
		)
	);
	const otherDates = $derived(otherDateFacts(dates, today));
	const addresses = $derived(addressLines(fields));
	// The addresses they share with others (docs/02 §2.2), read beside their own.
	const homes = $derived(homesShown(data.homes, c.id, removals.isPending));
	/** "Teacher at Primarschule Muri" (docs/02 §2.2). */
	const jobLine = $derived(jobShortForm(c, (parts) => t('contact.job.at', parts)));

	/*
	 * What this visit to the page has already listed, whether the quiet button was pressed, and
	 * which fact is being edited. All belong to one person: following a link to somebody else
	 * keeps this component, and must not bring the last person's slots or open editor along.
	 */
	let visit = $state<{
		id: string;
		revealed: boolean;
		kept: Fillable[];
		editing: EditedFact | null;
	}>({
		id: untrack(() => data.contact.id),
		revealed: false,
		kept: [],
		editing: null
	});
	const current = $derived(
		visit.id === c.id ? visit : { id: c.id, revealed: false, kept: [], editing: null }
	);
	const layout = $derived(
		identityLayout(
			{
				birthday: birthday !== null,
				otherDates: otherDates.length > 0,
				address: addresses.length > 0 || homes.length > 0,
				job: jobLine !== null,
				lastContact: data.lastContactedAt !== null,
				circles: circles.length > 0 || keptCircles.length > 0,
				contact: fields.some((f) => f.kind !== 'address'),
				tags: data.tags.length > 0
			},
			{
				revealed: current.revealed,
				kept: current.kept,
				editingDates: current.editing === 'dates'
			}
		)
	);
	// What was listed stays listed for the visit, so emptying it does not make it vanish.
	$effect(() => {
		const added = layout.listed.filter((name) => !current.kept.includes(name));
		if (added.length > 0 || visit.id !== c.id)
			visit = { ...current, kept: [...current.kept, ...added] };
	});

	let facts = $state<HTMLElement>();
	/** Where the cursor goes for each thing the quiet button names, once it is on the card. */
	const REVEALED_TARGET: Record<Missing, string> = {
		address: '[data-fact="address"] button',
		birthday: '[data-fact="birthday"] button',
		job: '[data-fact="job"] button',
		circles: '[data-fact="circles"] button',
		phone: '[data-identity-row="contact"] button',
		email: '[data-identity-row="contact"] button',
		tags: '[data-identity-row="tags"] button'
	};
	async function revealRows() {
		const first = layout.behindAddMore[0];
		visit = { ...current, revealed: true };
		await tick();
		// The cursor follows the button it pressed, to the first thing that just appeared.
		if (first) facts?.parentElement?.querySelector<HTMLElement>(REVEALED_TARGET[first])?.focus();
	}

	function openEditor(name: EditedFact) {
		visit = { ...current, editing: name };
	}
	/** Closes the open editor and hands the cursor back to the fact it was opened from. */
	async function closeEditor() {
		const was = current.editing;
		visit = { ...current, editing: null };
		await tick();
		const active = document.activeElement;
		if (was && (active === null || active === document.body))
			facts?.querySelector<HTMLElement>(`[data-edit="${was}"]`)?.focus();
	}

	const menu = $derived(
		recordMenu({ isAdmin: data.isAdmin, archived, isSelf, canTracePath: otherContacts.length > 0 })
	);
	/**
	 * The confirm step the menu opened; `?merge=` opens merging (docs/02 §2.2.4.4), and so does a
	 * merge the server refused, to say why.
	 */
	let panel = $state<'archive' | 'merge' | 'delete' | null>(
		untrack(() =>
			initialPanel(refusedMergeOf(form) ?? page.url.searchParams.get('merge'), data.isAdmin)
		)
	);
	/*
	 * This component outlives any one person: following a link from their page to somebody
	 * else's keeps it mounted, with only `data` changing underneath. Without this, a step left
	 * open (Archive, Merge, Delete) would follow the reader to the next person's page too.
	 */
	let panelContactId = untrack(() => c.id);
	$effect(() => {
		if (c.id === panelContactId) return;
		panelContactId = c.id;
		panel = initialPanel(refusedMergeOf(form) ?? page.url.searchParams.get('merge'), data.isAdmin);
	});
</script>

<section
	class="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-4 gap-y-4 rounded-app bg-card p-4 shadow-card md:grid-cols-[168px_minmax(0,1fr)_auto] md:items-start md:gap-x-7 md:gap-y-5 md:p-6"
	data-testid="identity-card"
>
	<div class="md:row-span-2">
		<AvatarUploader
			contactId={c.id}
			name={c.displayName}
			avatarPhotoId={c.avatarPhotoId}
			portrait
			groupPhotos={data.groupPhotosToCut}
			immich={reachability.reachable ? data.immich : null}
			immichSearchName={[c.firstName, c.lastName].filter(Boolean).join(' ') || c.displayName}
		/>
	</div>

	<div class="min-w-0">
		<!-- Name and description are edited where they are read (docs/02 §2.2). -->
		<NameEditor
			name={c}
			gender={c.gender}
			shownNameChosen={data.shownNameChosen}
			error={form?.namePartsError ?? null}
		/>
		<!-- An earlier name, neutral on purpose: a maiden name and any other alike (docs/02 §2.2). -->
		{#if c.formerName}
			<p class="text-sm text-fg-muted" data-testid="former-name">
				{t('contact.formerly', { name: c.formerName })}
			</p>
		{/if}
		<!-- Stella's proposal for a missing last name, and passing a new one on. -->
		<LastNameHelp {data} />
		<p class="text-fg-muted max-md:text-sm">
			<InlineEdit
				action="?/editProfile"
				name="description"
				value={c.description ?? ''}
				label={t('contact.editDescription')}
				placeholder={t('contact.descriptionPlaceholder')}
				empty={t('contact.addDescription')}
				clamp
			/>
		</p>
		{#if isSelf || c.visibility === 'private' || archived}
			<IdentityMarkers
				{isSelf}
				isPrivate={c.visibility === 'private'}
				{archived}
				archivedAt={c.archivedAt}
			/>
		{/if}
		<FormError message={form?.avatarError} variant="inline" size="xs" class="mt-1" />
	</div>

	<!-- The one thing to do here, and the rest behind ⋯ (docs/05 §5.5). -->
	<div class="col-span-2 flex items-center gap-2 md:col-span-1" data-testid="identity-actions">
		<Button
			variant="primary"
			icon="journal"
			href="/contacts/{c.id}/journal"
			onclick={writeInPlace}
			class="flex-1 md:flex-none"
		>
			{t('contact.write')}
		</Button>
		<IdentityMenu
			entries={menu}
			contactId={c.id}
			{logContact}
			{tracePath}
			openPanel={(next) => (panel = next)}
		/>
	</div>

	<div class="col-span-2 flex min-w-0 flex-col gap-4 md:col-start-2">
		<RecordActions {data} {form} {otherContacts} {archived} bind:panel />

		<IdentityFacts
			bind:element={facts}
			{data}
			{form}
			facts={layout.facts}
			editing={current.editing}
			{birthday}
			{otherDates}
			{addresses}
			{homes}
			{jobLine}
			{circles}
			{keptCircles}
			onOpen={openEditor}
			onClose={closeEditor}
		/>

		<IdentityRows {data} {form} rows={layout.rows} {metLine} />
		{#if layout.behindAddMore.length > 0}
			<div class="-ml-2.5" transition:reveal>
				<Button
					variant="ghost"
					size="sm"
					icon="add"
					type="button"
					onclick={revealRows}
					data-testid="identity-add-more"
				>
					{addMoreLabel(layout.behindAddMore, t)}
				</Button>
			</div>
		{/if}
	</div>
</section>
