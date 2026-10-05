<script lang="ts">
	import { reveal } from '$lib/motion/motion.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import { enhance } from '$app/forms';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import {
		exclusionLabel,
		relationshipStatusLabel,
		relationshipTypeLabel
	} from '$lib/relationships/labels';
	import { foldPeople, groupPeople } from '$lib/relationships/people-groups';
	import { groupByExclusion } from '$lib/relationships/picker-groups';
	import { otherEndRole, relationshipRoleLabel } from '$lib/relationships/roles';
	import { FORMER_RELATIONSHIP_STATUS, RELATIONSHIP_STATUSES } from '$lib/relationships/status';
	import { offersTogether } from '$lib/immich/together';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { isChoiceOfLink } from '$lib/relationships/type-options';
	import { usePending } from '$lib/sync/context.svelte';
	import { trackPending } from '$lib/sync/pending';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import type { ExclusionOf, PersonPageData, RelationshipChoices } from './types';

	/*
	 * The People card's list (docs/05 §5.5): everybody this person is tied to, as a face, a name
	 * and what they are to this person — grouped by the kind of tie, two abreast on a phone and
	 * more on a wide card, folded to a handful once there are enough of them to push the photos
	 * away. The rows are quiet: correcting or removing one is the card's *Edit* mode, which puts
	 * both on every row at once (docs/02 §2.4).
	 */
	let {
		data,
		visibleRelationships,
		relationshipChoices,
		exclusionOf,
		nameOfContact,
		editing,
		expanded,
		showTogether,
		relateOpen = $bindable()
	}: {
		data: PersonPageData;
		/** The person's links, less any on its way out (docs/02 §2.23). */
		visibleRelationships: PersonPageData['relationships'];
		relationshipChoices: RelationshipChoices;
		exclusionOf: ExclusionOf;
		/** Whoever a reason is about; both people are on the page already. */
		nameOfContact: (contactId: string) => string;
		/** The card's edit mode: every row offers *Edit* and remove. */
		editing: boolean;
		/** Unfolded by the card's *Show more*; folded, only the first few show. */
		expanded: boolean;
		/** Whether the card's add form is open; the empty state offers to open it. */
		relateOpen: boolean;
		/** *Together*: the Photos card shows this person's photos with the one named. */
		showTogether: (contactId: string) => void;
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

	// The face each person wears on the map, from the graph slice the page already holds.
	const photoById = $derived(
		new Map(data.graph.nodes.map((node) => [node.id, node.avatarPhotoId ?? null]))
	);
	/** A household's own type has no role noun; its far side's own words stand in. */
	function otherSideLabel(rel: PersonPageData['relationships'][number]): string | undefined {
		const type = data.relationshipTypes.find((candidate) => candidate.id === rel.typeId);
		if (!type) return undefined;
		return rel.side === 'forward' ? type.reverseLabel : type.forwardLabel;
	}
	const rows = $derived(
		visibleRelationships.map((rel) => ({
			...rel,
			role: otherEndRole(rel),
			roleLabel: relationshipRoleLabel(
				t,
				rel,
				data.tieWording[rel.otherContactId] ?? 'neutral',
				otherSideLabel(rel)
			)
		}))
	);

	/** Which relationship has its details open for correction; one at a time. */
	let editingRelationship = $state<string | null>(null);
	// Leaving edit mode closes an open correction with it, so it never waits behind a quiet row.
	$effect(() => {
		if (!editing) editingRelationship = null;
	});
	const savedRelationshipEdit = trackPending(
		graphPending,
		savedEnhance(removals, t('components.saved'), () => (editingRelationship = null))
	);

	// A fold never hides a row whose correction is open.
	const groups = $derived(groupPeople(rows));
	const folded = $derived(foldPeople(groups, expanded || editingRelationship !== null));

	/*
	 * *Together* (docs/02 §2.24.8): on the row of a partner, a spouse, a parent or a child who is in
	 * Immich too, a quiet photo button that switches the Photos card's strip to the photos of the two
	 * of them. Icon-only, like the row's edit buttons, so a phone's two columns keep the name; its
	 * label says whose photos. Not offline, where nothing from Immich is shown, and not in edit mode.
	 */
	const togetherWith = $derived(new Set(data.immich?.togetherWith ?? []));
	const offersTogetherOn = (rel: (typeof rows)[number]) =>
		!editing && reachability.reachable && togetherWith.has(rel.otherContactId) && offersTogether(rel);
	const firstNameOf = (contactId: string, fallback: string) =>
		data.people.find((person) => person.id === contactId)?.firstName || fallback;
	function togetherLabel(rel: (typeof rows)[number]): string {
		const other = firstNameOf(rel.otherContactId, rel.otherDisplayName);
		const own = c.firstName || c.displayName;
		const selfId = data.user.selfContactId;
		if (rel.otherContactId === selfId) return t('immich.together.rowLabelWithYou', { name: own });
		if (c.id === selfId) return t('immich.together.rowLabelWithYou', { name: other });
		return t('immich.together.rowLabelPair', { first: own, second: other });
	}

	/** What the line under a name says: the role first, then what else the link carries. */
	const detailsOf = (rel: (typeof rows)[number]): string =>
		[
			rel.roleLabel,
			rel.status === FORMER_RELATIONSHIP_STATUS ? relationshipStatusLabel(t, rel.status) : null,
			rel.description,
			rel.sinceDate ? t('contact.relationships.since', { day: dayLabel(i18n, rel.sinceDate) }) : null
		]
			.filter(Boolean)
			.join(' · ');
</script>

{#if visibleRelationships.length > 0}
	<div class="@container flex flex-col gap-3" data-testid="relationship-list">
		{#each folded.groups as group (group.group)}
			<section class="flex flex-col gap-1" aria-labelledby="people-group-{group.group}">
				<h3
					id="people-group-{group.group}"
					class="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase"
				>
					{t(`contact.relationships.group.${group.group}`)} · {group.total}
				</h3>
				<!-- Edit mode gives every row its two buttons, so a row gets more of the width. -->
				<ul
					class="grid gap-x-3 {editing
						? 'grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3'
						: 'grid-cols-2 @lg:grid-cols-3 @3xl:grid-cols-4'}"
				>
					{#each group.rows as rel (rel.id)}
						<li class="flex min-w-0 items-center gap-0.5">
							<!-- The face and the name are one link, so the target is the whole tile. -->
							<!-- Named by the person, described by the line under it: "Lena Brunner", "Daughter". -->
							<a
								href="/contacts/{rel.otherContactId}"
								aria-label={rel.otherDisplayName}
								aria-describedby="people-tile-{rel.id}"
								class="flex min-w-0 flex-1 items-center gap-2.5 rounded-control px-1 py-1 hover:bg-card-hover"
							>
								<!-- The name follows, so the face is not read out a second time. -->
								<span class="shrink-0" aria-hidden="true">
									<Avatar
										id={rel.otherContactId}
										name={rel.otherDisplayName}
										avatarPhotoId={photoById.get(rel.otherContactId) ?? null}
										size={36}
									/>
								</span>
								<span class="flex min-w-0 flex-col">
									<span class="line-clamp-2 leading-tight font-medium break-words text-fg">
										{rel.otherDisplayName}
									</span>
									<!-- Cut short, never wrapped: the role is what the line is for. -->
									<span id="people-tile-{rel.id}" class="truncate text-xs text-fg-subtle" title={detailsOf(rel)}>
										{detailsOf(rel)}
									</span>
								</span>
							</a>
							{#if offersTogetherOn(rel)}
								<Button
									type="button"
									variant="ghost"
									size="sm"
									icon="photo"
									label={togetherLabel(rel)}
									title={t('immich.together.row')}
									data-testid="immich-together-row"
									onclick={() => showTogether(rel.otherContactId)}
								/>
							{/if}
							{#if editing}
								<span class="flex shrink-0 items-center">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										icon="rename"
										label={t('contact.relationships.editLink', { name: rel.otherDisplayName })}
										aria-expanded={editingRelationship === rel.id}
										onclick={() =>
											(editingRelationship = editingRelationship === rel.id ? null : rel.id)}
									/>
									<RemoveButton
										kind="relationship"
										id={rel.id}
										action="?/removeRelationship"
										pending={graphPending}
										fields={{ relationshipId: rel.id }}
										label={t('contact.relationships.remove', { name: rel.otherDisplayName })}
										removed={t('contact.relationships.removed')}
									/>
								</span>
							{/if}
						</li>
						{#if editingRelationship === rel.id}
							<!-- Across the whole grid, under the tile it corrects. -->
							<li class="col-span-full" transition:reveal>
								<form
									method="POST"
									action="?/editRelationship"
									use:enhance={savedRelationshipEdit}
									class="my-1 flex flex-wrap items-end gap-2 rounded-control bg-bg-sunken p-3"
								>
									<input type="hidden" name="relationshipId" value={rel.id} />
									<label class="flex flex-col gap-1">
										<span class="text-xs text-fg-muted">{t('contact.relationships.typeLabel')}</span>
										<!-- Both sides again, so a partner who became a spouse — or a generation
										     entered the wrong way round — is one pick, not a re-entry (docs/02 §2.4). -->
										<select name="typeChoice" class={INPUT}>
											{#each groupByExclusion(relationshipChoices, (option) => exclusionOf(option, rel.otherContactId, rel.id)) as choices (choices.options[0].value)}
												{#if choices.exclusion}
													<optgroup
														label={t('relationships.blocked.group', {
															reason: exclusionLabel(t, choices.exclusion, nameOfContact)
														})}
													>
														{#each choices.options as option (option.value)}
															<option value={option.value} disabled>
																{relationshipTypeLabel(t, option.type, option.side)}
															</option>
														{/each}
													</optgroup>
												{:else}
													{#each choices.options as option (option.value)}
														<option value={option.value} selected={isChoiceOfLink(option, rel)}>
															{relationshipTypeLabel(t, option.type, option.side)}
														</option>
													{/each}
												{/if}
											{/each}
										</select>
									</label>
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
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onclick={() => (editingRelationship = null)}
									>
										{t('common.cancel')}
									</Button>
								</form>
							</li>
						{/if}
					{/each}
				</ul>
			</section>
		{/each}

	</div>
{:else}
	<!-- In place of the map: what it would show, and the step that starts it. -->
	<EmptyState
		compact
		icon="graph"
		title={t('contact.relationships.none', { name: c.displayName })}
		hint={t('contact.relationships.noneHint')}
	>
		{#if !relateOpen}
			<Button variant="primary" size="sm" icon="add" type="button" onclick={() => (relateOpen = true)}>
				{t('contact.relationships.addFirst', { name: c.displayName })}
			</Button>
		{/if}
	</EmptyState>
{/if}
