<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import {
		answer,
		answerNew,
		confirmSure,
		initialReview,
		inShowingOrder,
		openNew,
		openSure,
		reopen,
		skipRest,
		takeCardSide,
		unanswered,
		type ContactReview,
		type ReviewKind
	} from '$lib/import-match/review';
	import NewContacts from './NewContacts.svelte';
	import ReviewCard from './ReviewCard.svelte';

	/*
	 * The vCard wizard's review step (docs/02 §2.16): one card per incoming contact that needs
	 * an answer. The answers stay here until *Import*, which sends them all at once; the
	 * server checks each again before it writes anything.
	 */
	interface Props {
		review: ContactReview;
		token: string;
		visibility: string;
		error?: string | null;
	}
	let { review, token, visibility, error = null }: Props = $props();

	const t = useTranslate();

	// Keyed by the page on each review the server hands over, so the start is taken once.
	let reviewState = $state(untrack(() => initialReview(review.cards)));

	const shown = $derived(inShowingOrder(reviewState, review.cards));
	const listed = $derived(openNew(reviewState, review.cards));
	const sure = $derived(openSure(reviewState, review.cards).length);
	const left = $derived(unanswered(reviewState, review.cards).length);
	const answered = $derived(review.cards.length - left);
	const counts = $derived(
		(['linked', 'strong', 'weak', 'several', 'none'] as ReviewKind[])
			.map((kind) => ({ kind, n: review.cards.filter((c) => c.kind === kind).length }))
			.filter((c) => c.n > 0)
	);
	const sourceName = $derived(
		t(
			review.source === 'vcard:google'
				? 'import.review.source.google'
				: review.source === 'vcard:nextcloud'
					? 'import.review.source.nextcloud'
					: 'import.review.source.other'
		)
	);
</script>

<section class="flex flex-col gap-4" data-testid="contact-review">
	<div class="flex flex-col gap-3 rounded-app bg-card p-5 shadow-card">
		<h2 class="text-lg font-semibold text-fg">{t('import.review.title')}</h2>
		<p class="text-sm text-fg-muted">
			{t('import.review.summary', {
				total: review.total,
				source: sourceName,
				settled: review.settled
			})}
		</p>
		{#if counts.length > 0}
			<ul class="flex flex-wrap gap-2 text-xs text-fg-muted">
				{#each counts as c (c.kind)}
					<li class="rounded-full bg-bg-sunken px-2.5 py-1">
						<span class="font-semibold text-fg">{c.n}</span>
						{t(`import.review.count.${c.kind}`)}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-fg">{t('import.review.nothingToAsk')}</p>
		{/if}
		<div class="flex flex-wrap gap-2">
			{#if sure > 0}
				<Button
					variant="primary"
					size="sm"
					icon="done"
					onclick={() => (reviewState = confirmSure(reviewState, review.cards))}
					>{t('import.review.confirmSure', { count: sure })}</Button
				>
			{/if}
			{#if left > 0}
				<Button
					variant="ghost"
					size="sm"
					icon="skip"
					onclick={() => (reviewState = skipRest(reviewState, review.cards))}
					>{t('import.review.skipRest')}</Button
				>
			{/if}
			<Button variant="ghost" size="sm" href="/settings/import">{t('import.startOver')}</Button>
		</div>
		{#if review.skippedBefore > 0}
			<p class="text-xs text-fg-subtle">
				{t('import.review.skippedBefore', { count: review.skippedBefore })}
				<a href="/settings/import#skipped" class="text-link underline"
					>{t('import.skipped.title')}</a
				>
			</p>
		{/if}
		{#if review.linkPhotos > 0}
			<p class="text-xs text-fg-subtle">
				{t('import.review.linkPhotos', { count: review.linkPhotos })}
			</p>
		{/if}
	</div>

	{#snippet card(item: (typeof shown)[number])}
		<ReviewCard
			{item}
			{token}
			source={review.source}
			answer={reviewState.answers[item.card.key]}
			closed={reviewState.closed[item.card.key] === true}
			onanswer={(given) => (reviewState = answer(reviewState, item.card.key, given))}
			onreopen={() => (reviewState = reopen(reviewState, item.card.key))}
			ontake={(kind, take) => (reviewState = takeCardSide(reviewState, item.card.key, kind, take))}
		/>
	{/snippet}

	<!-- The matched cards to look at first, then the checklist of new ones, then the answered. -->
	{#each shown.filter((c) => !reviewState.closed[c.card.key]) as item (item.card.key)}
		{@render card(item)}
	{/each}
	{#if listed.length > 0}
		<NewContacts
			cards={listed}
			onanswer={(picked) => (reviewState = answerNew(reviewState, review.cards, picked))}
		/>
	{/if}
	{#each shown.filter((c) => reviewState.closed[c.card.key]) as item (item.card.key)}
		{@render card(item)}
	{/each}

	<form
		method="POST"
		action="?/importReviewed"
		class="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 rounded-app bg-card px-4 py-3 shadow-card"
		style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))"
	>
		<FormError message={error} />
		<input type="hidden" name="token" value={token} />
		<input type="hidden" name="visibility" value={visibility} />
		<input type="hidden" name="answers" value={JSON.stringify(reviewState.answers)} />
		<p class="mr-auto text-sm text-fg-muted" aria-live="polite">
			{t('import.review.left', { count: left })}
		</p>
		<Button variant="primary" disabled={left > 0}
			>{t('import.review.import', { count: answered })}</Button
		>
	</form>
</section>
