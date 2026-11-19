<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/ui/Button.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import RemoveButton from '#lib/components/ui/RemoveButton.svelte';
	import WhenPicker from '#lib/components/ui/WhenPicker.svelte';
	import { GIFT_WHEN_KINDS } from '#lib/gifts/idea-when.js';
	import type { PartialDate } from '#lib/dates/partial-date.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { reveal } from '#lib/motion/motion.svelte.js';
	import { useRemovals } from '#lib/undo/context.svelte.js';
	import { savedEnhance } from '#lib/undo/saved.js';
	import { WHEN_FIELDS } from '#lib/when/form.js';
	import type { WhenState } from '#lib/when/state.js';
	import type { When } from '#lib/when/when.js';

	/*
	 * *Still current?* on an idea whose occasion went by, or a *later* one at its yearly look
	 * (docs/dev/02 §2.25.8): keep it as a plain idea, give it a new time, or remove it. Asked,
	 * never decided: until somebody answers, the idea stays where it is, marked.
	 */
	interface Props {
		gift: { id: string; title: string; when: When };
		standing: Extract<WhenState, { kind: 'passed' | 'review' }>;
		birth: PartialDate | null;
		today: string;
		estimateHref: string;
		/** The refusal of this row's last save, if any. */
		error: string | null;
	}
	let { gift, standing, birth, today, estimateHref, error }: Props = $props();

	const t = useI18n().t;
	const removals = useRemovals();

	let moving = $state(false);
	const saved = savedEnhance(removals, t('components.saved'), () => (moving = false));
</script>

<div
	role="group"
	aria-label={t('when.ask.group', { title: gift.title })}
	class="mt-2 flex flex-col gap-2 rounded-control bg-warning-soft p-3"
	data-testid="when-ask"
>
	<p class="text-sm text-fg">
		{standing.kind === 'passed' ? t('when.ask.passed') : t('when.ask.review')}
	</p>
	{#if moving}
		<form
			method="POST"
			action="?/answerGiftWhen"
			use:enhance={saved}
			transition:reveal
			class="flex flex-col gap-3"
		>
			<input type="hidden" name="giftId" value={gift.id} />
			<WhenPicker when={gift.when} {birth} {today} {estimateHref} kinds={GIFT_WHEN_KINDS} />
			<FormError message={error} variant="inline" />
			<div class="flex justify-end gap-2">
				<Button variant="ghost" size="sm" type="button" onclick={() => (moving = false)}>
					{t('common.cancel')}
				</Button>
				<Button variant="primary" size="sm">{t('common.save')}</Button>
			</div>
		</form>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			<form method="POST" action="?/answerGiftWhen" use:enhance={saved}>
				<input type="hidden" name="giftId" value={gift.id} />
				<input type="hidden" name={WHEN_FIELDS.kind} value="now" />
				<Button variant="secondary" size="sm">{t('when.ask.keep')}</Button>
			</form>
			<Button variant="secondary" size="sm" type="button" onclick={() => (moving = true)}>
				{t('when.ask.move')}
			</Button>
			<RemoveButton
				kind="gift"
				id={gift.id}
				action="?/removeGift"
				fields={{ giftId: gift.id }}
				label={t('common.remove')}
				removed={t('gifts.removed')}
				spelled
			/>
		</div>
		<FormError message={error} variant="inline" />
	{/if}
</div>
