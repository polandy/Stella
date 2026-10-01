<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import DateField from '$lib/components/DateField.svelte';
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
	import { firstPickable, groupByExclusion } from '$lib/relationships/picker-groups';
	import { sinceDateFromBirth } from '$lib/relationships/since';
	import { CURRENT_RELATIONSHIP_STATUS, RELATIONSHIP_STATUSES } from '$lib/relationships/status';
	import { usePending } from '$lib/sync/context.svelte';
	import { trackPending } from '$lib/sync/pending';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import type { ExclusionOf, PersonPageData, RelationshipChoices } from './types';

	/*
	 * The relationships card's add form (docs/02 §2.4). What is being entered — the other end,
	 * the picked entry — is bound to the card, which outlives this form being opened and closed.
	 */
	let {
		data,
		otherContacts,
		relationshipChoices,
		exclusionOf,
		nameOfContact,
		closeRelate,
		keptLinkLabel,
		relationshipTargetId = $bindable(),
		relationshipChoice = $bindable(),
		pickedTarget = $bindable()
	}: {
		data: PersonPageData;
		otherContacts: PersonPageData['people'];
		relationshipChoices: RelationshipChoices;
		exclusionOf: ExclusionOf;
		nameOfContact: (contactId: string) => string;
		/** Closes the form and lets go of the other end. */
		closeRelate: () => void;
		/** "Child of Bert Brunner", for a kept link. */
		keptLinkLabel: (typeChoice: string, targetId: string) => string;
		/** The other end of the new relationship, as the person picker holds it. */
		relationshipTargetId: string[];
		/** Empty until the picker is touched, which means it stands on its first entry. */
		relationshipChoice: string;
		/** Someone named through the picker itself, not in `otherContacts` yet. */
		pickedTarget: SelectablePerson | undefined;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const removals = useRemovals();
	// The shell's one activity indicator, which every change to the graph reports to (docs/05 §5.7).
	const graphPending = usePending();
	/** What a form saved through the outbox does once Stella took it: say so, then `close`. */
	const savedThen = (close: () => void) => () => {
		removals.notify(t('components.saved'));
		close();
	};

	const savedRelationship = trackPending(graphPending, savedEnhance(removals, t('components.saved'), () => closeRelate()));
	const relationshipForm = $derived(
		keepable(
			{
				toCommand: (form, id) => {
					const targetId = String(form.get('targetId') ?? '');
					const typeChoice = String(form.get('typeChoice') ?? '');
					if (!targetId || !typeChoice) return null;
					const text = (name: string) => String(form.get(name) ?? '').trim() || null;
					return {
						id,
						type: 'relationship.add',
						payload: {
							contactId: c.id,
							targetId,
							typeChoice,
							description: text('description'),
							sinceDate: text('sinceDate'),
							status: text('status')
						},
						issuedAt: Date.now()
					};
				},
				about: (form) =>
					`${c.displayName} · ${keptLinkLabel(String(form.get('typeChoice') ?? ''), String(form.get('targetId') ?? ''))}`,
				errorKey: 'error',
				pending: graphPending,
				// Back on the card naming the new pair, so what it implies is offered (§2.4.1).
				onApplied: async (_result, command) => {
					savedThen(closeRelate)();
					if (command.type === 'relationship.add') {
						// keepFocus: the closed form hands focus back to its button (Section), and a
						// navigation's own focus reset would drop it on the page again.
						await goto(proposeHref(c.id, command.payload.targetId), { noScroll: true, keepFocus: true });
					}
				},
				onKept: closeRelate
			},
			savedRelationship
		)
	);
	const relationshipTarget = $derived.by(() => {
		const id = relationshipTargetId[0];
		if (!id) return null;
		if (pickedTarget?.id === id) return pickedTarget;
		return otherContacts.find((person) => person.id === id) ?? null;
	});
	/*
	 * The entry the form would post: the one that was picked, or — since the select is read
	 * rather than bound — the first one that *can* be picked, which is where an untouched
	 * control stands, disabled entries skipped. Refused, the button goes with it, so nothing
	 * greyed out is submitted by pressing Add; and with every entry refused there is nothing
	 * to stand on and it stays off.
	 */
	const blockedChoice = $derived.by(() => {
		const forTarget = (option: (typeof relationshipChoices)[number]) =>
			exclusionOf(option, relationshipTargetId[0]);
		const picked = relationshipChoices.find((option) => option.value === relationshipChoice);
		if (picked) return forTarget(picked);
		return firstPickable(relationshipChoices, forTarget) === null && relationshipChoices.length > 0
			? forTarget(relationshipChoices[0])
			: null;
	});
	// Someone named in the picker for the first time is known by this link until they have more
	// (docs/02 §2.2.3): on Hans's page, "Parent of" makes them "Child of Hans Meyer".
	const suggestedTargetDescription = $derived.by(() => {
		const chosen =
			relationshipChoices.find((option) => option.value === relationshipChoice) ??
			relationshipChoices[0];
		return chosen ? towardsSubject(t, chosen.type, chosen.side, c.displayName) : '';
	});
	const suggestedSince = $derived.by(() => {
		const chosen =
			relationshipChoices.find((option) => option.value === relationshipChoice) ??
			relationshipChoices[0];
		if (!chosen) return '';
		return sinceDateFromBirth(
			{ category: chosen.type.category, symmetric: chosen.type.symmetric, side: chosen.side },
			data.contact,
			relationshipTarget
		);
	});
</script>

{#if otherContacts.length > 0}
	<form method="POST" action="?/addRelationship" use:enhance={relationshipForm} class="flex flex-wrap items-end gap-3">
		<label class="flex flex-1 flex-col gap-1 text-sm">
			<span class="text-fg-muted">
				{t('contact.relationships.is', { name: c.displayName })}
			</span>
			<!-- Both directions of an asymmetric type, so "is a child of" needs no
				 detour via the other profile (docs/02 §2.4). -->
			<!-- Read, not bound: binding would hand the select a value of its own before
				 anybody has chosen, and an unmatched one deselects every option — the form
				 would then post no type at all. `selected` still has to follow the choice,
				 because picking the other person regroups the entries and a rebuilt option
				 loses the selection the DOM was holding. -->
			<select
				name="typeChoice"
				onchange={(event) => (relationshipChoice = event.currentTarget.value)}
				class={INPUT}
			>
				{#each groupByExclusion(relationshipChoices, (option) => exclusionOf(option, relationshipTargetId[0])) as group (group.options[0].value)}
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
							<option
								value={option.value}
								selected={option.value === relationshipChoice}
							>
								{relationshipTypeLabel(t, option.type, option.side)}
							</option>
						{/each}
					{/if}
				{/each}
			</select>
		</label>
		<label for="relationship-target" class="flex flex-1 flex-col gap-1 text-sm">
			<span class="text-fg-muted">{t('contact.relationships.person')}</span>
			<PersonSearchSelect
				id="relationship-target"
				people={otherContacts}
				name="targetId"
				bind:selectedIds={relationshipTargetId}
				onPick={(person) => (pickedTarget = person)}
				allowCreate
				suggestedDescription={suggestedTargetDescription}
			/>
		</label>
		<label class="flex w-full flex-col gap-1 text-sm sm:flex-1">
			<span class="text-fg-muted">{t('contact.relationships.howConnectOptional')}</span>
			<input
				name="description"
				placeholder={t('contact.relationships.howConnectPlaceholder')}
				class={INPUT}
			/>
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-fg-muted">{t('contact.relationships.sinceLabel')}</span>
			<!-- Keyed: the field owns its segments once it is on screen, so a new
				 suggestion arrives as a fresh field rather than as a silent overwrite. -->
			{#key suggestedSince}
				<DateField
					name="sinceDate"
					value={suggestedSince}
					label={t('contact.relationships.sinceLabel')}
				/>
			{/key}
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-fg-muted">{t('contact.relationships.status')}</span>
			<!-- A link being entered is one that holds, so `current` is preselected and
			     "not said" is not on offer (docs/02 §2.4). -->
			<select name="status" class={INPUT}>
				{#each RELATIONSHIP_STATUSES as status (status)}
					<option value={status} selected={status === CURRENT_RELATIONSHIP_STATUS}>
						{relationshipStatusLabel(t, status)}
					</option>
				{/each}
			</select>
		</label>
		<Button variant="primary" size="sm" disabled={blockedChoice !== null}>
			{t('common.add')}
		</Button>
	</form>
{:else}
	<p class="text-sm text-fg-subtle">{t('contact.relationships.addSomeoneFirst')}</p>
{/if}
