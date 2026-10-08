<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import Section from '$lib/components/Section.svelte';
	import { sectionAnchor } from '$lib/people/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { exclusionFor, type Exclusion } from '$lib/relationships/exclusions';
	import type { RelationshipCategory } from '$lib/relationships/categories';
	import { relationshipTypeLabel } from '$lib/relationships/labels';
	import {
		foldPeople,
		groupPeople,
		WORKED_OUT,
		type HiddenGroup
	} from '$lib/relationships/people-groups';
	import { otherEndRole } from '$lib/relationships/roles';
	import { relationshipTypeOptions } from '$lib/relationships/type-options';
	import type { SelectablePerson } from '$lib/people/select';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import { tick, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { glide, reveal, scrollToShow, showOpenedForm } from '$lib/motion/motion.svelte';
	import { scrollBehavior } from '$lib/motion/motion';
	import AddRelationshipForm from './AddRelationshipForm.svelte';
	import KinPanels from './KinPanels.svelte';
	import PeopleMap from './PeopleMap.svelte';
	import RelationshipList from './RelationshipList.svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * Who someone is connected to (docs/02 §2.4): the person page's first card. It holds the
	 * add form's state, so what was being entered outlives closing the form, as it did when the
	 * page held it; the map and list, the worked-out kin and the form itself are its children.
	 *
	 * Its header is three quiet controls (docs/05 §5.5): *Edit*, which puts the corrections on
	 * every row at once, `+` for a new link, and a ⋯ for what is asked less often — how two
	 * people are connected, the on-demand review, the whole graph.
	 */
	let {
		data,
		form,
		otherContacts,
		showTogether,
		tracingPath = $bindable(false)
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Candidate targets for a new relationship: everyone visible but this person. */
		otherContacts: PersonPageData['people'];
		/** A row's *Together*: the Photos card shows this person's photos with the one named. */
		showTogether: (contactId: string) => void;
		/** Whether "How are we connected?" is asking who; the identity card's ⋯ menu opens it too. */
		tracingPath?: boolean;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);

	let relateOpen = $state(untrack(() => data.relateTo) !== null);
	/** The card's edit mode: *Edit* and remove on every row, *Confirm* on every worked-out one. */
	let editing = $state(false);
	/** The list and the worked-out relatives unfolded, by the card's one *Show more*. */
	let expanded = $state(false);

	// A link to someone else's page is the same route; their card opens quiet, like any other.
	// A primitive, so a reload of this same person's data (a save) is not read as a new person.
	const contactId = $derived(c.id);
	$effect(() => {
		void contactId;
		editing = false;
		expanded = false;
	});

	// A row on its way out (docs/02 §2.23) is gone from the list while its undo window is open,
	// and back in it the moment Undo is pressed. The counts follow, so a section never says two
	// tags over one chip.
	const removals = useRemovals();
	const shown = <T extends { id: string }>(kind: RemovalKind, rows: T[]) =>
		rows.filter((row) => !removals.isPending(removalKey(kind, row.id)));
	const visibleRelationships = $derived(shown('relationship', data.relationships));
	/*
	 * A link added during the visit unfolds the card: somebody just entered must not land behind
	 * *Show more*, where adding them would look like it did nothing. Counted per person, so
	 * opening someone with more links is not mistaken for an addition.
	 */
	let seenLinks = { contactId: '', count: 0 };
	$effect(() => {
		const id = contactId;
		const count = visibleRelationships.length;
		if (seenLinks.contactId === id && count > seenLinks.count) expanded = true;
		seenLinks = { contactId: id, count };
	});
	/*
	 * What the fold leaves out, entered or worked out, and the groups it hides whole — the same
	 * pure fold the list cuts its rows by (docs/05 §5.5). Edit mode unfolds it: a row that cannot
	 * be seen cannot be corrected.
	 */
	const unfolded = $derived(expanded || editing);
	const fold = $derived(
		foldPeople(
			groupPeople(visibleRelationships.map((rel) => ({ ...rel, role: otherEndRole(rel) }))),
			data.derivedKin.length,
			unfolded
		)
	);
	const hiddenGroupLabel = (hidden: HiddenGroup) =>
		hidden.group === WORKED_OUT
			? t('contact.relationships.derivedShort')
			: t(`contact.relationships.group.${hidden.group}`);

	// Relationships keep their own open state: the quick-add flow opens that section by URL.
	/*
	 * The other end of a new relationship. Empty unless the page was *asked* to relate somebody
	 * (`?relate=`, the stream's link hint — §2.22.1). Nothing else stands in the field: a name
	 * already sitting there is read as an answer, not as an offer, and the one it used to
	 * offer — your own person — is wrong at least as often as it is right.
	 */
	let relationshipTargetId = $state<string[]>(
		untrack(() => (data.relateTo ? [data.relateTo] : []))
	);
	function closeRelate() {
		relateOpen = false;
		relationshipTargetId = [];
	}
	/*
	 * The specifics of the link being entered, watched so the form can fill in what it already
	 * knows: a family link began on the younger one's birthday (docs/02 §2.4).
	 */
	const relationshipChoices = $derived(relationshipTypeOptions(data.relationshipTypes));
	/*
	 * Links entered here while Stella was out of reach, kept until they are sent (docs/02
	 * §2.18). The guardrails are the server's: a link that has meanwhile become a duplicate or a
	 * contradiction comes back refused, with the reason. Named the way the picker names them.
	 */
	const keptLinks = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'relationship.add'> | KeptOf<'relationship.addMany'> =>
				(isKept(item, 'relationship.add') || isKept(item, 'relationship.addMany')) &&
				item.command.payload.contactId === c.id
		)
	);
	/** Who a kept link or batch is with: one person, or everyone picked for it. */
	const keptTargets = (item: (typeof keptLinks)[number]): string[] =>
		item.command.type === 'relationship.addMany'
			? item.command.payload.links.map((link) => link.targetId)
			: [item.command.payload.targetId];
	/** "Child of Anna Brunner and Bert Brunner", for a kept link or batch. */
	function keptLinkLabel(typeChoice: string, targetIds: readonly string[]): string {
		const option = relationshipChoices.find((o) => o.value === typeChoice);
		const names = new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(
			targetIds
				.map((id) => otherContacts.find((p) => p.id === id)?.displayName ?? '')
				.filter(Boolean)
		);
		return option ? `${relationshipTypeLabel(t, option.type, option.side)} ${names}` : names;
	}
	/** Empty until the picker is touched, which means it stands on its first entry. */
	let relationshipChoice = $state('');
	/** People named through the picker itself are not in `otherContacts` yet (docs/02 §2.2.2). */
	let pickedTargets = $state<SelectablePerson[]>([]);
	/*
	 * A refused batch names each refused person; the open form marks them on their chips and
	 * says why under the field, so the section's own error line would only repeat it. A batch
	 * refused from *Add all* has no form open to mark it, so the line says it there.
	 */
	const refusedPeople = $derived(
		form && 'refusals' in form && Array.isArray(form.refusals) ? form.refusals.length : 0
	);
	/*
	 * What the household's own records rule out (docs/02 §2.4). The same pure rules the
	 * use-case is guarded by, run over the facts the load sent: an entry that would be refused
	 * is greyed out with its reason rather than offered and then rejected.
	 */
	const exclusionOf = (
		option: { type: { key: string; category: RelationshipCategory }; side: 'forward' | 'reverse' },
		targetId: string | null | undefined,
		exceptId: string | null = null
	): Exclusion | null =>
		targetId
			? exclusionFor(data.exclusionFacts, {
					subjectId: c.id,
					targetId,
					type: { key: option.type.key, category: option.type.category },
					side: option.side,
					exceptId
				})
			: null;
	/** Whoever a reason is about; both people are on the page already. */
	const nameOfContact = (contactId: string): string =>
		contactId === c.id
			? c.displayName
			: (otherContacts.find((person) => person.id === contactId)?.displayName ?? '');
	/*
	 * "How are we connected?" — the picker is on the page rather than in the canvas: the map
	 * holds two hops, the household holds the answer, and the app's own person picker is what
	 * every other "which person?" question on this page uses.
	 */
	let pathTargetId = $state<string[]>([]);
	const pathTarget = $derived(pathTargetId[0] ?? null);

	/** Opens the picker and hands it the cursor — the question is the next thing to answer. */
	async function askHowConnected() {
		tracingPath = true;
		await tick();
		const card = document.getElementById(sectionAnchor('relationships'));
		if (card) showOpenedForm(card, document.getElementById('path-target'));
	}

	/*
	 * *Show fewer* sits under the list it folds, so folding pulls it up the page; once the list
	 * has glided shut the page follows it if it went past the top (docs/05 §5.11). Only when it
	 * was the button pressed: *Done* in the header folds the list too, and must not move the page.
	 */
	let peopleColumn = $state<HTMLElement>();
	let foldedFromToggle = false;
	function toggleShowMore() {
		foldedFromToggle = expanded;
		expanded = !expanded;
	}
	/*
	 * A group on the fold's collapsed line unfolds the whole card — the one *Show more* state,
	 * no fold per group — and once the glide has settled the page brings that group into view
	 * (only the shell scrolls, docs/05 §5.11), with a brief tint to say where it landed and the
	 * cursor on its heading, since the button that was pressed is gone with the fold.
	 */
	let landOnGroup: HiddenGroup['group'] | null = null;
	function showGroup(group: HiddenGroup['group']) {
		landOnGroup = group;
		expanded = true;
	}
	function settled() {
		if (landOnGroup !== null) {
			const target = peopleColumn?.querySelector<HTMLElement>(
				`[data-people-group="${landOnGroup}"]`
			);
			landOnGroup = null;
			if (!target) return;
			scrollToShow(target, 'start');
			target.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
			if (!prefersReducedMotion.current) {
				// The token itself, read off the page: a keyframe holds a colour, not a reference.
				const tint = getComputedStyle(target).getPropertyValue('--primary-soft');
				target.animate(
					[
						{ backgroundColor: tint },
						{ backgroundColor: tint, offset: 0.4 },
						{ backgroundColor: 'transparent' }
					],
					{ duration: LANDING_TINT_MS, easing: 'ease-out' }
				);
			}
			return;
		}
		if (!foldedFromToggle) return;
		foldedFromToggle = false;
		peopleColumn?.querySelector('[data-people-toggle]')?.scrollIntoView({
			block: 'nearest',
			behavior: scrollBehavior(prefersReducedMotion.current)
		});
	}
	/** How long the tint on a group just landed on takes to fade. */
	const LANDING_TINT_MS = 1200;

	const MENU_ITEM =
		'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft';
	/** Nothing to correct on an empty card, so it offers no *Edit*. */
	const editable = $derived(visibleRelationships.length > 0 || data.derivedKin.length > 0);
