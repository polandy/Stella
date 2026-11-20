<script lang="ts">
	import { enhance } from '#lib/forms/enhance.js';
	import PersonSearchSelect from '#lib/components/people/PersonSearchSelect.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import {
		groupSummary,
		previewRows,
		recipientsField,
		storedBirth,
		type GroupFormRow
	} from '#lib/gifts/group-form.js';
	import { GIFT_GROUP_MAX_RECIPIENTS } from '#lib/gifts/group-plan.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import type { SelectablePerson } from '#lib/people/select.js';
	import { useRemovals } from '#lib/undo/context.svelte.js';
	import { savedEnhance } from '#lib/undo/saved.js';
	import type { GiftGroupView } from '../../../routes/(app)/contacts/[id]/gift-group-view';
	import GroupPreviewRow from './GroupPreviewRow.svelte';

	/*
	 * *+ Person* in *Who has it?* (docs/dev/02 §2.25.11): the group's when, worked out for each one
	 * picked, previewed as the add form does; title, note and link come with it (F11).
	 */
	interface Props {
		group: GiftGroupView;
		people: SelectablePerson[];
		today: string;
		/** The group's when, as the panel names it. */
		rule: string;
		/** Who still has it open: they need no second one. */
		holding: readonly string[];
		onDone: () => void;
	}
	let { group, people, today, rule, holding, onDone }: Props = $props();

	const t = useI18n().t;
	const removals = useRemovals();
	let rows = $state<GroupFormRow[]>([]);
	let picked = $state<string[]>([]);

	const byId = $derived(new Map(people.map((p) => [p.id, p])));
	const birthOf = (id: string) => storedBirth(byId.get(id)?.birthDate ?? null);
	const previews = $derived(previewRows(group.when, rows, birthOf, today));
	const count = $derived(groupSummary(previews).chosen);
	const recipients = $derived(recipientsField(previews, rows));
	const offered = $derived(
		people.filter((p) => !holding.includes(p.id) && !rows.some((r) => r.contactId === p.id))
	);
	const full = $derived(holding.length + rows.length >= GIFT_GROUP_MAX_RECIPIENTS);

	function change(next: GroupFormRow) {
		rows = rows.map((row) => (row.contactId === next.contactId ? next : row));
	}
	// An action keeps its first argument: the arrow reads the count at submit.
	const added = $derived(savedEnhance(removals, t('gifts.several.noted', { count }), onDone));
</script>

<form
	method="POST"
	action="?/addGroupRecipients"
	use:enhance={(input) => added(input)}
	class="flex flex-col gap-3"
	data-testid="gift-group-add"
>
	<input type="hidden" name="groupId" value={group.id} />
	<input type="hidden" name="recipients" value={JSON.stringify(recipients)} />
	<p class="text-sm text-fg-muted">{t('gifts.group.addIntro', { rule })}</p>
	{#if !full}
		<PersonSearchSelect
			people={offered}
			name="pick"
			bind:selectedIds={picked}
			placeholder={t('gifts.several.search')}
			onPick={(person) => {
				rows = [...rows, { contactId: person.id, ticked: true }];
				picked = [];
			}}
		/>
	{/if}
	{#if previews.length}
		<ul class="divide-y divide-border" aria-label={t('gifts.several.preview')}>
			{#each previews as preview (preview.contactId)}
				{@const row = rows.find((r) => r.contactId === preview.contactId)}
				{@const person = byId.get(preview.contactId)}
				{#if row && person}
					<GroupPreviewRow
						{preview}
						{row}
						person={{ ...person, avatarPhotoId: person.avatarPhotoId ?? null }}
						unknownBirth={birthOf(person.id) === null}
						onchange={change}
					/>
				{/if}
			{/each}
		</ul>
	{/if}
	<div class="flex justify-end gap-2">
		<Button variant="ghost" size="sm" type="button" onclick={onDone}>{t('common.cancel')}</Button>
		<Button variant="primary" size="sm" disabled={count === 0}>
			{t('gifts.group.add', { count })}
		</Button>
	</div>
</form>
