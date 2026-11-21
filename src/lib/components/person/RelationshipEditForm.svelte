<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import DateField from '#lib/components/ui/DateField.svelte';
	import type { SubmitFunction } from '$app/forms';
	import { enhance } from '#lib/forms/enhance.js';
	import { useTranslate } from '#lib/i18n/context.svelte.js';
	import { ANY_PARENT_KIND } from '#lib/relationships/exclusions.js';
	import {
		exclusionLabel,
		relationshipStatusLabel,
		relationshipTypeLabel
	} from '#lib/relationships/labels.js';
	import { BIOLOGICAL_PARENT_KIND, type ParentKind } from '#lib/relationships/parent-kinds.js';
	import { groupByExclusion } from '#lib/relationships/picker-groups.js';
	import { FORMER_RELATIONSHIP_STATUS, RELATIONSHIP_STATUSES } from '#lib/relationships/status.js';
	import { PARENT_CHILD_TYPE_KEY } from '#lib/relationships/type-keys.js';
	import { isChoiceOfLink } from '#lib/relationships/type-options.js';
	import { INPUT } from '../ui/inputs';
	import ParentKindField from './ParentKindField.svelte';
	import type { ExclusionOf, PersonPageData, RelationshipChoices } from './types';

	/*
	 * Correcting one link on the People card (docs/dev/02 §2.4): its type, both sides again, its
	 * specifics, and — while it is a parent link — its kind.
	 */
	interface Props {
		rel: PersonPageData['relationships'][number];
		relationshipChoices: RelationshipChoices;
		exclusionOf: ExclusionOf;
		nameOfContact: (contactId: string) => string;
		enhanced: SubmitFunction;
		oncancel: () => void;
	}
	let { rel, relationshipChoices, exclusionOf, nameOfContact, enhanced, oncancel }: Props =
		$props();

	const t = useTranslate();
	/** The entry the type select stands on; read, not bound, like the add form's. */
	let choice = $state<string | null>(null);
	const chosen = $derived(
		relationshipChoices.find((option) =>
			choice === null ? isChoiceOfLink(option, rel) : option.value === choice
		) ?? null
	);
	// The type list asks whether any kind is open; the kind chosen is checked when it is saved.
	const groups = $derived(
		groupByExclusion(relationshipChoices, (option) =>
			exclusionOf(
				option,
				rel.otherContactId,
				rel.id,
				rel.status === FORMER_RELATIONSHIP_STATUS,
				ANY_PARENT_KIND
			)
		)
	);
	// The form opens afresh per correction, so the stored kind is only where it starts.
	// svelte-ignore state_referenced_locally
	let parentKind = $state<ParentKind>(rel.parentKind ?? BIOLOGICAL_PARENT_KIND);
</script>

<form
	method="POST"
	action="?/editRelationship"
	use:enhance={enhanced}
	class="my-1 flex flex-wrap items-end gap-2 rounded-control bg-bg-sunken p-3"
>
	<input type="hidden" name="relationshipId" value={rel.id} />
	<label class="flex flex-col gap-1">
		<span class="text-xs text-fg-muted">{t('contact.relationships.typeLabel')}</span>
		<!-- Both sides again, so a partner who became a spouse — or a generation
		     entered the wrong way round — is one pick, not a re-entry (docs/dev/02 §2.4). -->
		<select
			name="typeChoice"
			class={INPUT}
			onchange={(event) => (choice = event.currentTarget.value)}
		>
			{#each groups as group (group.options[0].value)}
				{#if group.exclusion}
					<optgroup
						label={t('relationships.blocked.group', {
							reason: exclusionLabel(t, group.exclusion, nameOfContact)
						})}
					>
						{#each group.options as option (option.value)}
							<option value={option.value} disabled>
								{relationshipTypeLabel(t, option.type, option.side)}
							</option>
						{/each}
					</optgroup>
				{:else}
					{#each group.options as option (option.value)}
						<option value={option.value} selected={option.value === chosen?.value}>
							{relationshipTypeLabel(t, option.type, option.side)}
						</option>
					{/each}
				{/if}
			{/each}
		</select>
	</label>
	{#if chosen?.type.key === PARENT_CHILD_TYPE_KEY}
		<ParentKindField value={parentKind} onchange={(kind) => (parentKind = kind)} />
	{/if}
	<label class="flex min-w-40 flex-1 flex-col gap-1">
		<span class="text-xs text-fg-muted">{t('contact.relationships.howConnect')}</span>
		<input
			name="description"
			value={rel.description ?? ''}
			placeholder={t('contact.relationships.howConnectPlaceholder')}
			class={INPUT}
		/>
	</label>
	<label class="flex flex-col gap-1">
		<span class="text-xs text-fg-muted">{t('contact.relationships.sinceLabel')}</span>
		<DateField
			name="sinceDate"
			value={rel.sinceDate ?? ''}
			label={t('contact.relationships.sinceLabel')}
		/>
	</label>
	<label class="flex flex-col gap-1">
		<span class="text-xs text-fg-muted">{t('contact.relationships.untilLabel')}</span>
		<DateField
			name="untilDate"
			value={rel.untilDate ?? ''}
			label={t('contact.relationships.untilLabel')}
		/>
	</label>
	<label class="flex flex-col gap-1">
		<span class="text-xs text-fg-muted">{t('contact.relationships.status')}</span>
		<select name="status" class={INPUT}>
			{#each RELATIONSHIP_STATUSES as status (status)}
				<option value={status} selected={rel.status === status}>
					{relationshipStatusLabel(t, status)}
				</option>
			{/each}
		</select>
	</label>
	<Button variant="primary" size="sm">{t('common.save')}</Button>
	<Button type="button" variant="ghost" size="sm" onclick={oncancel}>
		{t('common.cancel')}
	</Button>
</form>
