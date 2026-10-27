<script lang="ts">
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { CardPhoto } from '$lib/import-match/card';
	import type { Fact } from '$lib/import-match/merge-plan';
	import { factLabel, factValue, labelText } from './review-text';

	/*
	 * One side of a review card (docs/02 §2.16): what the card says, or what it would add. Tags
	 * read as one line, the way a person's page lists them.
	 */
	interface Props {
		facts: Fact[];
		/** The card's picture, said once on the incoming side. */
		photo?: CardPhoto;
		/** Colours the values as additions. */
		adding?: boolean;
	}
	let { facts, photo = null, adding = false }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;

	const rows = $derived.by(() => {
		const tags = facts.filter((f) => f.kind === 'tag');
		const others = facts.filter((f) => f.kind !== 'tag');
		return [
			...others.map((f) => ({
				label: factLabel(i18n, f),
				value: factValue(i18n, f),
				tag: 'label' in f ? labelText(i18n, f.label) : null
			})),
			...(tags.length === 0
				? []
				: [
						{
							label: t('import.review.fact.tag'),
							value: tags.map((f) => factValue(i18n, f)).join(', '),
							tag: null
						}
					])
		];
	});
</script>

<dl class="flex flex-col gap-1.5 text-sm">
	{#each rows as row, i (i)}
		<div class="flex min-w-0 flex-col">
			<dt class="text-xs text-fg-subtle">
				{row.label}{#if row.tag}<span> · {row.tag}</span>{/if}
			</dt>
			<dd class="break-words" class:text-fg={!adding} class:text-success-text={adding}>
				{row.value}
			</dd>
		</div>
	{/each}
	{#if photo}
		<div class="flex flex-col">
			<dt class="text-xs text-fg-subtle">{t('import.review.fact.photo')}</dt>
			<dd class={photo === 'link' ? 'text-fg-muted' : 'text-fg'}>
				{photo === 'inline' ? t('import.review.photo.inline') : t('import.review.photo.link')}
			</dd>
		</div>
	{/if}
</dl>
