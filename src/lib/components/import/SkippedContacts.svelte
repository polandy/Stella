<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { sourceWord, type ContactSource } from '$lib/import-match/card';

	/*
	 * *Skipped contacts* on the import page (docs/02 §2.16): a skip is for good, so this is the
	 * one way back. *Ask again* forgets the skip; the next import of that address book asks.
	 */
	interface Props {
		skipped: { source: ContactSource; externalUid: string; cardName: string; answeredAt: number }[];
	}
	let { skipped }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;

	const day = (at: number) =>
		new Date(at).toLocaleDateString(i18n.intlLocale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
</script>

<section id="skipped" class="flex flex-col gap-3 rounded-app bg-card p-5 shadow-card">
	<h2 class="text-sm font-medium text-fg">{t('import.skipped.title')}</h2>
	<p class="text-xs text-fg-subtle">{t('import.skipped.intro')}</p>
	<ul class="flex flex-col divide-y divide-border-subtle">
		{#each skipped as card (card.source + card.externalUid)}
			<li class="flex items-center gap-3 py-2">
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm text-fg">{card.cardName}</p>
					<p class="text-xs text-fg-subtle">
						{t(`import.review.source.${sourceWord(card.source)}`)} · {day(card.answeredAt)}
					</p>
				</div>
				<form method="POST" action="?/askAgain">
					<input type="hidden" name="source" value={card.source} />
					<input type="hidden" name="uid" value={card.externalUid} />
					<Button
						variant="ghost"
						size="sm"
						label={t('import.skipped.askAgainLabel', { name: card.cardName })}
						>{t('import.skipped.askAgain')}</Button
					>
				</form>
			</li>
		{/each}
	</ul>
</section>
