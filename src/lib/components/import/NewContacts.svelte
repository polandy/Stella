<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import Button from '$lib/components/ui/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { ReviewCard } from '$lib/import-match/review';

	/*
	 * The contacts nobody in Stella matches (docs/02 §2.16), as one checklist: an address
	 * book holds plenty of people the family does not keep, so the member ticks the ones to
	 * add and the others are skipped. Nothing is ticked at the start.
	 */
	interface Props {
		cards: ReviewCard[];
		onanswer: (picked: ReadonlySet<string>) => void;
	}
	let { cards, onanswer }: Props = $props();

	const t = useTranslate();
	const picked = new SvelteSet<string>();

	/** The one line under the name that tells two Annas apart. */
	const hint = (c: ReviewCard['card']) =>
		c.emails[0]?.value ?? c.phones[0]?.value ?? c.company ?? '';

	function toggle(key: string, on: boolean) {
		if (on) picked.add(key);
		else picked.delete(key);
	}

	const count = $derived(cards.filter((c) => picked.has(c.card.key)).length);
</script>

<section
	class="flex flex-col gap-3 rounded-app bg-card p-4 shadow-card"
	data-testid="new-contacts"
	aria-labelledby="new-contacts-title"
>
	<header class="flex flex-wrap items-center gap-2">
		<h3 id="new-contacts-title" class="mr-auto text-sm font-medium text-fg">
			{t('import.review.newList.title', { count: cards.length })}
		</h3>
		<Button variant="ghost" size="sm" onclick={() => cards.forEach((c) => picked.add(c.card.key))}
			>{t('import.review.newList.all')}</Button
		>
		<Button variant="ghost" size="sm" onclick={() => picked.clear()}
			>{t('import.review.newList.none')}</Button
		>
	</header>
	<p class="text-xs text-fg-subtle">{t('import.review.newList.intro')}</p>
	<ul class="flex flex-col divide-y divide-border-subtle">
		{#each cards as item (item.card.key)}
			<li>
				<label class="flex items-center gap-3 py-2">
					<input
						type="checkbox"
						class="size-5 shrink-0 accent-primary"
						checked={picked.has(item.card.key)}
						onchange={(e) => toggle(item.card.key, e.currentTarget.checked)}
					/>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-sm text-fg">{item.card.displayName}</span>
						{#if hint(item.card)}
							<span class="block truncate text-xs text-fg-subtle">{hint(item.card)}</span>
						{/if}
					</span>
				</label>
			</li>
		{/each}
	</ul>
	<div class="flex justify-end">
		<Button variant="primary" size="sm" onclick={() => onanswer(new Set(picked))}
			>{t('import.review.newList.answer', { picked: count, others: cards.length - count })}</Button
		>
	</div>
</section>
