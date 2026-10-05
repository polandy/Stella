<script lang="ts">
	import { reveal } from '$lib/motion/motion.svelte';
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';
	import Button from '$lib/components/Button.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import GenderRow from '$lib/components/GenderRow.svelte';
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
		addressLine,
		birthdayFact,
		initialPanel,
		profileRows,
		recordMenu,
		type ProfileRow
	} from '$lib/people/identity-card';
	import { jobErrorFor, jobShortForm } from '$lib/people/job';
	import { tick, untrack, type Snippet } from 'svelte';
	import type { IconName } from '$lib/components/icons';
	import CirclesRow from './CirclesRow.svelte';
	import ContactFieldsRow from './ContactFieldsRow.svelte';
	import ImportantDatesRow from './ImportantDatesRow.svelte';
	import JobEdit from './JobEdit.svelte';
	import JobRow from './JobRow.svelte';
	import LastNameHelp from './LastNameHelp.svelte';
	import NameEditor from './NameEditor.svelte';
	import RecordActions from './RecordActions.svelte';
	import TagsRow from './TagsRow.svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * The top of a person's page (docs/05 §5.5): who this is. Portrait, name and description, a
	 * few labelled facts — only what the record holds — and the editable rows that hold
	 * something; the empty ones wait behind one quiet button. One thing to do here (write in
	 * their journal); everything else is in the ⋯ menu.
	 */
	let {
		data,
		form,
		otherContacts,
		metLine,
		isSelf,
		archived,
		logContact,
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
		/** Opens "How are we connected?" on the relationships card. */
		tracePath: () => void;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);

	/** The viewer's day, for the age beside a birthday. */
	const today = new Date().toLocaleDateString('en-CA');
	const birthday = $derived(
		birthdayFact(
			{ derivedBirthday: data.derivedBirthday, estimatedBirthYear: data.estimatedBirthYear, dates: data.dates },
			today
		)
	);
	const address = $derived(addressLine(data.fields));
	/** "Teacher at Primarschule Muri" (docs/02 §2.2). */
	const jobLine = $derived(jobShortForm(c, (parts) => t('contact.job.at', parts)));
	/** The day it happened, for the marker's tooltip. */
	const archivedOn = $derived(
		c.archivedAt === null ? null : dayLabel(i18n, new Date(c.archivedAt).toLocaleDateString('en-CA'))
	);

	/*
	 * What this visit to the page has already listed, and whether the quiet button was pressed.
	 * Both belong to one person: following a link to somebody else keeps this component, and
	 * must not bring the last person's rows along.
	 */
	let visit = $state<{ id: string; revealed: boolean; kept: ProfileRow[] }>({
		id: untrack(() => data.contact.id),
		revealed: false,
		kept: []
	});
	const current = $derived(visit.id === c.id ? visit : { id: c.id, revealed: false, kept: [] });
	const rows = $derived(
		profileRows(
			{
				contact: data.fields.length > 0,
				tags: data.tags.length > 0,
				job: jobLine !== null,
				dates: data.dates.length > 0 || birthday !== null,
				circles: data.circles.length > 0,
				gender: c.gender !== null
			},
			{ revealed: current.revealed, kept: current.kept }
		)
	);
	// A row once listed stays listed for the visit, so emptying it does not make it vanish.
	$effect(() => {
		const added = rows.listed.filter((row) => !current.kept.includes(row));
		if (added.length > 0 || visit.id !== c.id) visit = { ...current, kept: [...current.kept, ...added] };
	});
	let rowList = $state<HTMLDivElement>();
	async function revealRows() {
		const first = rows.behindAddMore[0];
		visit = { ...current, revealed: true };
		await tick();
		// The cursor follows the button it pressed, to the first row that just appeared.
		rowList?.querySelector<HTMLElement>(`[data-identity-row="${first}"] button`)?.focus();
	}

	const menu = $derived(recordMenu({ isAdmin: data.isAdmin, archived, isSelf, canTracePath: otherContacts.length > 0 }));
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

