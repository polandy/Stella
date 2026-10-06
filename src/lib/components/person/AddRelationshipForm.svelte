<script lang="ts">
	import Swap from '$lib/components/Swap.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { proposeHref } from '$lib/contacts/propose';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { SelectablePerson } from '$lib/people/select';
	import { keepable } from '$lib/pwa/keepable';
	import {
		exclusionLabel,
		relationshipStatusLabel,
		relationshipTypeLabel,
		towardsSubject
	} from '$lib/relationships/labels';
	import {
		capState,
		chipRefusals,
		exclusionForEveryone,
		oneDateForAll,
		parentsOnRecord,
		pickCap,
		secondParentOffer,
		sharedSince,
		sincePerPair,
		type ServerRefusal
	} from '$lib/relationships/multi-pick';
	import { firstPickable, groupByExclusion } from '$lib/relationships/picker-groups';
	import { sinceDateFromBirth } from '$lib/relationships/since';
	import { PARENT_CHILD_TYPE_KEY, PARTNER_TYPE_KEYS } from '$lib/relationships/type-keys';
	import { CURRENT_RELATIONSHIP_STATUS, RELATIONSHIP_STATUSES } from '$lib/relationships/status';
	import { usePending } from '$lib/sync/context.svelte';
	import { trackPending } from '$lib/sync/pending';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import { announceSavedBatch, relationshipIdsOf } from './saved-batch';
	import type { ExclusionOf, PersonForm, PersonPageData, RelationshipChoices } from './types';

	/*
	 * The relationships card's add form (docs/02 §2.4). What is being entered — the other ends,
	 * the picked entry — is bound to the card, which outlives this form being opened and closed.
	 *
	 * The person field takes several people (docs/concepts/multi-pick-relationships.html): the
	 * type, status and description are shared, the since day is worked out per pair, and the type
	 * decides how many people the field takes. One person picked saves exactly as it always has
	 * (`relationship.add`, then *Also true?* for the pair); several save as one batch
	 * (`relationship.addMany`), all or nothing, with one *Undo* — and then *Also true?* for the
	 * whole batch at once (D7). With one parent picked for "Child of", the likely second parent
	 * is offered under the field (D4, rule L3): one tap makes them a chip, nothing is preselected.
	 */
	let {
		data,
		form,
		otherContacts,
		relationshipChoices,
		exclusionOf,
		nameOfContact,
		closeRelate,
		keptLinkLabel,
		relationshipTargetId = $bindable(),
		relationshipChoice = $bindable(),
		pickedTargets = $bindable()
	}: {
		data: PersonPageData;
		/** The page's last form result, for the people a refused batch named. */
		form: PersonForm;
		otherContacts: PersonPageData['people'];
		relationshipChoices: RelationshipChoices;
		exclusionOf: ExclusionOf;
		nameOfContact: (contactId: string) => string;
		/** Closes the form and lets go of the other ends. */
		closeRelate: () => void;
		/** "Child of Anna Brunner and Bert Brunner", for a kept link or batch. */
		keptLinkLabel: (typeChoice: string, targetIds: readonly string[]) => string;
		/** The other ends of the new relationships, as the person picker holds them. */
		relationshipTargetId: string[];
		/** Empty until the picker is touched, which means it stands on its first entry. */
		relationshipChoice: string;
		/** People named through the picker itself, not in `otherContacts` yet. */
		pickedTargets: SelectablePerson[];
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const removals = useRemovals();
	// The shell's one activity indicator, which every change to the graph reports to (docs/05 §5.7).
	const graphPending = usePending();
	const picked = $derived(relationshipTargetId);
	const several = $derived(picked.length > 1);

	/** The type choice the last batch was sent with: a refusal it brought back is about that type. */
	let submittedChoice = $state<string | null>(null);

	const savedRelationship = trackPending(
		graphPending,
		savedEnhance(removals, t('components.saved'), () => closeRelate())
	);
	const relationshipForm = $derived(
		keepable(
			{
				toCommand: (fields, id) => {
					const targetIds = fields.getAll('targetId').map(String).filter(Boolean);
					const typeChoice = String(fields.get('typeChoice') ?? '');
					if (targetIds.length === 0 || !typeChoice) return null;
					const text = (value: FormDataEntryValue | null) => String(value ?? '').trim() || null;
					if (targetIds.length === 1) {
						return {
							id,
							type: 'relationship.add',
							payload: {
								contactId: c.id,
								targetId: targetIds[0],
								typeChoice,
								description: text(fields.get('description')),
								sinceDate: text(fields.get('sinceDate')),
								status: text(fields.get('status'))
							},
							issuedAt: Date.now()
						};
					}
					// One field for every pair, or one per pair in the order the people were picked.
					const sinceDates = fields.getAll('sinceDate');
					if (sinceDates.length !== 1 && sinceDates.length !== targetIds.length) return null;
					const status = RELATIONSHIP_STATUSES.find((s) => s === fields.get('status'));
					submittedChoice = typeChoice;
					return {
						id,
						type: 'relationship.addMany',
						payload: {
							contactId: c.id,
							typeChoice,
							status: status ?? CURRENT_RELATIONSHIP_STATUS,
							description: text(fields.get('description')),
							links: targetIds.map((targetId, index) => ({
								targetId,
								sinceDate: text(sinceDates.length === 1 ? sinceDates[0] : sinceDates[index])
							}))
						},
						issuedAt: Date.now()
					};
				},
				about: (fields) =>
					`${c.displayName} · ${keptLinkLabel(String(fields.get('typeChoice') ?? ''), fields.getAll('targetId').map(String))}`,
				errorKey: 'error',
				pending: graphPending,
				onApplied: async (result, command) => {
					if (command.type === 'relationship.addMany') {
						announceSavedBatch(
							{ contactId: c.id, removals, pending: graphPending, t },
							relationshipIdsOf(result)
						);
						closeRelate();
						// Back on the card naming every new pair, so *Also true?* is worked out for the
						// whole batch at once rather than for whichever link came last (D7).
						await goto(
							proposeHref(
								c.id,
								command.payload.links.map((link) => link.targetId)
							),
							{ noScroll: true, keepFocus: true }
						);
						return;
					}
					removals.notify(t('components.saved'));
					closeRelate();
					if (command.type === 'relationship.add') {
						// Back on the card naming the new pair, so what it implies is offered (§2.4.1).
						// keepFocus: the closed form hands focus back to its button (Section), and a
						// navigation's own focus reset would drop it on the page again.
						await goto(proposeHref(c.id, [command.payload.targetId]), {
							noScroll: true,
							keepFocus: true
						});
					}
				},
				onKept: closeRelate
			},
			savedRelationship
		)
	);

	/** Everyone picked, as the picker knows them — someone just named there included. */
	const pickedPeople = $derived(
		picked.flatMap((id) => {
			const person =
				pickedTargets.find((candidate) => candidate.id === id) ??
				otherContacts.find((candidate) => candidate.id === id);
			return person ? [person] : [];
		})
	);
	const nameOfPicked = (id: string) =>
		pickedPeople.find((person) => person.id === id)?.displayName ?? nameOfContact(id);

	/** An entry is greyed out only when it is refused for everyone picked (D3). */
	const forEveryone = (option: RelationshipChoices[number]) =>
		exclusionForEveryone(picked, (targetId) => exclusionOf(option, targetId));
	/*
	 * The entry the form would post: the one that was picked, or — since the select is read
	 * rather than bound — the first one that *can* be picked, which is where an untouched
	 * control stands, disabled entries skipped.
	 */
	const chosen = $derived(
		relationshipChoices.find((option) => option.value === relationshipChoice) ??
			firstPickable(relationshipChoices, forEveryone) ??
			relationshipChoices[0] ??
			null
	);
	/** Refused for everyone picked: the button goes with it, so nothing greyed out is submitted. */
	const blockedChoice = $derived(chosen ? forEveryone(chosen) : null);

	const cap = $derived(pickCap(chosen, parentsOnRecord(data.exclusionFacts, c.id)));
	const capped = $derived(capState(cap, picked.length));

	/** What the last refused batch said, while it is about the type still chosen. */
	const serverRefusals = $derived.by((): ServerRefusal[] => {
		if (!form || !('refusals' in form) || !Array.isArray(form.refusals)) return [];
		return chosen && submittedChoice === chosen.value ? form.refusals : [];
	});
	const refusals = $derived(
		chosen ? chipRefusals(picked, (targetId) => exclusionOf(chosen, targetId), serverRefusals) : []
	);
	const refusalLine = (refusal: (typeof refusals)[number]) =>
		'exclusion' in refusal
			? // Every reason already names whoever it is about, so it reads without the chip's name.
				t('relationships.blocked.group', {
					reason: exclusionLabel(t, refusal.exclusion, nameOfContact)
				})
			: t('contact.relationships.refusedSaid', {
					name: nameOfPicked(refusal.targetId),
					reason: refusal.reason
				});
	const canAdd = $derived(blockedChoice === null && refusals.length === 0 && capped.excess === 0);

	/** The hint under the field: how many the type takes, once that is worth saying. */
	const capHint = $derived.by(() => {
		if (!chosen || cap === null) return null;
		if (PARTNER_TYPE_KEYS.includes(chosen.type.key)) {
			return capped.full && capped.excess === 0 ? t('contact.relationships.partnerFull') : null;
		}
		if (chosen.type.key !== PARENT_CHILD_TYPE_KEY) return null;
		if (cap === 0 && picked.length === 0) return t('contact.relationships.parentsOnRecord');
		if (capped.excess > 0) return null;
		if (capped.full) return t('contact.relationships.parentsFull');
		return picked.length === 0 ? t('contact.relationships.parentsRoom', { count: cap }) : null;
	});
	const overCapLine = $derived(
		chosen && cap !== null && capped.excess > 0
			? t('contact.relationships.overCap', {
					type: relationshipTypeLabel(t, chosen.type, chosen.side),
					max: cap,
					extra: capped.excess
				})
			: null
	);
	/*
	 * The likely second parent (D4, rule L3), offered under the field while one parent is picked
	 * for "Child of". Someone the field could take: visible here, and not ruled out by the same
	 * exclusion rules that grey out an entry.
	 */
	const coParent = $derived.by(() => {
		const offer = secondParentOffer({
			choice: chosen,
			pickedIds: picked,
			child: data.contact,
			facts: data.exclusionFacts,
			isRefused: (targetId) => refusals.some((refusal) => refusal.targetId === targetId),
			canOffer: (personId) =>
				otherContacts.some((person) => person.id === personId) &&
				chosen !== null &&
				exclusionOf(chosen, personId) === null
		});
		const partner = offer && otherContacts.find((person) => person.id === offer.partnerId);
		return offer && partner ? { partner, parentName: nameOfPicked(offer.parentId) } : null;
	});
	const hintsId = $props.id();
	const hasHints = $derived(capHint !== null || overCapLine !== null || refusals.length > 0);

	// Someone named in the picker for the first time is known by this link until they have more
	// (docs/02 §2.2.3): on Hans's page, "Parent of" makes them "Child of Hans Meyer".
	const suggestedTargetDescription = $derived(
		chosen ? towardsSubject(t, chosen.type, chosen.side, c.displayName) : ''
	);
	const kinChoice = $derived(
		chosen
			? { category: chosen.type.category, symmetric: chosen.type.symmetric, side: chosen.side }
			: null
	);
	/** The since day per pair, from the birthday rule (D5). */
	const sincePairs = $derived(sincePerPair(kinChoice, data.contact, pickedPeople));
	const sameSince = $derived(sharedSince(sincePairs));
	/** *Use one date for all*, chosen while the pairs' days differ. */
	let useOneDate = $state(false);
	const perPair = $derived(several && sameSince === null && !useOneDate);
	// Nobody picked yet: a "Child of" link still begins on this person's own birthday, as before.
	const oneSince = $derived(
		picked.length === 0
			? kinChoice
				? sinceDateFromBirth(kinChoice, data.contact, null)
				: ''
			: (sameSince ?? oneDateForAll(sincePairs))
	);
</script>

{#if otherContacts.length > 0}
	<!-- Top-aligned, with a blank label over the button: the hints under the person field
		 must not drag the other fields down to their baseline (the concept's desktop fix). -->
	<form
		method="POST"
		action={several ? '?/addRelationships' : '?/addRelationship'}
		use:enhance={relationshipForm}
		class="flex flex-wrap items-start gap-3"
	>
		<label class="flex min-w-0 flex-[1_1_10rem] flex-col gap-1 text-sm">
			<span class="text-fg-muted">
				{t('contact.relationships.is', { name: c.displayName })}
			</span>
			<!-- Both directions of an asymmetric type, so "is a child of" needs no
				 detour via the other profile (docs/02 §2.4). -->
			<!-- Read, not bound: binding would hand the select a value of its own before
				 anybody has chosen, and an unmatched one deselects every option — the form
				 would then post no type at all. `selected` still has to follow the choice,
				 because picking another person regroups the entries and a rebuilt option
				 loses the selection the DOM was holding. -->
			<select
				name="typeChoice"
				onchange={(event) => (relationshipChoice = event.currentTarget.value)}
				class={INPUT}
			>
				{#each groupByExclusion(relationshipChoices, forEveryone) as group (group.options[0].value)}
					{#if group.exclusion}
						<optgroup
							label={t('relationships.blocked.group', {
								reason: exclusionLabel(t, group.exclusion, nameOfContact)
							})}
						>
							{#each group.options as option (option.value)}
								<option
									value={option.value}
									selected={option.value === relationshipChoice}
									disabled
								>
									{relationshipTypeLabel(t, option.type, option.side)}
								</option>
							{/each}
						</optgroup>
					{:else}
						{#each group.options as option (option.value)}
							<option value={option.value} selected={option.value === relationshipChoice}>
								{relationshipTypeLabel(t, option.type, option.side)}
							</option>
						{/each}
					{/if}
				{/each}
			</select>
		</label>
		<div class="flex min-w-0 flex-[2_1_18rem] flex-col gap-1 text-sm">
			<label for="relationship-target" class="text-fg-muted"
				>{t('contact.relationships.person')}</label
			>
			<PersonSearchSelect
				id="relationship-target"
				people={otherContacts}
				name="targetId"
				multiple
				keepSearch
				max={cap}
				fullPlaceholder={t('contact.relationships.capFullPlaceholder')}
				markedIds={refusals.map((refusal) => refusal.targetId)}
				markedLabel={t('contact.relationships.chipRefused')}
				describedBy={hasHints ? hintsId : undefined}
				bind:selectedIds={relationshipTargetId}
				onPick={(person) => {
					if (!pickedTargets.some((known) => known.id === person.id))
						pickedTargets = [...pickedTargets, person];
				}}
				allowCreate
				suggestedDescription={suggestedTargetDescription}
			/>
			<!-- One live region for every hint, so a refusal is heard the moment a pick causes it. -->
			<div
				id={hintsId}
				aria-live="polite"
				class="flex flex-col gap-1 text-xs"
				data-testid="relationship-hints"
			>
				{#if capHint}<p class="text-fg-subtle">{capHint}</p>{/if}
				{#if overCapLine}<p class="text-danger">{overCapLine}</p>{/if}
				{#each refusals as refusal (refusal.targetId)}
					<p class="text-danger">{refusalLine(refusal)}</p>
				{/each}
				{#if refusals.length > 0 && picked.length > refusals.length}
					<p class="text-fg-muted">
						{t('contact.relationships.removeToAdd', { count: refusals.length })}
					</p>
				{/if}
			</div>
			<!-- Outside the live region: an offer is not news to interrupt with, only a choice. -->
			{#if coParent}
				<div
					class="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-primary bg-card px-2 py-1.5 text-sm text-fg-muted"
					data-testid="second-parent-offer"
				>
					<span>{t('contact.relationships.secondParentAlso')}</span>
					<button
						type="button"
						class="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-primary bg-card py-0.5 pr-2.5 pl-0.5 text-fg hover:bg-primary-soft"
						aria-label={t('contact.relationships.secondParentAdd', {
							name: coParent.partner.displayName
						})}
						onclick={() => (relationshipTargetId = [...relationshipTargetId, coParent.partner.id])}
					>
						<Avatar
							id={coParent.partner.id}
							name={coParent.partner.displayName}
							avatarPhotoId={coParent.partner.avatarPhotoId}
							size={24}
						/>
						<Icon name="add" size={14} />
						{coParent.partner.displayName}
					</button>
					<span class="text-xs text-fg-subtle">
						{t('contact.relationships.secondParentWhy', { name: coParent.parentName })}
					</span>
				</div>
			{/if}
		</div>
		<label class="flex w-full flex-col gap-1 text-sm">
			<span class="text-fg-muted">
				{several
					? t('contact.relationships.howConnectForAll', { count: picked.length })
					: t('contact.relationships.howConnectOptional')}
			</span>
			<input
				name="description"
				placeholder={t('contact.relationships.howConnectPlaceholder')}
				class={INPUT}
			/>
		</label>
		<!-- One date or one per person: the two glide into each other in place (docs/05 §5.11). -->
		<Swap when={perPair} class={perPair ? 'w-full' : ''}>
			<!-- The days differ (several children): one field per pair, each prefilled and clearable. -->
			<fieldset class="flex w-full min-w-0 flex-col gap-1 text-sm">
				<legend class="mb-1 text-fg-muted">
					{t('contact.relationships.sinceLabel')} · {t('contact.relationships.sinceEach')}
				</legend>
				<ul class="flex flex-col gap-2 rounded-control border border-border bg-card p-2">
					{#each sincePairs as pair (`${pair.targetId}|${pair.sinceDate}`)}
						<li class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
							<span class="min-w-0 truncate text-fg">{nameOfPicked(pair.targetId)}</span>
							<DateField
								name="sinceDate"
								value={pair.sinceDate}
								label={t('contact.relationships.sinceFor', { name: nameOfPicked(pair.targetId) })}
							/>
						</li>
					{/each}
				</ul>
				<button
					type="button"
					class="self-start rounded-control py-1 text-xs font-medium text-link hover:underline"
					onclick={() => (useOneDate = true)}
				>
					{t('contact.relationships.oneDateForAll')}
				</button>
			</fieldset>
			{#snippet otherwise()}
				<div class="flex flex-col gap-1 text-sm">
					<span class="text-fg-muted">{t('contact.relationships.sinceLabel')}</span>
					<!-- Keyed: the field owns its segments once it is on screen, so a new
					 suggestion arrives as a fresh field rather than as a silent overwrite. -->
					{#key oneSince}
						<DateField
							name="sinceDate"
							value={oneSince}
							label={t('contact.relationships.sinceLabel')}
						/>
					{/key}
					{#if several && useOneDate && sameSince === null}
						<button
							type="button"
							class="self-start rounded-control py-1 text-xs font-medium text-link hover:underline"
							onclick={() => (useOneDate = false)}
						>
							{t('contact.relationships.datePerPerson')}
						</button>
					{/if}
				</div>
			{/snippet}
		</Swap>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-fg-muted">{t('contact.relationships.status')}</span>
			<!-- A link being entered is one that holds, so `current` is preselected and
			     "not said" is not on offer (docs/02 §2.4). Shared by every pair. -->
			<select name="status" class={INPUT}>
				{#each RELATIONSHIP_STATUSES as status (status)}
					<option value={status} selected={status === CURRENT_RELATIONSHIP_STATUS}>
						{relationshipStatusLabel(t, status)}
					</option>
				{/each}
			</select>
		</label>
		<div class="flex basis-full flex-col gap-1 text-sm sm:basis-auto">
			<span aria-hidden="true" class="hidden sm:block">&nbsp;</span>
			<Button variant="primary" size="sm" disabled={!canAdd} class="w-full sm:w-auto">
				{several ? t('contact.relationships.addLinks', { count: picked.length }) : t('common.add')}
			</Button>
		</div>
	</form>
{:else}
	<p class="text-sm text-fg-subtle">{t('contact.relationships.addSomeoneFirst')}</p>
{/if}
