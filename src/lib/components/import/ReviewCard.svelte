<script lang="ts">
	import { untrack } from 'svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { cardFacts } from '$lib/import-match/card-facts';
	import type { ContactSource } from '$lib/import-match/card';
	import type { Conflict } from '$lib/import-match/merge-plan';
	import type { ReviewAnswer, ReviewCandidate, ReviewCard } from '$lib/import-match/review';
	import FactList from './FactList.svelte';
	import PersonPicker from './PersonPicker.svelte';
	import { dateText, factValue } from './review-text';

	/*
	 * One incoming contact of the review (docs/02 §2.16): the card on one side, who it may be
	 * on the other, and the four answers. An answer folds the card to one line; *Change* opens
	 * it again with the answer kept.
	 */
	interface Props {
		item: ReviewCard;
		source: ContactSource;
		token: string;
		answer: ReviewAnswer | undefined;
		closed: boolean;
		onanswer: (answer: ReviewAnswer) => void;
		onreopen: () => void;
		ontake: (kind: Conflict['kind'], take: boolean) => void;
	}
	let { item, source, token, answer, closed, onanswer, onreopen, ontake }: Props = $props();

	/** How sure the match is, at a glance: green for sure, amber for a guess, plain for new. */
	const BADGE: Record<ReviewCard['kind'], string> = {
		linked: 'bg-success text-primary-fg',
		strong: 'bg-success text-primary-fg',
		weak: 'bg-warning-soft text-fg',
		several: 'bg-warning-soft text-fg',
		none: 'bg-primary-soft text-fg'
	};
	const FROM = {
		'vcard:google': 'google',
		'vcard:nextcloud': 'nextcloud',
		'vcard:other': 'other'
	} as const satisfies Record<ContactSource, string>;

	const i18n = useI18n();
	const t = i18n.t;
	const key = $derived(item.card.key);

	/** Who the card is shown against: the answer's person, else the one suggestion. */
	function initialPerson(): ReviewCandidate | null {
		if (answer?.kind === 'same')
			return item.candidates.find((c) => c.personId === answer.personId) ?? null;
		return item.kind === 'several' ? null : (item.candidates[0] ?? null);
	}
	let person = $state<ReviewCandidate | null>(untrack(initialPerson));
	let takeCard = $state<Conflict['kind'][]>(
		untrack(() => (answer?.kind === 'same' ? [...answer.takeCard] : []))
	);
	let picking = $state(false);

	function choose(candidate: ReviewCandidate) {
		person = candidate;
		takeCard = [];
		picking = false;
	}

	function take(kind: Conflict['kind'], card: boolean) {
		takeCard = card
			? [...takeCard.filter((k) => k !== kind), kind]
			: takeCard.filter((k) => k !== kind);
		// A card already *Same person* (a strong match) keeps the choice without being folded.
		if (answer?.kind === 'same' && answer.personId === person?.personId) ontake(kind, card);
	}

	const why = $derived.by(() => {
		if (item.kind === 'linked') return t('import.review.why.linked');
		if (item.kind === 'none') return t('import.review.why.none');
		if (item.kind === 'several')
			return t('import.review.why.several', { count: item.candidates.length });
		const reason = item.candidates[0]?.reasons.find((r) => r.kind !== 'name');
		return reason ? t(`import.review.why.${reason.kind}`, reason) : t('import.review.why.name');
	});

	const folded = $derived(
		answer?.kind === 'same'
			? (person?.displayName ?? '')
			: answer?.kind === 'new'
				? t('import.review.answered.new')
				: t('import.review.answered.skip')
	);

	const conflictSide = (c: Conflict, side: 'stella' | 'card') =>
		c.kind === 'birthday' ? dateText(i18n, c[side]) : c[side];
</script>

