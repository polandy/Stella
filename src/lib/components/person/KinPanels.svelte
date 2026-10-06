<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KinSuggestions from '$lib/components/KinSuggestions.svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import { answerKey } from '$lib/relationships/answer-key';
	import type { AnsweredClaims } from '$lib/relationships/answered';
	import { parentsOnRecord } from '$lib/relationships/multi-pick';
	import { CURRENT_RELATIONSHIP_STATUS } from '$lib/relationships/status';
	import { PARENT_CHILD_TYPE_KEY } from '$lib/relationships/type-keys';
	import { encodeRelationshipChoice } from '$lib/relationships/type-options';
	import { derivedShownWhenFolded } from '$lib/relationships/people-groups';
	import { addAllBatches, type AddAllBatch } from '$lib/suggestions/add-all';
	import { claimEndpoints, confirmedClaimFor, directClaimFor } from '$lib/kinship/claims';
	import { directClaimLabel, kinshipLabel } from '$lib/kinship/labels';
	import { usePending } from '$lib/sync/context.svelte';
	import { trackPending } from '$lib/sync/pending';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { announceSavedBatch, relationshipIdsOf } from './saved-batch';
	import type { PersonPageData } from './types';

	/*
	 * What the relationships card works out rather than holds (docs/02 §2.4.1): the links the
	 * one just added implies, the on-demand review, and the kin derived from the entered links.
	 */
	let {
		data,
		editing,
		expanded
	}: {
		data: PersonPageData;
		/** The card's edit mode, which also puts *Confirm* on every worked-out relative. */
		editing: boolean;
		/** Unfolded by the card's *Show more*; folded, only the first worked-out relatives show. */
		expanded: boolean;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const removals = useRemovals();
	// The shell's one activity indicator, which every change to the graph reports to (docs/05 §5.7).
	const graphPending = usePending();
	const shownKin = $derived(
		data.derivedKin.slice(0, derivedShownWhenFolded(data.derivedKin.length, expanded))
	);
	// A worked-out relative is often on the map too, wearing their face there.
	const photoById = $derived(
		new Map(data.graph.nodes.map((node) => [node.id, node.avatarPhotoId ?? null]))
	);

	/*
	 * Confirming a worked-out relative re-reads the page where the reader is. The action ends in
	 * a redirect for a browser without script; following it would jump to the section's anchor,
	 * so it is answered by reloading the data instead of navigating.
	 */
	const confirmKin = trackPending(graphPending, () => async ({ result, update }) => {
		if (result.type !== 'redirect') return update();
		await invalidateAll();
		removals.notify(t('components.saved'));
	});

	/*
	 * *Add all* (docs/concepts/multi-pick-relationships.html D7): the claims of the *Also true?*
	 * block that one batch can store, still listed and answerable row by row above. Worked out
	 * from the rows still standing — one already answered in its undo window is not sent twice.
	 */
	let answered = $state<AnsweredClaims>({});
	/** Batches sent while Stella was out of reach: kept on the device, so not offered again. */
	let keptBatches = $state<string[]>([]);
	const batchKey = (batch: AddAllBatch) =>
		`${batch.side}:${batch.subjectId}:${batch.targetIds.join(',')}`;
	const parentType = $derived(
		data.relationshipTypes.find((type) => type.key === PARENT_CHILD_TYPE_KEY) ?? null
	);
	const batches = $derived(
		parentType
			? addAllBatches(
					data.proposals.filter(
						(s) => s.dismissed === null && !answered[answerKey(s.relation, s.fromId, s.toId)]
					),
					(childId) => parentsOnRecord(data.exclusionFacts, childId)
				).filter((batch) => !keptBatches.includes(batchKey(batch)))
			: []
	);
	/** Everyone a proposal names, by id, for the batch's sentence. */
	const proposedName = (id: string) =>
		data.proposals.find((s) => s.fromId === id)?.fromName ??
		data.proposals.find((s) => s.toId === id)?.toName ??
		'';
	const names = (ids: readonly string[]) =>
		new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(ids.map(proposedName));
	const batchSentence = (batch: AddAllBatch) =>
		batch.side === 'reverse'
			? t('contact.relationships.addAllParentsOf', {
					parents: names(batch.targetIds),
					child: proposedName(batch.subjectId)
				})
			: t('contact.relationships.addAllChildrenOf', {
					parent: proposedName(batch.subjectId),
					children: names(batch.targetIds)
				});

	/** One `relationship.addMany`, through the outbox like every adding form: one toast, one *Undo*. */
	const addAll = (batch: AddAllBatch, typeId: string) =>
		keepable(
			{
				toCommand: (_fields, id) => ({
					id,
					type: 'relationship.addMany',
					payload: {
						contactId: batch.subjectId,
						typeChoice: encodeRelationshipChoice(typeId, batch.side),
						status: CURRENT_RELATIONSHIP_STATUS,
						description: null,
						links: batch.targetIds.map((targetId) => ({ targetId, sinceDate: null }))
					},
					issuedAt: Date.now()
				}),
				about: batchSentence(batch),
				errorKey: 'error',
				pending: graphPending,
				onApplied: (result) =>
					announceSavedBatch(
						{ contactId: c.id, removals, pending: graphPending, t },
						relationshipIdsOf(result)
					),
				onKept: () => (keptBatches = [...keptBatches, batchKey(batch)])
			},
			// Every batch is a command, so the plain form post below is only the no-script path.
			() =>
				async ({ update }) =>
					update()
		);
</script>

<!--
	Propagation suggestions (docs/02 §2.4.1): what the link just added implies.
	Each is one confirmation of its own — Stella never writes them by itself.
-->
{#if data.proposals.length > 0}
	<div
		class="mt-4 flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-sunken p-3"
		data-testid="kin-proposals"
		data-kin-scope
	>
		<!-- Where focus goes when the last claim here is answered (KinSuggestions). -->
		<h3
			class="text-xs font-medium tracking-wide text-fg-subtle uppercase"
			data-kin-heading
			tabindex="-1"
		>
			{t('contact.relationships.alsoTrue')}
		</h3>
		<KinSuggestions suggestions={data.proposals} propose={data.proposeFor} bind:answered />
		{#if parentType && batches.length > 0}
			<ul
				class="flex list-none flex-col gap-2 border-t border-dashed border-border pt-2"
				data-testid="kin-add-all"
			>
				{#each batches as batch (batchKey(batch))}
					<li class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
						<span class="min-w-0 text-fg-muted">{batchSentence(batch)}</span>
						<!-- Without script this posts to the subject's own page, which stores the batch the same way. -->
						<form
							method="POST"
							action="/contacts/{batch.subjectId}?/addRelationships"
							use:enhance={addAll(batch, parentType.id)}
						>
							<input
								type="hidden"
								name="typeChoice"
								value={encodeRelationshipChoice(parentType.id, batch.side)}
							/>
							<input type="hidden" name="status" value={CURRENT_RELATIONSHIP_STATUS} />
							{#each batch.targetIds as targetId (targetId)}
								<input type="hidden" name="targetId" value={targetId} />
								<input type="hidden" name="sinceDate" value="" />
							{/each}
							<Button variant="primary" size="sm" icon="add">
								{t('contact.relationships.addAll', { count: batch.targetIds.length })}
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<!--
	The on-demand review (docs/concepts/relationship-suggestions.md §6.5). Every
	other suggestion in Stella lives for one page load after a write; this is the
	control that asks the same rules what stands around this person *now*, which
	is the only way a household ever sees what follows from links entered years
	ago. It runs nothing until it is pressed.
-->
{#if data.review.open}
	<div
		class="mt-4 flex flex-col gap-3 rounded-md border border-border-subtle bg-bg-sunken p-3"
		data-testid="kin-review"
		data-kin-scope
	>
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
			<!-- Where focus goes when the last claim here is answered (KinSuggestions). -->
			<h3
				class="text-xs font-medium tracking-wide text-fg-subtle uppercase"
				data-kin-heading
				tabindex="-1"
			>
				{t('contact.relationships.reviewHeading')}
			</h3>
			<span class="text-xs text-fg-subtle">
				{t('contact.relationships.reviewOpenCount', {
					count: data.review.suggestions.filter((s) => s.dismissed === null).length
				})}
			</span>
		</div>
		{#if data.review.suggestions.length === 0}
			<p class="text-sm text-fg-muted">
				{t('contact.relationships.reviewNothing', { name: c.displayName })}
			</p>
		{:else}
			<KinSuggestions
				suggestions={data.review.suggestions}
				nameOfMember={(id) => data.review.memberNames[id] ?? null}
			/>
		{/if}
	</div>
{/if}

<!--
	Derived kinship (docs/02 §2.4.1): worked out from the entered links, and
	stored only when the household says so. Kept visually apart and labelled, so
	nobody mistakes an inference for something the household wrote down.
-->
{#if data.derivedKin.length > 0}
	<div class="@container mt-3 border-t border-border-subtle pt-2" data-testid="derived-kin">
		<h3
			class="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase"
		>
			<Icon name="explore" size={12} />{t('contact.relationships.derived')}
		</h3>
		<!--
			Laid out like the entered tiles, but quieter — a dashed ring round a faded face, the
			name in the muted colour — so an inference never passes for something typed in.
		-->
		<ul
			class="grid gap-x-3 {editing
				? 'grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3'
				: 'grid-cols-2 @lg:grid-cols-3 @3xl:grid-cols-4'}"
		>
			{#each shownKin as kin (kin.personId)}
				<!--
					Every row can become something entered. A step term is only as much as
					Stella can see — the link runs through a partner and no direct one is on
					record — so it is corrected to the direct link the household may well
					mean. Every other term is confirmed as it stands.
				-->
				{@const claim = directClaimFor(kin.term)}
				{@const confirmed = confirmedClaimFor(kin.term)}
				{@const stored = claim ?? confirmed}
				{@const via =
					kin.via.length > 0
						? t('contact.relationships.via', {
								people: kin.via.join(t('contact.relationships.viaAnd'))
							})
						: null}
				<li class="flex min-w-0 items-center gap-0.5">
					<a
						href="/contacts/{kin.personId}"
						aria-label={kin.displayName}
						aria-describedby="kin-tile-{kin.personId}"
						class="flex min-w-0 flex-1 items-center gap-2.5 rounded-control px-1 py-1 hover:bg-card-hover"
					>
						<span
							class="shrink-0 rounded-full border border-dashed border-border p-0.5 opacity-75"
							aria-hidden="true"
						>
							<Avatar
								id={kin.personId}
								name={kin.displayName}
								avatarPhotoId={photoById.get(kin.personId) ?? null}
								size={30}
							/>
						</span>
						<span class="flex min-w-0 flex-col">
							<span class="line-clamp-2 leading-tight break-words text-fg-muted"
								>{kin.displayName}</span
							>
							<span
								id="kin-tile-{kin.personId}"
								class="truncate text-xs text-fg-subtle"
								title={via ?? undefined}
							>
								{kinshipLabel(t, kin)}{#if via}{' · '}{via}{/if}
							</span>
						</span>
					</a>
					{#if editing && stored}
						{@const ends = claimEndpoints(stored, c.id, kin.personId)}
						<form
							method="POST"
							action="?/addProposedRelationship"
							use:enhance={confirmKin}
							class="shrink-0"
						>
							<input type="hidden" name="fromId" value={ends.fromId} />
							<input type="hidden" name="toId" value={ends.toId} />
							<input type="hidden" name="typeId" value={stored.typeKey} />
							{#if claim}
								<Button variant="ghost" size="sm">{directClaimLabel(t, claim)}</Button>
							{:else}
								<Button
									variant="ghost"
									size="sm"
									title={t('contact.relationships.confirmKinLabel', {
										name: kin.displayName,
										term: kinshipLabel(t, kin)
									})}
								>
									{t('contact.relationships.confirmKin')}
								</Button>
							{/if}
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
