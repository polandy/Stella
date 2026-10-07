<script lang="ts">
	import { reveal } from '$lib/motion/motion.svelte';
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';
	import Button from '$lib/components/Button.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import InlineEdit from '$lib/components/InlineEdit.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { page } from '$app/state';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { accentDotStyle } from '$lib/design/tokens';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
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
	import { hasMessage } from '$lib/i18n/translate';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import KeptChip from '$lib/components/KeptChip.svelte';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { jobErrorFor, jobShortForm } from '$lib/people/job';
	import { tick, untrack, type Snippet } from 'svelte';
	import type { IconName } from '$lib/components/icons';
	import AddressEditor from './AddressEditor.svelte';
	import CirclesEditor from './CirclesEditor.svelte';
	import ContactFieldsRow from './ContactFieldsRow.svelte';
	import DatesEditor from './DatesEditor.svelte';
	import JobEdit from './JobEdit.svelte';
	import LastNameHelp from './LastNameHelp.svelte';
	import NameEditor from './NameEditor.svelte';
	import RecordActions from './RecordActions.svelte';
	import TagsRow from './TagsRow.svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * The top of a person's page (docs/05 §5.5): who this is. Portrait, name and description, a
	 * few labelled facts — only what the record holds, each edited where it is read — and below
	 * them the rows that have no fact (*Contact*, *Tags*, *How we met*). What the record does not
	 * hold yet waits behind one quiet button that names it. One thing to do here (write a
	 * moment); everything else is in the ⋯ menu. Which facts, slots and rows show is decided in
	 * `identity-card.ts`; this only renders it.
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

	const i18n = useI18n();
	const t = i18n.t;

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
	/** "Teacher at Primarschule Muri" (docs/02 §2.2). */
	const jobLine = $derived(jobShortForm(c, (parts) => t('contact.job.at', parts)));
	/** The day it happened, for the marker's tooltip. */
	const archivedOn = $derived(
		c.archivedAt === null
			? null
			: dayLabel(i18n, new Date(c.archivedAt).toLocaleDateString('en-CA'))
	);
	/** A stored date kind in the viewer's language. */
	const dateKindLabel = (kind: string): string => {
		const key = `contact.dateKind.${kind}`;
		return hasMessage(key) ? t(key) : kind;
	};

	/*
	 * What this visit to the page has already listed, whether the quiet button was pressed, and
	 * which fact is being edited. All belong to one person: following a link to somebody else
	 * keeps this component, and must not bring the last person's slots or open editor along.
	 */
	type EditedFact = 'dates' | 'address' | 'circles';
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
				address: addresses.length > 0,
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
	/** Where the dates' editor opens: in place of the first date the card states. */
	const firstDateFact = $derived(
		layout.facts.find((f) => f.name === 'birthday' || f.name === 'dates')?.name
	);
	// What was listed stays listed for the visit, so emptying it does not make it vanish.
	$effect(() => {
		const added = layout.listed.filter((name) => !current.kept.includes(name));
		if (added.length > 0 || visit.id !== c.id)
			visit = { ...current, kept: [...current.kept, ...added] };
	});

	let facts = $state<HTMLElement>();
	let rowList = $state<HTMLDivElement>();
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
	/** The confirm step the menu opened; `?merge=` opens merging (docs/concepts/surnames.md §5). */
	let panel = $state<'archive' | 'merge' | 'delete' | null>(
		untrack(() => initialPanel(page.url.searchParams.get('merge'), data.isAdmin))
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
		panel = initialPanel(page.url.searchParams.get('merge'), data.isAdmin);
	});

	const ITEM_SHAPE =
		'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm hover:bg-primary-soft focus-visible:bg-primary-soft';
	const ITEM = `${ITEM_SHAPE} text-fg`;
	/** The one that cannot be undone, in the danger colour. */
	const DANGER_ITEM = `${ITEM_SHAPE} text-danger`;
