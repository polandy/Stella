<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import RelationshipMap from '$lib/components/graph/RelationshipMap.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import { enhance } from '$app/forms';
	import { dayLabel } from '$lib/dates/labels';
	import { categoryVar } from '$lib/design/tokens';
	import { withoutRelationships } from '$lib/graph/model/without-pending';
	import { useI18n } from '$lib/i18n/context.svelte';
	import {
		exclusionLabel,
		relationshipRowLabel,
		relationshipStatusLabel,
		relationshipTypeLabel
	} from '$lib/relationships/labels';
	import { groupByExclusion } from '$lib/relationships/picker-groups';
	import { FORMER_RELATIONSHIP_STATUS, RELATIONSHIP_STATUSES } from '$lib/relationships/status';
	import { isChoiceOfLink } from '$lib/relationships/type-options';
	import { usePending } from '$lib/sync/context.svelte';
	import { trackPending } from '$lib/sync/pending';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import type { ExclusionOf, PersonPageData, RelationshipChoices } from './types';

	// The relationships card's map and its rows, each correctable in place (docs/02 §2.4).
	let {
		data,
		visibleRelationships,
		relationshipChoices,
		exclusionOf,
		nameOfContact,
		relateOpen = $bindable()
	}: {
		data: PersonPageData;
		/** The person's links, less any on its way out (docs/02 §2.23). */
		visibleRelationships: PersonPageData['relationships'];
		relationshipChoices: RelationshipChoices;
		exclusionOf: ExclusionOf;
		/** Whoever a reason is about; both people are on the page already. */
		nameOfContact: (contactId: string) => string;
		/** Whether the card's add form is open; the empty state offers to open it. */
		relateOpen: boolean;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const removals = useRemovals();
	/*
	 * Changing a relationship reloads the person's graph, and on a household with many links
	 * that reload is slow enough to look like nothing happened. Every path that changes it —
	 * the add form, a correction, a removal once its undo window has passed — is reported to
	 * the shell, which shows one activity indicator for the whole app (docs/05 §5.7). Nothing
	 * on this page moves while it runs.
	 */
	const graphPending = usePending();

	// One map node per connected person (a person may hold several relationship types; the
	// map shows them once, keeping the first label). The face comes from the graph slice,
	// which already carries every visible person's avatar — so the first paint wears the same
	// faces the interactive map does, rather than swapping initials for photos as it loads.
	const photoById = $derived(
		new Map(data.graph.nodes.map((node) => [node.id, node.avatarPhotoId ?? null]))
	);
	/*
	 * A removal is held for its undo window before it is sent (docs/02 §2.23), and the list
	 * hides the row for that whole window. The map agrees with the list: were it to keep the
	 * link, it would vanish by itself eight seconds later, which reads as a slow save rather
	 * than a window that was there to be used.
	 */
	const pendingRelationships = $derived(
		new Set(
			data.relationships
				.filter((r) => removals.isPending(removalKey('relationship', r.id)))
				.map((r) => r.id)
		)
	);
	const visibleGraph = $derived(withoutRelationships(data.graph, pendingRelationships, c.id));
	const egoNodes = $derived.by(() => {
		const seen = new Set<string>();
		const out: {
			id: string;
			name: string;
			label: string;
			category: string;
			avatarPhotoId: string | null;
		}[] = [];
		for (const r of data.relationships) {
			if (pendingRelationships.has(r.id)) continue;
			if (seen.has(r.otherContactId)) continue;
			seen.add(r.otherContactId);
			out.push({
				id: r.otherContactId,
				name: r.otherDisplayName,
				label: relationshipRowLabel(t, r),
				category: r.category,
				avatarPhotoId: photoById.get(r.otherContactId) ?? null
			});
		}
		return out;
	});

	/** Which relationship has its details open for correction; one at a time. */
	let editingRelationship = $state<string | null>(null);
	const savedRelationshipEdit = trackPending(
		graphPending,
		savedEnhance(removals, t('components.saved'), () => (editingRelationship = null))
	);
</script>

{#if visibleRelationships.length > 0}
	<!--
		The map first, the list under it: who this person is connected to is a shape
		before it is twelve rows, and the rows are what you come back to in order to
		correct one (docs/05 §5.5). It draws as plain SVG and becomes the interactive
		explorer once the engine has loaded.
	-->
	{#if egoNodes.length > 0}
		<div class="mb-3">
			<!--
				Keyed on the person: opening a profile from the map's peek panel is a
				navigation within this same route, so without a remount the explorer would
				keep the previous person's graph — and its open panel — over the new page.
			-->
			{#key c.id}
				<RelationshipMap
					centerId={c.id}
					centerName={c.displayName}
					centerPhotoId={c.avatarPhotoId}
					graph={visibleGraph}
					nodes={egoNodes}
					fullGraphHref={(nodeId) => `/graph?center=${nodeId}`}
				/>
			{/key}
		</div>
	{/if}

	<ul class="flex flex-col divide-y divide-border-subtle">
		{#each visibleRelationships as rel (rel.id)}
			<li class="flex flex-col gap-1 py-2 text-sm">
				<div class="flex items-center gap-3">
					<span
						class="size-2 shrink-0 rounded-full"
						style="background:{categoryVar(rel.category)}"
					></span>
					<span class="w-24 shrink-0 truncate text-fg-muted">
						{relationshipRowLabel(t, rel)}
					</span>
					<a href="/contacts/{rel.otherContactId}" class="font-medium text-fg hover:underline">
						{rel.otherDisplayName}
					</a>
					{#if rel.description}
						<span class="truncate text-fg-subtle">· {rel.description}</span>
					{/if}
					{#if rel.sinceDate}
						<span class="shrink-0 text-fg-subtle">
							· {t('contact.relationships.since', { day: dayLabel(i18n, rel.sinceDate) })}
						</span>
					{/if}
					{#if rel.status === FORMER_RELATIONSHIP_STATUS}
						<span class="shrink-0 rounded-full bg-bg-sunken px-2 py-0.5 text-xs text-fg-muted">
							{relationshipStatusLabel(t, rel.status)}
						</span>
					{/if}
					<div class="ml-auto flex shrink-0 items-center gap-1">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							aria-expanded={editingRelationship === rel.id}
							onclick={() =>
								(editingRelationship = editingRelationship === rel.id ? null : rel.id)}
						>
							{editingRelationship === rel.id ? t('common.cancel') : t('common.edit')}
						</Button>
						<RemoveButton
							kind="relationship"
							id={rel.id}
							action="?/removeRelationship"
							pending={graphPending}
							fields={{ relationshipId: rel.id }}
							label={t('contact.relationships.remove', { name: rel.otherDisplayName })}
							removed={t('contact.relationships.removed')}
						/>
					</div>
				</div>

				{#if editingRelationship === rel.id}
					<form
						method="POST"
						action="?/editRelationship"
						use:enhance={savedRelationshipEdit}
						class="flex flex-wrap items-end gap-2 pl-5"
					>
						<input type="hidden" name="relationshipId" value={rel.id} />
						<label class="flex flex-col gap-1">
							<span class="text-xs text-fg-muted">{t('contact.relationships.typeLabel')}</span>
							<!-- Both sides again, so a partner who became a spouse — or a generation
							     entered the wrong way round — is one pick, not a re-entry (docs/02 §2.4). -->
							<select name="typeChoice" class={INPUT}>
								{#each groupByExclusion(relationshipChoices, (option) => exclusionOf(option, rel.otherContactId, rel.id)) as group (group.options[0].value)}
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
											<option
												value={option.value}
												selected={isChoiceOfLink(option, rel)}
											>
												{relationshipTypeLabel(t, option.type, option.side)}
											</option>
										{/each}
									{/if}
								{/each}
							</select>
						</label>
						<label class="flex flex-1 flex-col gap-1">
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
					</form>
				{/if}
			</li>
		{/each}
	</ul>

	{:else}
	<!-- In place of the map: what it would show, and the step that starts it. -->
	<EmptyState compact icon="graph" title={t('contact.relationships.none', { name: c.displayName })} hint={t('contact.relationships.noneHint')}>
		{#if !relateOpen}
			<Button variant="primary" size="sm" icon="add" type="button" onclick={() => (relateOpen = true)}>{t('contact.relationships.addFirst', { name: c.displayName })}</Button>
		{/if}
	</EmptyState>
{/if}
