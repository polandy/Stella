<script lang="ts">
	import { enhance } from '#lib/forms/enhance.js';
	import { invalidateAll } from '$app/navigation';
	import Button from '#lib/components/ui/Button.svelte';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { useRemovals } from '#lib/undo/context.svelte.js';
	import { heldAnswer } from '#lib/undo/held-answer.js';
	import { removalKey } from '#lib/undo/keys.js';

	/*
	 * *Bought*, or *Not bought yet* (docs/dev/02 §2.25.9): held for one undo window before it is
	 * sent, like every answer that moves a row (§2.23). The row is gone while it is held and sent,
	 * and comes back where the answer put it once the page is read again.
	 */
	interface Props {
		gift: { id: string; title: string };
		/** True: mark it bought. False: an idea again. */
		bought: boolean;
		/** Posts to the card's or the list's own action. */
		action?: string;
		/** The person, on the household's list, which has none in its URL. */
		contactId?: string;
		/** The row is away (held or on its way), or back. */
		onAway: (away: boolean) => void;
	}
	let { gift, bought, action = '?/markGiftBought', contactId, onAway }: Props = $props();

	const t = useI18n().t;
	const removals = useRemovals();
	const held = $derived(
		heldAnswer(
			{ holder: removals, fetch: (url, init) => window.fetch(url, init) },
			{
				key: removalKey('gift', gift.id),
				label: t(bought ? 'gifts.bought.title' : 'gifts.notBought.title', { title: gift.title }),
				onSending: () => onAway(true),
				onCommitted: () => void invalidateAll().then(() => onAway(false)),
				onFailed: () => onAway(false)
			}
		)
	);
</script>

<form method="POST" {action} use:enhance={held} class="contents">
	<input type="hidden" name="giftId" value={gift.id} />
	{#if contactId}<input type="hidden" name="contactId" value={contactId} />{/if}
	{#if bought}<input type="hidden" name="bought" value="on" />{/if}
	{#if bought}
		<Button variant="secondary" size="sm" icon="bought" data-testid="gift-bought">
			{t('gifts.bought')}
		</Button>
	{:else}
		<Button variant="ghost" size="sm" data-testid="gift-not-bought">{t('gifts.notBought')}</Button>
	{/if}
</form>