</script>

<Section
	id={sectionAnchor('relationships')}
	title={t('contact.section.relationships')}
	count={visibleRelationships.length}
	addLabel={t('contact.relationships.add')}
	error={refusedPeople > 0 && relateOpen ? null : (form?.error ?? null)}
	iconAdd
	bind:open={relateOpen}
>
	{#snippet action()}
		{#if editable}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				icon={editing ? 'done' : 'rename'}
				onclick={() => (editing = !editing)}
				data-testid="relationships-edit"
			>
				{editing ? t('contact.relationships.editModeDone') : t('contact.relationships.editMode')}
			</Button>
		{/if}
	{/snippet}
	{#snippet menu()}
		<MenuButton label={t('contact.relationships.menu')} align="end" look="button">
			{#snippet trigger()}<Icon name="more" size={16} />{/snippet}
			{#snippet children({ close })}
				{#if otherContacts.length > 0}
					<button
						type="button"
						role="menuitem"
						class={MENU_ITEM}
						onclick={() => (close(), askHowConnected())}
					>
						<Icon name="connectionPath" size={14} />{t('contact.relationships.howConnected')}
					</button>
				{/if}
				<!--
						The on-demand review (docs/02 §2.4.1): nothing
						runs until it is chosen, and asking what else might be true is never what this
						card is for — so it waits in the menu.
					-->
				<a role="menuitem" class={MENU_ITEM} href="/contacts/{c.id}?review#relationships">
					<Icon name="search" size={14} />{data.review.open
						? t('contact.relationships.reviewAgain')
						: t('contact.relationships.review')}
				</a>
				<!-- The way out of this person's two hops and into the household. -->
				<a role="menuitem" class={MENU_ITEM} href="/graph?center={c.id}">
					<Icon name="graph" size={14} />{t('graph.openInGraph')}
				</a>
			{/snippet}
		</MenuButton>
	{/snippet}

	{#if keptLinks.length > 0}
		<ul class="mb-3 flex flex-col gap-2" data-testid="kept-links">
			{#each keptLinks as item (item.command.id)}
				<li>
					<KeptItem {item}>
						<p class="mt-1 text-fg">
							{keptLinkLabel(item.command.payload.typeChoice, keptTargets(item))}
						</p>
					</KeptItem>
				</li>
			{/each}
		</ul>
	{/if}
	<!--
			"How are we connected?" is a question this card cannot answer: it holds two hops
			of the household and the chain usually runs further. So it asks who, and hands
			both ends to the explorer, which holds the whole graph (docs/05 §5.5).
		-->
	{#if tracingPath}
		<div
			transition:reveal
			class="mb-3 flex flex-wrap items-end gap-3 rounded-control bg-bg-sunken p-3"
		>
			<label for="path-target" class="flex min-w-48 flex-1 flex-col gap-1 text-sm">
				<span class="text-fg-muted">
					{t('contact.relationships.howConnectedTo', { name: c.displayName })}
				</span>
				<PersonSearchSelect
					id="path-target"
					people={otherContacts}
					name="pathTarget"
					bind:selectedIds={pathTargetId}
				/>
			</label>
			<Button
				variant="primary"
				size="sm"
				icon="connectionPath"
				href={pathTarget ? `/graph?center=${c.id}&path=${pathTarget}` : undefined}
				disabled={!pathTarget}
			>
				{t('contact.relationships.tracePath')}
			</Button>
			<Button type="button" variant="ghost" size="sm" onclick={() => (tracingPath = false)}>
				{t('common.cancel')}
			</Button>
		</div>
	{/if}

	<!--
			The map and the list (docs/05 §5.5). The map is a preview across the card's top on
			every width — a strip with first names on a wide card, a small ring on a phone — that
			enlarges in place; the list takes the card's whole width beneath it.
		-->
	<div class="flex flex-col gap-4">
		{#if visibleRelationships.length > 0}
			<PeopleMap {data} />
		{/if}
		<div class="min-w-0" bind:this={peopleColumn}>
			<!-- Unfolding and edit mode change the rows; the box glides between the two heights
				     and *Show more* rides on its lower edge (docs/05 §5.11). -->
			<div
				use:glide={{ key: `${unfolded}:${editing}`, onsettled: settled }}
				data-testid="people-rows"
			>
				<RelationshipList
					{data}
					{visibleRelationships}
					{relationshipChoices}
					{exclusionOf}
					{nameOfContact}
					{editing}
					expanded={unfolded}
					{showTogether}
					bind:relateOpen
				/>

				<KinPanels {data} {editing} kinShown={fold.workedOutShown} />

				<!--
					What the fold hides, by group: every group folded away whole with its count, the
					worked-out block last — a group partly shown is counted by its own heading. Each
					one unfolds the card and lands on that group.
				-->
				{#if fold.hiddenGroups.length > 0}
					<ul
						class="mt-1 flex list-none flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase"
						aria-label={t('contact.relationships.foldedAway')}
						data-testid="people-folded-groups"
					>
						{#each fold.hiddenGroups as hidden, index (hidden.group)}
							<li class="flex items-center gap-1">
								{#if index > 0}<span class="text-border" aria-hidden="true">·</span>{/if}
								<button
									type="button"
									class="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2 py-1 tracking-wide uppercase hover:border-solid hover:bg-card-hover hover:text-fg"
									aria-label={t('contact.relationships.showGroup', {
										group: hiddenGroupLabel(hidden),
										count: hidden.count
									})}
									onclick={() => showGroup(hidden.group)}
								>
									{#if hidden.group === WORKED_OUT}<Icon name="explore" size={12} />{/if}
									{hiddenGroupLabel(hidden)} · {hidden.count}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			{#if fold.hidden > 0 || (expanded && !editing)}
				<Button
					data-people-toggle
					type="button"
					variant="ghost"
					size="sm"
					class="mt-2"
					icon={expanded ? 'collapse' : 'expand'}
					aria-expanded={expanded}
					onclick={toggleShowMore}
				>
					{expanded
						? t('contact.relationships.showFewer')
						: t('contact.relationships.showMore', { count: fold.hidden })}
				</Button>
			{/if}
		</div>
	</div>

	{#snippet editor()}
		<AddRelationshipForm
			{data}
			{form}
			{otherContacts}
			{relationshipChoices}
			{exclusionOf}
			{nameOfContact}
			{closeRelate}
			{keptLinkLabel}
			bind:relationshipTargetId
			bind:relationshipChoice
			bind:pickedTargets
		/>
	{/snippet}
</Section>
