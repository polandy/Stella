<script lang="ts">
	import { enhance } from '#lib/forms/enhance.js';
	import { invalidateAll } from '$app/navigation';
	import Button from '#lib/components/ui/Button.svelte';
	import { INPUT } from '#lib/components/ui/inputs.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { reveal } from '#lib/motion/motion.svelte.js';
	import { useRemovals } from '#lib/undo/context.svelte.js';
	import { heldAnswer } from '#lib/undo/held-answer.js';
	import { removalKey } from '#lib/undo/keys.js';

	/*
	 * *Besorgt…* on a gift the household hands over itself (docs/dev/02 §2.25.9, D17, D20): where it
	 * waits, picked from the places already used or typed, and — its author, on a member's own
	 * person — kept from them, ticked by default (D23). Held for one undo window like *Bought*.
	 */
	interface Props {
		gift: {
			id: string;
			title: string;
			mine: boolean;
			visibility: 'shared' | 'private';
			hiddenFromRecipient: boolean;
		};
		/** Whom it is for. */
		name: string;
		/** The person's name when they are a member another member may keep it from. */
		recipient: string | null;
		/** Where bought gifts already wait, latest first. */
		places: string[];
		onAway: (away: boolean) => void;
		onCancel: () => void;
	}
	let { gift, name, recipient, places, onAway, onCancel }: Props = $props();

	const t = useI18n().t;
	const removals = useRemovals();
	let place = $state('');
	let kept = $state(true);
	const asksSurprise = $derived(gift.mine && gift.visibility === 'shared' && recipient !== null);
	const held = $derived(
		heldAnswer(
			{ holder: removals, fetch: (url, init) => window.fetch(url, init) },
			{
				key: removalKey('gift', gift.id),
				label: t('gifts.bought.title', { title: gift.title }),
				onSending: () => onAway(true),
				onCommitted: () => void invalidateAll().then(() => onAway(false)),
				onFailed: () => onAway(false)
			}
		)
	);
</script>

<form
	method="POST"
	action="?/markGiftBought"
	use:enhance={held}
	transition:reveal
	class="mt-3 flex flex-col gap-3 rounded-control bg-bg-sunken p-3"
	data-testid="gift-buy"
>
	<h3 class="text-sm font-semibold text-fg">{t('gifts.buy.title', { title: gift.title, name })}</h3>
	<input type="hidden" name="giftId" value={gift.id} />
	<input type="hidden" name="bought" value="on" />
	<div class="flex flex-col gap-1.5">
		<label for="gift-place-{gift.id}" class="text-xs font-medium text-fg-muted">
			{t('gifts.buy.where')}
		</label>
		{#if places.length > 0}
			<div class="flex flex-wrap gap-1.5" data-testid="gift-buy-places">
				{#each places as known (known)}
					<button
						type="button"
						class="rounded-full border px-3 py-1 text-[0.8125rem] transition-colors {place === known
							? 'border-primary bg-primary-soft font-medium text-primary'
							: 'border-border bg-bg text-fg-muted'}"
						aria-pressed={place === known}
						onclick={() => (place = place === known ? '' : known)}
					>
						{known}
					</button>
				{/each}
			</div>
		{/if}
		<input
			id="gift-place-{gift.id}"
			name="storedAt"
			bind:value={place}
			placeholder={t('gifts.buy.wherePlaceholder')}
			class="{INPUT} w-full"
		/>
		<p class="text-xs text-fg-subtle">{t('gifts.buy.hint')}</p>
	</div>
	{#if asksSurprise}
		<label class="flex items-center justify-between gap-2 text-sm text-fg">
			{t('gifts.assign.keep', { name: recipient ?? '' })}
			<input type="checkbox" bind:checked={kept} />
		</label>
		<input type="hidden" name="surprise" value={kept ? 'kept' : 'open'} />
	{/if}
	<div class="flex flex-wrap justify-end gap-2">
		<Button variant="ghost" size="sm" type="button" onclick={onCancel}>
			{t('common.cancel')}
		</Button>
		<Button variant="primary" size="sm" icon="bought" data-testid="gift-buy-save">
			{t('gifts.bought')}
		</Button>
	</div>
</form>
