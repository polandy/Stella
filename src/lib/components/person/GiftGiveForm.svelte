<script lang="ts">
	import { enhance } from '#lib/forms/enhance.js';
	import Button from '#lib/components/ui/Button.svelte';
	import DateField from '#lib/components/ui/DateField.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { reveal } from '#lib/motion/motion.svelte.js';
	import type { SubmitFunction } from '$app/forms';
	import GiftOccasionField from './GiftOccasionField.svelte';

	// *Mark as given* on the Gifts card (docs/dev/02 §2.25): only the day and the occasion.
	interface Props {
		gift: { id: string; title: string };
		today: string;
		error: string | null;
		submit: SubmitFunction;
		onCancel: () => void;
		/** Posts to the card's own action, or to *Who has it?*'s with the row's fields. */
		action?: string;
		fields?: Record<string, string>;
	}
	let {
		gift,
		today,
		error,
		submit,
		onCancel,
		action = '?/markGiftGiven',
		fields = {}
	}: Props = $props();

	const t = useI18n().t;
</script>

<form
	method="POST"
	{action}
	use:enhance={submit}
	transition:reveal
	class="mt-3 flex flex-col gap-3 rounded-control bg-bg-sunken p-3"
	data-testid="mark-given"
>
	<h3 class="text-sm font-semibold text-fg">
		{t('gifts.markGiven.title', { title: gift.title })}
	</h3>
	<input type="hidden" name="giftId" value={gift.id} />
	{#each Object.entries(fields) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
	<div class="flex flex-col gap-1">
		<span class="text-xs font-medium text-fg-muted">{t('gifts.form.on')}</span>
		<DateField name="givenOn" required value={today} label={t('gifts.form.on')} />
	</div>
	<GiftOccasionField />
	<FormError message={error} variant="inline" />
	<div class="flex justify-end gap-2">
		<Button variant="ghost" size="sm" type="button" onclick={onCancel}>
			{t('common.cancel')}
		</Button>
		<Button variant="primary" size="sm">{t('gifts.markGiven')}</Button>
	</div>
</form>