<!-- One fact of the grid: a small label over its value. -->
{#snippet fact(label: string, icon: IconName, name: string, value: Snippet)}
	<div class="flex min-w-0 flex-col gap-0.5 has-[[data-pane=on]:not([inert])_form]:col-span-full" data-fact={name}>
		<dt class="flex items-center gap-1.5 text-xs text-fg-subtle"><Icon name={icon} size={12} />{label}</dt>
		<dd class="min-w-0 text-sm text-fg [overflow-wrap:anywhere]">{@render value()}</dd>
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
		<NameEditor name={c} shownNameChosen={data.shownNameChosen} error={form?.namePartsError ?? null} />
		<!-- An earlier name, neutral on purpose: a maiden name and any other alike (docs/02 §2.2). -->
		{#if c.formerName}
			<p class="text-sm text-fg-muted" data-testid="former-name">{t('contact.formerly', { name: c.formerName })}</p>
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
		<Button variant="primary" icon="journal" href="/contacts/{c.id}/journal" class="flex-1 md:flex-none">
			{t('contact.write')}
		</Button>
		<MenuButton label={t('contact.menu.label')} align="end" look="button">
			{#snippet trigger()}<Icon name="more" size={18} />{/snippet}
			{#snippet children({ close })}
				{#each menu as entry, index (index)}
					{#if entry === 'divider'}
						<hr class="my-1 border-border-subtle" />
					{:else if entry === 'logContact'}
						<button type="button" role="menuitem" class={ITEM} onclick={() => (close(), logContact())}>
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
								<Icon name="self" size={14} />{entry === 'notMe' ? t('contact.self.notMe') : t('contact.self.thisIsMe')}
							</button>
						</form>
					{:else if entry === 'tracePath'}
						<button type="button" role="menuitem" class={ITEM} onclick={() => (close(), tracePath())}>
							<Icon name="connectionPath" size={14} />{t('contact.relationships.howConnected')}
						</button>
					{:else if entry === 'archive' || entry === 'restore'}
						<button type="button" role="menuitem" class={ITEM} onclick={() => (close(), (panel = 'archive'))}>
							<Icon name="archive" size={14} />{entry === 'restore' ? t('contact.archive.bringBack') : t('contact.menu.archive')}
						</button>
					{:else if entry === 'merge'}
						<button type="button" role="menuitem" class={ITEM} onclick={() => (close(), (panel = 'merge'))}>
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

		<!-- The facts one looks up, only those the record holds (docs/05 §5.5). -->
		<dl class="grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-4" data-testid="identity-facts">
			{#if birthday}
				{#snippet birthdayValue()}
					{#if birthday?.kind === 'day'}
						{dayLabel(i18n, birthday.date)}
						{#if birthday.age !== null}<span class="text-fg-subtle"> · {t('contact.facts.age', { age: birthday.age })}</span>{/if}
					{:else if birthday?.kind === 'around'}
						{t('contact.around', { year: birthday.year })}
					{/if}
				{/snippet}
				{@render fact(
					birthday.kind === 'day' ? t('contact.facts.birthday') : t('contact.facts.born'),
					'gift',
					'birthday',
					birthdayValue
				)}
			{/if}
			{#if address}
				{#snippet addressValue()}{address}{/snippet}
				{@render fact(t('contact.fieldKind.address'), 'home', 'address', addressValue)}
			{/if}
			{#if jobLine}
				<!-- Edited where it is read, like the name (docs/02 §2.2); an empty job is a row below. -->
				{#snippet jobValue()}
					<JobEdit
						jobTitle={c.jobTitle}
						company={c.company}
						place="header"
						error={jobErrorFor('header', form)}
						formClass="mt-1 rounded-control border border-primary bg-card p-3"
						triggerTitle={t('contact.job.edit')}
						triggerClass="-mx-1 max-w-full rounded-control px-1 text-left transition-colors hover:bg-card-hover"
					>
						<span class="[overflow-wrap:anywhere]" data-testid="person-job">{jobLine}</span>
					</JobEdit>
				{/snippet}
				{@render fact(t('contact.job'), 'work', 'job', jobValue)}
			{/if}
			{#snippet lastContactValue()}
				{#if data.lastContactedAt}
					<span data-testid="last-contacted">
						<time datetime={data.lastContactedAt}>{dayLabel(i18n, data.lastContactedAt)}</time>
					</span>
				{:else}
					<span data-testid="last-contacted" class="text-fg-subtle">{t('contact.noContactYet')}</span>
				{/if}
			{/snippet}
			{@render fact(t('contact.lastContact'), 'met', 'last-contact', lastContactValue)}
			{#if data.circles.length > 0}
				<div class="col-span-full flex min-w-0 flex-col gap-1" data-fact="circles">
					<dt class="flex items-center gap-1.5 text-xs text-fg-subtle"><Icon name="circles" size={12} />{t('contact.section.circles')}</dt>
					<dd>
						<ul class="flex flex-wrap gap-1.5">
							{#each data.circles as circle (circle.membershipId)}
								<li class="min-w-0 max-w-full">
									<a
										href="/circles/{circle.circleId}"
										class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-sm text-fg transition-colors hover:bg-card-hover"
									>
										<span class="size-2 shrink-0 rounded-full" style={accentDotStyle(circle.color)}></span>
										<span class="truncate">{circle.name}</span>
										{#if circle.role}<span class="shrink-0 text-xs text-fg-subtle">· {circle.role}</span>{/if}
									</a>
								</li>
							{/each}
						</ul>
					</dd>
				</div>
			{/if}
		</dl>

		<!--
			The editable rows the record holds something for; the empty ones wait behind one quiet
			button rather than standing as six invitations. Dates and circles are stated above, so
			their rows start folded — they are here to add to and take away from.
		-->
		{#if rows.listed.length > 0 || metLine}
			<div bind:this={rowList} class="identity-rows grid gap-x-8" transition:reveal>
				{#each rows.listed as row (row)}
					<!-- Rows that *Add phone, email, tags …* brings unfold in place (docs/05 §5.11). -->
					<div data-identity-row={row} class="min-w-0" transition:reveal>
						{#if row === 'contact'}
							<ContactFieldsRow {data} {form} />
						{:else if row === 'tags'}
							<TagsRow {data} {form} />
						{:else if row === 'job'}
							<JobRow jobTitle={c.jobTitle} company={c.company} error={jobErrorFor('profile', form)} />
						{:else if row === 'dates'}
							<ImportantDatesRow {data} {form} folded />
						{:else if row === 'circles'}
							<CirclesRow {data} {form} folded />
						{:else if row === 'gender'}
							<GenderRow gender={c.gender} error={form?.genderError ?? null} />
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
		{#if !current.revealed && rows.behindAddMore.length > 0}
			<div class="-ml-2.5" transition:reveal>
				<Button variant="ghost" size="sm" icon="add" type="button" onclick={revealRows} data-testid="identity-add-more">
					{t('contact.identity.addMore')}
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
