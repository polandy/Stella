<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import Section from '$lib/components/Section.svelte';
	import { sectionAnchor } from '$lib/contacts/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { exclusionFor, type Exclusion } from '$lib/relationships/exclusions';
	import type { RelationshipCategory } from '$lib/relationships/categories';
	import { relationshipTypeLabel } from '$lib/relationships/labels';
	import { derivedShownWhenFolded, hiddenWhenFolded } from '$lib/relationships/people-groups';
	import { relationshipTypeOptions } from '$lib/relationships/type-options';
	import type { SelectablePerson } from '$lib/people/select';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import { tick, untrack } from 'svelte';
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
		tracingPath = $bindable(false)
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Candidate targets for a new relationship: everyone visible but this person. */
		otherContacts: PersonPageData['people'];
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
	 * Everybody a folded card leaves out, entered or worked out. Edit mode unfolds it: a row
	 * that cannot be seen cannot be corrected.
	 */
	const unfolded = $derived(expanded || editing);
	const hiddenPeople = $derived(
		hiddenWhenFolded(visibleRelationships.length, unfolded) +
			data.derivedKin.length -
			derivedShownWhenFolded(data.derivedKin.length, unfolded)
	);

	// Relationships keep their own open state: the quick-add flow opens that section by URL.
	/*
	 * The other end of a new relationship. Empty unless the page was *asked* to relate somebody
	 * (`?relate=`, the stream's link hint — §2.22.1). Nothing else stands in the field: a name
	 * already sitting there is read as an answer, not as an offer, and the one it used to
	 * offer — your own person — is wrong at least as often as it is right.
	 */
	let relationshipTargetId = $state<string[]>(untrack(() => (data.relateTo ? [data.relateTo] : [])));
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
			targetIds.map((id) => otherContacts.find((p) => p.id === id)?.displayName ?? '').filter(Boolean)
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
	 * refused from *Add all* (D7) has no form open to mark it, so the line says it there.
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
		document.getElementById('path-target')?.focus();
	}

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
						The on-demand review (docs/concepts/relationship-suggestions.md §6.5): nothing
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
							<p class="mt-1 text-fg">{keptLinkLabel(item.command.payload.typeChoice, keptTargets(item))}</p>
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
			<div class="mb-3 flex flex-wrap items-end gap-3 rounded-control bg-bg-sunken p-3">
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
			The map and the list. On a wide card the map stands beside the list (from a 48rem
			card, measured on the card rather than the window — the sidebar takes its share);
			narrower it comes first, as a shape before rows, and on a phone it is only a preview
			that opens full screen (docs/05 §5.5).
		-->
		<div class="@container">
			<div
				class={[
					'grid gap-4 @3xl:items-start',
					visibleRelationships.length > 0 && '@3xl:grid-cols-[minmax(0,1fr)_20rem]'
				]}
			>
				{#if visibleRelationships.length > 0}
					<div class="min-w-0 @3xl:order-2"><PeopleMap {data} /></div>
				{/if}
				<div class="min-w-0">
					<RelationshipList
						{data}
						{visibleRelationships}
						{relationshipChoices}
						{exclusionOf}
						{nameOfContact}
						{editing}
						expanded={unfolded}
						bind:relateOpen
					/>

					<KinPanels {data} {editing} expanded={unfolded} />

					{#if hiddenPeople > 0 || (expanded && !editing)}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							class="mt-2"
							icon={expanded ? 'collapse' : 'expand'}
							aria-expanded={expanded}
							onclick={() => (expanded = !expanded)}
						>
							{expanded
								? t('contact.relationships.showFewer')
								: t('contact.relationships.showMore', { count: hiddenPeople })}
						</Button>
					{/if}
				</div>
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