{#if closed && answer}
	<article
		class="flex items-center gap-3 rounded-app bg-card px-4 py-3 shadow-card"
		data-testid="review-card"
		data-card={key}
	>
		<Icon name="done" class="text-success-text" />
		<p class="min-w-0 flex-1 truncate text-sm text-fg">
			{item.card.displayName} <span class="text-fg-subtle">→</span>
			<span class="font-medium">{folded}</span>
		</p>
		<Button variant="ghost" size="sm" onclick={onreopen}>{t('import.review.change')}</Button>
	</article>
{:else}
	<article
		class="flex flex-col gap-4 rounded-app bg-card p-4 shadow-card"
		data-testid="review-card"
		data-card={key}
	>
		<header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<span class="rounded-full px-2 py-0.5 text-xs font-medium {BADGE[item.kind]}"
				>{t(`import.review.kind.${item.kind}`)}</span
			>
			<span class="text-sm text-fg-muted">{why}</span>
		</header>

		<div class="grid gap-4 sm:grid-cols-2">
			<section class="flex min-w-0 flex-col gap-2">
				<h3 class="text-xs tracking-wide text-fg-subtle uppercase">
					{t(`import.review.from.${FROM[source]}`)}
				</h3>
				<p class="flex items-center gap-2 font-medium text-fg">
					<Avatar id={key} name={item.card.displayName} size={28} />
					{item.card.displayName}
				</p>
				<FactList facts={cardFacts(item.card)} photo={item.card.photo} />
			</section>

			<section class="flex min-w-0 flex-col gap-2">
				<h3 class="text-xs tracking-wide text-fg-subtle uppercase">
					{t('import.review.inStella')}
				</h3>
				{#if picking}
					<PersonPicker {token} cardKey={key} onpick={choose} />
				{:else if person}
					<p class="flex items-center gap-2 font-medium text-fg">
						<Avatar id={person.personId} name={person.displayName} size={28} />
						<span class="min-w-0">
							{person.displayName}
							{#if person.birthday}
								<span class="block text-xs font-normal text-fg-subtle">
									{t('import.review.born', { date: dateText(i18n, person.birthday) })}
								</span>
							{/if}
						</span>
					</p>
					{#if person.plan.add.length > 0}
						<p class="text-xs font-medium text-success-text">{t('import.review.wouldAdd')}</p>
						<FactList facts={person.plan.add} adding />
					{:else}
						<p class="text-sm text-fg-muted">{t('import.review.nothingNew')}</p>
					{/if}
					{#each person.plan.conflicts as conflict (conflict.kind)}
						<fieldset class="flex flex-col gap-1 rounded-md bg-warning-soft p-3 text-sm text-fg">
							<legend class="flex items-center gap-1.5 font-medium">
								<Icon name="conflict" />{t(`import.review.conflict.${conflict.kind}`)}
							</legend>
							<label class="flex items-center gap-2">
								<input
									type="radio"
									name="{key}-{conflict.kind}"
									checked={!takeCard.includes(conflict.kind)}
									onchange={() => take(conflict.kind, false)}
								/>
								{t('import.review.keepStella')}: {conflictSide(conflict, 'stella')}
							</label>
							<label class="flex items-center gap-2">
								<input
									type="radio"
									name="{key}-{conflict.kind}"
									checked={takeCard.includes(conflict.kind)}
									onchange={() => take(conflict.kind, true)}
								/>
								{t('import.review.takeCard')}: {conflictSide(conflict, 'card')}
							</label>
						</fieldset>
					{/each}
					{#if person.plan.kept.length > 0}
						<p class="text-xs text-fg-subtle">
							{t('import.review.kept', {
								list: person.plan.kept.map((f) => factValue(i18n, f)).join(', ')
							})}
						</p>
					{/if}
				{:else if item.kind === 'several'}
					<p class="text-sm text-fg-muted">{t('import.review.pickOne')}</p>
					<ul class="flex flex-col gap-1">
						{#each item.candidates as candidate (candidate.personId)}
							<li>
								<button
									type="button"
									class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-fg hover:bg-card-hover"
									onclick={() => choose(candidate)}
								>
									<Avatar id={candidate.personId} name={candidate.displayName} size={24} />
									<span>
										{candidate.displayName}
										{#if candidate.birthday}
											<span class="block text-xs text-fg-subtle">
												{t('import.review.born', { date: dateText(i18n, candidate.birthday) })}
											</span>
										{/if}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-fg-muted">
						{answer?.kind === 'new' ? t('import.review.newWill') : t('import.review.nobody')}
					</p>
				{/if}
			</section>
		</div>

		<div class="flex flex-wrap gap-2">
			<Button
				size="sm"
				icon="link"
				variant={answer?.kind === 'same' ? 'primary' : 'secondary'}
				disabled={!person || picking}
				onclick={() =>
					person && onanswer({ kind: 'same', personId: person.personId, takeCard: [...takeCard] })}
				>{t('import.review.answer.same')}</Button
			>
			<Button size="sm" icon="search" variant="secondary" onclick={() => (picking = !picking)}
				>{t('import.review.answer.other')}</Button
			>
			<Button
				size="sm"
				icon="addPerson"
				variant={answer?.kind === 'new' ? 'primary' : 'secondary'}
				onclick={() => onanswer({ kind: 'new' })}>{t('import.review.answer.new')}</Button
			>
			<Button
				size="sm"
				icon="skip"
				variant={answer?.kind === 'skip' ? 'primary' : 'ghost'}
				onclick={() => onanswer({ kind: 'skip' })}>{t('import.review.answer.skip')}</Button
			>
		</div>
	</article>
{/if}
