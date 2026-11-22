<script lang="ts">
	import { enhance } from '#lib/forms/enhance.js';
	import Button from '#lib/components/ui/Button.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import WhenPicker from '#lib/components/ui/WhenPicker.svelte';
	import type { PartialDate } from '#lib/dates/partial-date.js';
	import { giverIdsOf } from '#lib/gifts/gifts.js';
	import { GIFT_WHEN_KINDS } from '#lib/gifts/idea-when.js';
	import type { GiverView } from '#lib/gifts/giver.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { reveal } from '#lib/motion/motion.svelte.js';
	import type { When } from '#lib/when/when.js';
	import type { SubmitFunction } from '$app/forms';
	import GiftGiversField from './GiftGiversField.svelte';
	import type { GiverChoices } from './types';

	/*
	 * *Vergeben…* on an open gift (docs/dev/02 §2.25.12): who gives it, for which occasion, and
	 * *Wieder frei* once somebody does. Its author, on a member's own person, keeps it from them —
	 * ticked by default, since a gift somebody is giving is a surprise (D4).
	 */
	interface Props {
		gift: {
			id: string;
			title: string;
			when: When | null;
			giver: GiverView;
			mine: boolean;
			visibility: 'shared' | 'private';
			hiddenFromRecipient: boolean;
		};
		givers: GiverChoices;
		/** The person's name when they are a member another member may keep it from. */
		recipient: string | null;
		birth: PartialDate | null;
		today: string;
		estimateHref: string;
		error: string | null;
		submit: SubmitFunction;
		onCancel: () => void;
	}
	let { gift, givers, recipient, birth, today, estimateHref, error, submit, onCancel }: Props =
		$props();

	const t = useI18n().t;

	// svelte-ignore state_referenced_locally
	let giver = $state(giverIdsOf(gift.giver));
	// svelte-ignore state_referenced_locally
	let kept = $state(gift.giver.kind === 'none' ? true : gift.hiddenFromRecipient);
	const asksSurprise = $derived(
		gift.mine && gift.visibility === 'shared' && recipient !== null && giver.length > 0
	);
	/** Whom it was given to before, when the choice moves it on. */
	const replaces = $derived(
		gift.giver.kind === 'person' && !giver.includes(gift.giver.contactId) ? gift.giver.name : null
	);
</script>

<form
	method="POST"
	action="?/assignGift"
	use:enhance={submit}
	transition:reveal
	class="mt-3 flex flex-col gap-3 rounded-control bg-bg-sunken p-3"
	data-testid="gift-assign"
>
	<h3 class="text-sm font-semibold text-fg">{t('gifts.assign.title', { title: gift.title })}</h3>
	<input type="hidden" name="giftId" value={gift.id} />
	<GiftGiversField
		bind:values={giver}
		label={t('gifts.giver.who')}
		ties={givers.ties}
		household={givers.household}
		people={givers.people}
		recipientId={givers.recipientId}
	/>
	{#if replaces}
		<p class="text-xs text-fg-muted" aria-live="polite" data-testid="gift-assign-replaces">
			{t('gifts.assign.replaces', { name: replaces })}
		</p>
	{/if}
	<div class="flex flex-col gap-1">
		<span class="text-xs font-medium text-fg-muted">{t('gifts.assign.occasion')}</span>
		<WhenPicker when={gift.when} {birth} {today} {estimateHref} kinds={GIFT_WHEN_KINDS} />
	</div>
	{#if asksSurprise}
		<label class="flex items-center justify-between gap-2 text-sm text-fg">
			{t('gifts.assign.keep', { name: recipient ?? '' })}
			<input type="checkbox" bind:checked={kept} />
		</label>
		<input type="hidden" name="surprise" value={kept ? 'kept' : 'open'} />
	{/if}
	<FormError message={error} variant="inline" />
	<div class="flex flex-wrap justify-end gap-2">
		{#if gift.giver.kind !== 'none'}
			<Button
				variant="ghost"
				size="sm"
				name="free"
				value="on"
				formnovalidate
				data-testid="gift-assign-free"
			>
				{t('gifts.assign.free')}
			</Button>
		{/if}
		<Button variant="ghost" size="sm" type="button" onclick={onCancel}>
			{t('common.cancel')}
		</Button>
		<Button variant="primary" size="sm" disabled={giver.length === 0}
			>{t('gifts.assign.save')}</Button
		>
	</div>
</form>
