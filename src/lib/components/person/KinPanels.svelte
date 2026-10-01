<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KinSuggestions from '$lib/components/KinSuggestions.svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { claimEndpoints, confirmedClaimFor, directClaimFor } from '$lib/kinship/claims';
	import { directClaimLabel, kinshipLabel } from '$lib/kinship/labels';
	import { usePending } from '$lib/sync/context.svelte';
	import { trackPending } from '$lib/sync/pending';
	import { useRemovals } from '$lib/undo/context.svelte';
	import type { PersonPageData } from './types';

	/*
	 * What the relationships card works out rather than holds (docs/02 §2.4.1): the links the
	 * one just added implies, the on-demand review, and the kin derived from the entered links.
	 */
	let { data }: { data: PersonPageData } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const removals = useRemovals();
	// The shell's one activity indicator, which every change to the graph reports to (docs/05 §5.7).
	const graphPending = usePending();

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
</script>

<!--
	Propagation suggestions (docs/02 §2.4.1): what the link just added implies.
	Each is one confirmation of its own — Stella never writes them by itself.
-->
{#if data.proposals.length > 0}
	<div class="mt-4 flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-sunken p-3" data-testid="kin-proposals" data-kin-scope>
		<!-- Where focus goes when the last claim here is answered (KinSuggestions). -->
		<h3 class="text-xs font-medium uppercase tracking-wide text-fg-subtle" data-kin-heading tabindex="-1">
			{t('contact.relationships.alsoTrue')}
		</h3>
		<KinSuggestions suggestions={data.proposals} propose={data.proposeFor} />
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
	<div class="mt-4 flex flex-col gap-3 rounded-md border border-border-subtle bg-bg-sunken p-3" data-testid="kin-review" data-kin-scope>
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
			<!-- Where focus goes when the last claim here is answered (KinSuggestions). -->
			<h3 class="text-xs font-medium uppercase tracking-wide text-fg-subtle" data-kin-heading tabindex="-1">
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
	<div class="mt-4 border-t border-border-subtle pt-3" data-testid="derived-kin">
		<h3 class="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
			<Icon name="explore" size={12} />{t('contact.relationships.derived')}
		</h3>
		<ul class="flex flex-col divide-y divide-border-subtle">
			{#each data.derivedKin as kin (kin.personId)}
				<!--
					Every row can become something entered. A step term is only as much as
					Stella can see — the link runs through a partner and no direct one is on
					record — so it is corrected to the direct link the household may well
					mean. Every other term is confirmed as it stands.
				-->
				{@const claim = directClaimFor(kin.term)}
				{@const confirmed = confirmedClaimFor(kin.term)}
				{@const stored = claim ?? confirmed}
				<!--
					Laid out like an entered row — the dot's column, the label's width, the
					actions in the same place — so *Confirm* lines up under *Edit*.
				-->
				<li class="flex flex-col gap-0.5 py-2 text-sm">
					<div class="flex items-center gap-3">
						<span class="size-2 shrink-0" aria-hidden="true"></span>
						<span class="w-24 shrink-0 truncate text-fg-muted">{kinshipLabel(t, kin)}</span>
						<a href="/contacts/{kin.personId}" class="font-medium text-fg hover:underline">
							{kin.displayName}
						</a>
						{#if stored}
							{@const ends = claimEndpoints(stored, c.id, kin.personId)}
							<form
								method="POST"
								action="?/addProposedRelationship"
								use:enhance={confirmKin}
								class="ml-auto flex shrink-0 items-center gap-1"
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
								<!-- Holds the remove button's place, so the action ends where Edit does. -->
								<span class="invisible" aria-hidden="true">
									<Button type="button" variant="danger" size="sm" icon="remove" tabindex={-1} />
								</span>
							</form>
						{/if}
					</div>
					<!-- Under the name, so a long "via" never pushes the action out of line. -->
					{#if kin.via.length > 0}
						<span class="truncate pl-32 text-fg-subtle">
							{t('contact.relationships.via', {
								people: kin.via.join(t('contact.relationships.viaAnd'))
							})}
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