</script>

<!--
	One fact of the grid: a small label over its value. An editable one is a button the size of
	the whole cell (its ::after spans it), named by what it does and then by what it says.
-->
{#snippet fact(
	label: string,
	icon: IconName,
	name: string,
	value: Snippet,
	edit?: { what: string; open: () => void; key: string }
)}
	<div
		class="relative -mx-1.5 flex min-w-0 flex-col gap-0.5 rounded-control px-1.5 py-0.5 has-[button:hover]:bg-card-hover"
		data-fact={name}
	>
		<dt class="flex items-center gap-1.5 text-xs text-fg-subtle">
			<Icon name={icon} size={12} />{label}
		</dt>
		<dd class="min-w-0 text-sm [overflow-wrap:anywhere] text-fg">
			{#if edit}
				<button
					type="button"
					class="text-left after:absolute after:inset-0 after:rounded-control"
					title={edit.what}
					data-edit={edit.key}
					onclick={edit.open}
				>
					<span class="sr-only">{edit.what}: </span>{@render value()}
				</button>
			{:else}
				{@render value()}
			{/if}
		</dd>
	</div>
{/snippet}

<!-- A fact the record does not hold yet, once the quiet button was pressed: a dashed slot. -->
{#snippet slot(label: string, icon: IconName, name: Missing, open: () => void, key: string)}
	<div
		class="relative flex min-w-0 flex-col gap-0.5 rounded-control border border-dashed border-border px-2 py-1.5 has-[button:hover]:bg-card-hover"
		data-fact={name}
		data-slot
	>
		<dt class="flex items-center gap-1.5 text-xs text-fg-subtle">
			<Icon name={icon} size={12} />{label}
		</dt>
		<dd class="text-sm text-fg-subtle">
			<button
				type="button"
				class="inline-flex items-center gap-1 after:absolute after:inset-0 after:rounded-control"
				aria-label={t('contact.identity.addThings', {
					things: t(`contact.identity.missing.${name}`)
				})}
				data-edit={key}
				onclick={open}
			>
				<Icon name="add" size={14} />{t('common.add')}
			</button>
		</dd>
	</div>
{/snippet}

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
			/>
		</p>
		{#if isSelf || c.visibility === 'private' || archived}
			<div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
				{#if isSelf}
					<span
						data-testid="self-marker"
						class="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-primary"
						title={t('contact.self.badgeHint')}
					>
						<Icon name="self" size={11} />{t('common.you')}
					</span>
				{/if}
				{#if c.visibility === 'private'}
					<span class="inline-flex items-center gap-1" title={t('contact.privateContact')}>
						<Icon name="private" size={11} />{t('contact.private')}
					</span>
				{/if}
				{#if archived}
					<span
						data-testid="archived-marker"
						class="inline-flex items-center gap-1 rounded-full bg-bg-sunken px-2 py-0.5 text-fg-muted"
						title={t('contact.archivedOn', { day: archivedOn ?? '' })}
					>
						<Icon name="archive" size={11} />{t('contact.archived')}
					</span>
				{/if}
			</div>
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
		<MenuButton label={t('contact.menu.label')} align="end" look="button">
			{#snippet trigger()}<Icon name="more" size={18} />{/snippet}
			{#snippet children({ close })}
				{#each menu as entry, index (index)}
					{#if entry === 'divider'}
						<hr class="my-1 border-border-subtle" />
					{:else if entry === 'logContact'}
						<button
							type="button"
							role="menuitem"
							class={ITEM}
							onclick={() => (close(), logContact())}
						>
							<Icon name="met" size={14} />{t('contact.logContact')}
						</button>
					{:else if entry === 'thisIsMe' || entry === 'notMe'}
						<!-- Which of these people you are (docs/02 §2.1.3); the same item lets go again. -->
						<form method="POST" action="?/setSelf" class="contents">
							<button
								type="submit"
								role="menuitem"
								class={ITEM}
								title={entry === 'notMe' ? t('contact.self.isMeHint') : t('contact.self.hint')}
							>
								<Icon name="self" size={14} />{entry === 'notMe'
									? t('contact.self.notMe')
									: t('contact.self.thisIsMe')}
							</button>
						</form>
					{:else if entry === 'tracePath'}
						<button
							type="button"
							role="menuitem"
							class={ITEM}
							onclick={() => (close(), tracePath())}
						>
							<Icon name="connectionPath" size={14} />{t('contact.relationships.howConnected')}
						</button>
					{:else if entry === 'archive' || entry === 'restore'}
						<button
							type="button"
							role="menuitem"
							class={ITEM}
							onclick={() => (close(), (panel = 'archive'))}
						>
							<Icon name="archive" size={14} />{entry === 'restore'
								? t('contact.archive.bringBack')
								: t('contact.menu.archive')}
						</button>
					{:else if entry === 'merge'}
						<button
							type="button"
							role="menuitem"
							class={ITEM}
							onclick={() => (close(), (panel = 'merge'))}
						>
							<Icon name="people" size={14} />{t('contact.merge.open')}
						</button>
					{:else if entry === 'delete'}
						<button
							type="button"
							role="menuitem"
							class={DANGER_ITEM}
							onclick={() => (close(), (panel = 'delete'))}
						>
							<Icon name="remove" size={14} />{t('contact.delete.open')}
						</button>
					{/if}
				{/each}
			{/snippet}
		</MenuButton>
	</div>

	<div class="col-span-2 flex min-w-0 flex-col gap-4 md:col-start-2">
		<RecordActions {data} {form} {otherContacts} {archived} bind:panel />

		<!-- The facts one looks up, only those the record holds, each edited in place (docs/05 §5.5). -->
		<dl
			bind:this={facts}
			class="grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-4"
			data-testid="identity-facts"
		>
			{#each layout.facts as entry (entry.name)}
				{#if (entry.name === 'birthday' || entry.name === 'dates') && current.editing === 'dates'}
					{#if entry.name === firstDateFact}
						<div class="col-span-full" transition:reveal>
							<DatesEditor {data} {form} onclose={closeEditor} />
						</div>
					{/if}
				{:else if entry.name === 'birthday'}
					{#if entry.slot || !birthday}
						{@render slot(
							t('contact.facts.birthday'),
							'gift',
							'birthday',
							() => openEditor('dates'),
							'dates'
						)}
					{:else}
						{#snippet birthdayValue()}
							{#if birthday?.kind === 'day'}
								{dayLabel(i18n, birthday.date)}
								{#if birthday.age !== null}<span class="text-fg-subtle">
										· {t('contact.facts.age', { age: birthday.age })}</span
									>{/if}
							{:else if birthday?.kind === 'around'}
								{t('contact.around', { year: birthday.year })}
							{/if}
						{/snippet}
						{@render fact(
							birthday.kind === 'day' ? t('contact.facts.birthday') : t('contact.facts.born'),
							'gift',
							'birthday',
							birthdayValue,
							{ what: t('contact.facts.editDates'), open: () => openEditor('dates'), key: 'dates' }
						)}
					{/if}
				{:else if entry.name === 'dates'}
					<!-- Every other date is its own fact, beside the birthday (docs/02 §2.13). -->
					{#each otherDates as date (date.id)}
						{#snippet dateValue()}
							{dayLabel(i18n, date.date)}
							{#if date.years !== null}<span class="text-fg-subtle">
									· {t('contact.facts.age', { age: date.years })}</span
								>{/if}
						{/snippet}
						{@render fact(
							date.label ?? dateKindLabel(date.kind),
							'calendar',
							`date-${date.id}`,
							dateValue,
							{ what: t('contact.facts.editDates'), open: () => openEditor('dates'), key: 'dates' }
						)}
					{/each}
				{:else if entry.name === 'address'}
					{#if current.editing === 'address'}
						<div class="col-span-full" transition:reveal>
							<AddressEditor {data} {form} onclose={closeEditor} />
						</div>
					{:else if entry.slot}
						{@render slot(
							t('contact.fieldKind.address'),
							'home',
							'address',
							() => openEditor('address'),
							'address'
						)}
					{:else}
						{#snippet addressValue()}
							{#each addresses as address (address.id)}
								<span class="block">{address.line}</span>
							{/each}
						{/snippet}
						{@render fact(t('contact.fieldKind.address'), 'home', 'address', addressValue, {
							what: t('contact.facts.editAddress'),
							open: () => openEditor('address'),
							key: 'address'
						})}
					{/if}
				{:else if entry.name === 'job'}
					<!-- Edited where it is read, like the name (docs/02 §2.2); empty, a slot opens it. -->
					<div
						class="relative flex min-w-0 flex-col gap-0.5 rounded-control has-[[data-pane=on]:not([inert])_form]:col-span-full {entry.slot
							? 'border border-dashed border-border px-2 py-1.5'
							: '-mx-1.5 px-1.5 py-0.5'} has-[button:hover]:bg-card-hover"
						data-fact="job"
						data-slot={entry.slot ? '' : undefined}
					>
						<dt class="flex items-center gap-1.5 text-xs text-fg-subtle">
							<Icon name="work" size={12} />{t('contact.job')}
						</dt>
						<dd class="min-w-0 text-sm [overflow-wrap:anywhere] text-fg">
							<JobEdit
								jobTitle={c.jobTitle}
								company={c.company}
								place={entry.slot ? 'profile' : 'header'}
								error={jobErrorFor(entry.slot ? 'profile' : 'header', form)}
								formClass="mt-1 rounded-control border border-primary bg-card p-3"
								triggerTitle={t('contact.job.edit')}
								triggerClass="max-w-full text-left after:absolute after:inset-0 after:rounded-control"
							>
								{#if entry.slot}
									<span class="sr-only"
										>{t('contact.identity.addThings', {
											things: t('contact.identity.missing.job')
										})}</span
									><span class="inline-flex items-center gap-1 text-fg-subtle" aria-hidden="true"
										><Icon name="add" size={14} />{t('common.add')}</span
									>
								{:else}
									<span class="sr-only">{t('contact.job.edit')}: </span><span
										class="[overflow-wrap:anywhere]"
										data-testid="person-job">{jobLine}</span
									>
								{/if}
							</JobEdit>
						</dd>
					</div>
				{:else if entry.name === 'lastContact' && data.lastContactedAt}
					<!-- Follows the Activity card, so it is read here and never edited (C5). -->
					{#snippet lastContactValue()}
						<span data-testid="last-contacted">
							<time datetime={data.lastContactedAt}
								>{dayLabel(i18n, data.lastContactedAt ?? '')}</time
							>
						</span>
					{/snippet}
					{@render fact(t('contact.lastContact'), 'met', 'last-contact', lastContactValue)}
				{:else if entry.name === 'circles'}
					<div class="col-span-full flex min-w-0 flex-col gap-1" data-fact="circles">
						<dt class="flex items-center gap-1.5 text-xs text-fg-subtle">
							<Icon name="circles" size={12} />{t('contact.section.circles')}
						</dt>
						<dd>
							<ul class="flex flex-wrap gap-1.5">
								{#each keptCircles as item (item.command.id)}
									<KeptChip
										{item}
										label={item.command.payload.role
											? `${item.command.payload.circleName} · ${item.command.payload.role}`
											: item.command.payload.circleName}
									/>
								{/each}
								{#each circles as circle (circle.membershipId)}
									<li class="max-w-full min-w-0">
										<a
											href="/circles/{circle.circleId}"
											class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-sm text-fg transition-colors hover:bg-card-hover"
										>
											<span
												class="size-2 shrink-0 rounded-full"
												style={accentDotStyle(circle.color)}
											></span>
											<span class="truncate">{circle.name}</span>
											{#if circle.role}<span class="shrink-0 text-xs text-fg-subtle"
													>· {circle.role}</span
												>{/if}
										</a>
									</li>
								{/each}
								<li>
									<!-- Joining, a role, leaving: all in the editor this opens under the chips. -->
									<button
										type="button"
										class="inline-flex min-h-6 items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-sm text-fg-muted transition-colors hover:bg-card-hover"
										aria-label={t('contact.circles.join')}
										aria-expanded={current.editing === 'circles'}
										title={t('contact.circles.join')}
										data-edit="circles"
										onclick={() =>
											current.editing === 'circles' ? closeEditor() : openEditor('circles')}
									>
										<Icon name="add" size={13} />{#if entry.slot}{t('contact.join')}{/if}
									</button>
								</li>
							</ul>
							{#if current.editing === 'circles'}
								<div transition:reveal>
									<CirclesEditor {data} {form} onclose={closeEditor} />
								</div>
							{/if}
						</dd>
					</div>
				{/if}
			{/each}
		</dl>

		<!--
			The rows that have no fact: the ways to reach someone but their address, the tags, and
			how we met. An empty one waits behind the quiet button with the empty facts.
		-->
		{#if layout.rows.length > 0 || metLine}
			<div bind:this={rowList} class="identity-rows grid gap-x-8" transition:reveal>
				{#each layout.rows as row (row)}
					<!-- Rows the quiet button brings unfold in place (docs/05 §5.11). -->
					<div data-identity-row={row} class="min-w-0" transition:reveal>
						{#if row === 'contact'}
							<ContactFieldsRow {data} {form} />
						{:else if row === 'tags'}
							<TagsRow {data} {form} />
						{/if}
					</div>
				{/each}
				{#if metLine}
					<div class="min-w-0">
						<Section as="row" title={t('contact.section.howWeMet')} startOpen>
							<p class="font-serif text-[15px] leading-relaxed text-fg">{metLine}</p>
						</Section>
					</div>
				{/if}
			</div>
		{/if}
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

<style>
	/*
	 * Each row draws the line above itself and the first one does not. Wrapped in a cell, every
	 * row is its cell's first: the line is drawn here instead, between cells — and from `md`,
	 * where the rows stand two abreast, not above the second column's first row either.
	 */
	.identity-rows > :global(*) > :global(*) {
		border-top-width: 0;
	}
	.identity-rows > :global(* + *) {
		border-top: 1px solid var(--border-subtle);
	}
	@media (width >= 48rem) {
		.identity-rows > :global(:nth-child(2)) {
			border-top-width: 0;
		}
	}

	/*
	 * Each row is a line and its actions (Section's `as="row"`). The rows share their columns
	 * through subgrid, so the actions of every row in a column start at one edge and their "+"
	 * icons stand one above the other, whatever each label's length — "Hinzufügen" over
	 * "Beitreten" no longer leaves the two icons a few pixels apart. A row that is not a
	 * Section (job, gender) spans the pair.
	 */
	.identity-rows {
		grid-template-columns: minmax(0, 1fr) auto;
	}
	@media (width >= 48rem) {
		.identity-rows {
			grid-template-columns: repeat(2, minmax(0, 1fr) auto);
		}
	}
	.identity-rows > :global(*) {
		display: grid;
		grid-column: span 2;
		grid-template-columns: subgrid;
		column-gap: 0.5rem;
		/* A neighbour's open form makes the grid row tall; this row stays at its top. */
		align-content: start;
	}
	.identity-rows > :global(*) > :global(*) {
		grid-column: 1 / -1;
	}
	.identity-rows > :global(*) > :global(section[data-row]) {
		grid-template-columns: subgrid;
	}
</style>
