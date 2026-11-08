<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PersonSearchSelect from '$lib/components/people/PersonSearchSelect.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { MentionAudience } from '$lib/mentions/audience';
	import { subjectPool } from '$lib/story/subjects';
	import type { ComposerCandidate } from '$lib/stream/composer-state';
	import {
		homeOffers,
		journalCount,
		subjectsUnfit,
		type HomeMembers
	} from '$lib/stream/composer-subjects';
	import { tick } from 'svelte';

	/*
	 * Whom the moment is about (docs/02 §2.20.3): the anchor's chip, the chips added beside it,
	 * *＋ Person*, and under them the anchor's homes offered in one tap — never preselected.
	 * Each chip posts as `subjectIds`, so the form reads the same with or without JavaScript.
	 */

	interface Props {
		anchor: Pick<ComposerCandidate, 'id' | 'displayName' | 'firstName' | 'avatarPhotoId'>;
		/** On the person's page the line names their journal; on Home the save hint does. */
		onPersonPage: boolean;
		subjectIds: readonly string[];
		candidates: readonly ComposerCandidate[];
		homes: readonly HomeMembers[];
		visibility: MentionAudience;
		onadd: (ids: string[]) => void;
		onremove: (id: string) => void;
	}
	let { anchor, onPersonPage, subjectIds, candidates, homes, visibility, onadd, onremove }: Props =
		$props();

	const t = useTranslate();
	const uid = $props.id();

	const byId = $derived(new Map(candidates.map((c) => [c.id, c])));
	const chips = $derived(
		subjectIds.flatMap((id) => {
			const person = byId.get(id);
			return person ? [person] : [];
		})
	);
	const unfit = $derived(
		new Set(subjectsUnfit(subjectIds, visibility, candidates).map((c) => c.id))
	);
	const offers = $derived(homeOffers(anchor.id, subjectIds, visibility, homes, candidates));
	const count = $derived(journalCount(anchor.id, subjectIds));
	const firstNames = (people: readonly ComposerCandidate[]) =>
		t('composer.offerNames', { names: people.map((p) => p.firstName ?? p.displayName) });
	const anchorName = $derived(anchor.firstName ?? anchor.displayName);

	let picking = $state(false);
	let pickedIds = $state<string[]>([]);
	const pool = $derived(
		subjectPool([], candidates, visibility).filter(
			(p) => p.id !== anchor.id && !subjectIds.includes(p.id)
		)
	);
	async function openPicker() {
		picking = true;
		await tick();
		document.getElementById(`${uid}-find`)?.focus();
	}
</script>

<div class="flex flex-col gap-2 px-3 pt-3 text-xs text-fg-subtle">
	<div class="flex flex-wrap items-center gap-1.5" data-anchor>
		<span role="group" aria-label={t('composer.subjects')} class="contents">
			<!-- Not removable: on a person's page the moment is theirs; on Home it is the first @. -->
			<span
				class="inline-flex items-center gap-1.5 rounded-full bg-primary-soft py-0.5 pr-2.5 pl-0.5 font-semibold text-fg"
			>
				<Avatar
					id={anchor.id}
					name={anchor.displayName}
					avatarPhotoId={anchor.avatarPhotoId}
					size={20}
				/>{anchor.displayName}
			</span>
			{#each chips as chip (chip.id)}
				<span
					class="inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 font-semibold {unfit.has(
						chip.id
					)
						? 'bg-bg text-fg-muted'
						: 'bg-primary-soft text-fg'}"
					data-subject={chip.id}
				>
					<Avatar
						id={chip.id}
						name={chip.displayName}
						avatarPhotoId={chip.avatarPhotoId}
						size={20}
					/>{chip.displayName}
					{#if unfit.has(chip.id)}<Icon name="private" size={12} />{/if}
					<input type="hidden" name="subjectIds" value={chip.id} />
					<!-- 24px square (WCAG 2.5.8); the negative margin keeps the chip its own height. -->
					<button
						type="button"
						onclick={() => onremove(chip.id)}
						aria-label={t('components.personSearch.remove', { name: chip.displayName })}
						class="-my-1 grid size-6 place-items-center rounded-full text-fg-muted hover:bg-bg hover:text-fg"
					>
						<Icon name="remove" size={12} />
					</button>
				</span>
			{/each}
		</span>
		<button
			type="button"
			onclick={openPicker}
			aria-label={t('composer.addSubjectLabel')}
			aria-expanded={picking}
			class="inline-flex min-h-6 items-center gap-1 rounded-full border border-dashed border-border px-2 text-fg-muted hover:border-primary hover:text-fg"
		>
			<Icon name="add" size={12} />{t('composer.addSubject')}
		</button>
		{#if count > 1}
			<span>{t('composer.goesToJournals', { count })}</span>
		{:else if onPersonPage}
			<span>{t('composer.anchorGoesTo', { name: anchorName })}</span>
		{/if}
	</div>

	{#each offers as offer (offer.homeId)}
		<p
			class="flex flex-wrap items-center gap-1.5 rounded-control bg-bg px-2 py-1.5"
			data-home-offer
		>
			<Icon name="home" size={14} />
			<button
				type="button"
				onclick={() => onadd(offer.take.map((p) => p.id))}
				aria-label={t('composer.offerTake', { names: firstNames(offer.take) })}
				class="inline-flex min-h-6 items-center gap-1 font-semibold text-link hover:underline"
			>
				<Icon name="add" size={12} />{firstNames(offer.take)}
			</button>
			<span>{t('composer.offerLiveWith', { count: offer.take.length, name: anchorName })}</span>
			{#if offer.privateOnly.length}
				<span class="inline-flex items-center gap-1">
					<Icon name="private" size={12} />{t('composer.privateOnly', {
						names: firstNames(offer.privateOnly)
					})}
				</span>
			{/if}
		</p>
	{/each}

	{#if picking}
		<PersonSearchSelect
			id="{uid}-find"
			people={pool}
			name="subjectPick"
			bind:selectedIds={pickedIds}
			placeholder={t('composer.findPerson')}
			onPick={(person) => {
				onadd([person.id]);
				pickedIds = [];
				picking = false;
			}}
		/>
	{/if}
</div>
