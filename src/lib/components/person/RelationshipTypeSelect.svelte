<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { Exclusion } from '$lib/relationships/exclusions';
	import { exclusionLabel, relationshipTypeLabel } from '$lib/relationships/labels';
	import { groupByExclusion } from '$lib/relationships/picker-groups';
	import { INPUT } from './inputs';
	import type { RelationshipChoices } from './types';

	/*
	 * The add form's type field: both directions of an asymmetric type, so "is a child of" needs
	 * no detour via the other profile (docs/02 §2.4), with the entries the records rule out for
	 * everyone picked grouped under why, greyed out.
	 *
	 * Read, not bound: binding would hand the select a value of its own before anybody has
	 * chosen, and an unmatched one deselects every option — the form would then post no type at
	 * all. `selected` still has to follow the choice, because picking another person regroups the
	 * entries and a rebuilt option loses the selection the DOM was holding.
	 */

	interface Props {
		choices: RelationshipChoices;
		/** The entry picked, or empty while the field stands untouched on its first one. */
		chosen: string;
		/** Why an entry is ruled out for everyone picked, or null when it is not. */
		forEveryone: (option: RelationshipChoices[number]) => Exclusion | null;
		nameOfContact: (contactId: string) => string;
		onchoose: (value: string) => void;
	}
	let { choices, chosen, forEveryone, nameOfContact, onchoose }: Props = $props();

	const t = useTranslate();
</script>

<select name="typeChoice" onchange={(event) => onchoose(event.currentTarget.value)} class={INPUT}>
	{#each groupByExclusion(choices, forEveryone) as group (group.options[0].value)}
		{#if group.exclusion}
			<optgroup
				label={t('relationships.blocked.group', {
					reason: exclusionLabel(t, group.exclusion, nameOfContact)
				})}
			>
				{#each group.options as option (option.value)}
					<option value={option.value} selected={option.value === chosen} disabled>
						{relationshipTypeLabel(t, option.type, option.side)}
					</option>
				{/each}
			</optgroup>
		{:else}
			{#each group.options as option (option.value)}
				<option value={option.value} selected={option.value === chosen}>
					{relationshipTypeLabel(t, option.type, option.side)}
				</option>
			{/each}
		{/if}
	{/each}
</select>
