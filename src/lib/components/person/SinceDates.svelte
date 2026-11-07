<script lang="ts">
	import DateField from '$lib/components/ui/DateField.svelte';
	import Swap from '$lib/components/ui/Swap.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { PairSince } from '$lib/relationships/multi-pick';

	/*
	 * The add form's since day (docs/02 §2.4): one field, or — with several people picked whose
	 * days differ, several children say — one per pair, each prefilled from the birthday rule and
	 * clearable. *Use one date for all* folds them back into one. The two glide into each other in
	 * place (docs/05 §5.11).
	 */

	interface Props {
		pairs: readonly PairSince[];
		/** The day the single field offers. */
		oneSince: string;
		several: boolean;
		/** The day every pair shares, or null when they differ. */
		sameSince: string | null;
		nameOfPicked: (id: string) => string;
	}
	let { pairs, oneSince, several, sameSince, nameOfPicked }: Props = $props();

	const t = useTranslate();
	/** *Use one date for all*, chosen while the pairs' days differ. */
	let useOneDate = $state(false);
	const perPair = $derived(several && sameSince === null && !useOneDate);
</script>

<Swap when={perPair} class={perPair ? 'w-full' : ''}>
	<fieldset class="flex w-full min-w-0 flex-col gap-1 text-sm">
		<legend class="mb-1 text-fg-muted">
			{t('contact.relationships.sinceLabel')} · {t('contact.relationships.sinceEach')}
		</legend>
		<ul class="flex flex-col gap-2 rounded-control border border-border bg-card p-2">
			{#each pairs as pair (`${pair.targetId}|${pair.sinceDate}`)}
				<li class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
					<span class="min-w-0 truncate text-fg">{nameOfPicked(pair.targetId)}</span>
					<DateField
						name="sinceDate"
						value={pair.sinceDate}
						label={t('contact.relationships.sinceFor', { name: nameOfPicked(pair.targetId) })}
					/>
				</li>
			{/each}
		</ul>
		<button
			type="button"
			class="self-start rounded-control py-1 text-xs font-medium text-link hover:underline"
			onclick={() => (useOneDate = true)}
		>
			{t('contact.relationships.oneDateForAll')}
		</button>
	</fieldset>
	{#snippet otherwise()}
		<div class="flex flex-col gap-1 text-sm">
			<span class="text-fg-muted">{t('contact.relationships.sinceLabel')}</span>
			<!-- Keyed: the field owns its segments once it is on screen, so a new
			 suggestion arrives as a fresh field rather than as a silent overwrite. -->
			{#key oneSince}
				<DateField
					name="sinceDate"
					value={oneSince}
					label={t('contact.relationships.sinceLabel')}
				/>
			{/key}
			{#if several && useOneDate && sameSince === null}
				<button
					type="button"
					class="self-start rounded-control py-1 text-xs font-medium text-link hover:underline"
					onclick={() => (useOneDate = false)}
				>
					{t('contact.relationships.datePerPerson')}
				</button>
			{/if}
		</div>
	{/snippet}
</Swap>
