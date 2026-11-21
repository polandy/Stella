<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import type { GiftState } from '#lib/gifts/gifts.js';
	import type { GiverView } from '#lib/gifts/giver.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import GiftBoughtButton from './GiftBoughtButton.svelte';

	/*
	 * What an open gift's row offers (docs/dev/02 §2.25.9, §2.25.12): *Besorgt…* when the household
	 * hands it over, *Erledigt* when someone else does (D17); *Mark as given*; *Vergeben…*; and on a
	 * bought one its undo, in the same word.
	 */
	interface Props {
		gift: { id: string; title: string; state: GiftState; giver: GiverView };
		/** The household hands it over itself (`handsOver`). */
		ours: boolean;
		onStart: (mode: 'buy' | 'give' | 'assign') => void;
		onAway: (away: boolean) => void;
	}
	let { gift, ours, onStart, onAway }: Props = $props();

	const t = useI18n().t;
</script>

<!-- Outlined, not filled: one per idea, so a list of them must not shout over the card's own add actions. -->
<div class="mt-2 flex flex-wrap gap-2">
	{#if gift.state === 'idea' && ours}
		<Button
			variant="secondary"
			size="sm"
			type="button"
			icon="bought"
			onclick={() => onStart('buy')}
			data-testid="gift-buy-open"
		>
			{t('gifts.buy.open')}
		</Button>
	{:else if gift.state === 'idea'}
		<GiftBoughtButton {gift} bought word="done" {onAway} />
	{/if}
	<Button variant="secondary" size="sm" type="button" onclick={() => onStart('give')}>
		{t('gifts.markGiven.open')}
	</Button>
	<Button
		variant="secondary"
		size="sm"
		type="button"
		onclick={() => onStart('assign')}
		data-testid="gift-assign-open"
	>
		{t(gift.giver.kind === 'none' ? 'gifts.assign.open' : 'gifts.assign.change')}
	</Button>
	{#if gift.state === 'bought'}
		<GiftBoughtButton {gift} bought={false} word={ours ? 'bought' : 'done'} {onAway} />
	{/if}
</div>
