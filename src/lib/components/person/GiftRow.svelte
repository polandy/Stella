<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import RemoveButton from '$lib/components/ui/RemoveButton.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { addedLabel, occasionLabel } from '$lib/gifts/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { tick } from 'svelte';
	import GiftForm from './GiftForm.svelte';
	import GiftOccasionField from './GiftOccasionField.svelte';
	import GiftStateMark from './GiftStateMark.svelte';
	import type { PersonPageData } from './types';

	/*
	 * One gift on the Gifts card (docs/02 §2.25): what it is, its note, when and why it was given,
	 * who noted it — and what can be done with it. An idea offers *Mark as given*, which asks
	 * only for the day and the occasion; every gift can be rewritten in place and removed with
	 * the undo every removal has (docs/02 §2.23).
	 */
	interface Props {
		gift: PersonPageData['gifts'][number];
		/** Every gift on the person, for the *already given* hint while it is rewritten. */
		gifts: PersonPageData['gifts'];
		/** The day *Mark as given* starts on. */
		today: string;
		/** The refusal of this row's last save, if any. */
		error: string | null;
		/** The idea was given: the card shows where it went. */
		onGiven: () => void;
	}
	let { gift, gifts, today, error, onGiven }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	// A refused save leaves its form open (`savedEnhance` closes only on success), so the
	// reason stands in the form it is about.
	let mode = $state<'view' | 'edit' | 'give'>('view');
	let row = $state<HTMLElement>();

	async function start(next: 'edit' | 'give') {
		mode = next;
		await tick();
		row?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea')?.focus();
	}
	function close() {
		mode = 'view';
		void tick().then(() => row?.querySelector<HTMLElement>('[data-gift-actions] button')?.focus());
	}

	const savedEdit = savedEnhance(removals, t('components.saved'), close);
	const savedGiven = savedEnhance(removals, t('components.saved'), () => {
		mode = 'view';
		onGiven();
	});

	/** When and why it was given or received: *18 Oct 2025 · Birthday*. */
	const when = $derived(
		gift.givenOn
			? [dayLabel(i18n, gift.givenOn), gift.occasion ? occasionLabel(t, gift.occasion) : null]
					.filter(Boolean)
					.join(' · ')
			: null
	);
	/** When an idea was noted: *Added 3 October 2026*, in the reader's time zone. */
	const added = $derived(
		gift.state === 'idea'
			? addedLabel(i18n, gift.createdAt, Intl.DateTimeFormat().resolvedOptions().timeZone)
			: null
	);
</script>

<li bind:this={row} class="flex gap-3 border-t border-border-subtle py-2.5 first:border-t-0">
	<GiftStateMark state={gift.state} />

	<div class="min-w-0 flex-1">
		{#if mode === 'edit'}
			<div transition:reveal>
				<GiftForm
					kind={gift.state}
					{gift}
					{gifts}
					heading={t('gifts.edit', { title: gift.title })}
					action="?/editGift"
					submit={savedEdit}
					{today}
					canChooseVisibility={gift.mine}
					{error}
					onCancel={close}
				/>
			</div>
		{:else}
			<div class="flex flex-wrap items-start gap-x-2 gap-y-1">
				<div class="min-w-0 flex-1">
					<p class="font-medium break-words text-fg">{gift.title}</p>
					{#if when}<p class="text-sm text-fg-muted">{when}</p>{/if}
					{#if added}<p class="text-xs text-fg-muted" data-testid="gift-added">{added}</p>{/if}
					{#if gift.note}
						<p class="text-sm whitespace-pre-line text-fg-muted">{gift.note}</p>
					{/if}
					<p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-subtle">
						<span
							>{gift.mine
								? t('gifts.notedByYou')
								: t('gifts.notedBy', { name: gift.notedBy ?? '…' })}</span
						>
						{#if gift.url}
							<span aria-hidden="true">·</span>
							<a
								href={gift.url}
								target="_blank"
								rel="noreferrer noopener"
								class="inline-flex items-center gap-1 text-link hover:underline"
								aria-label={t('gifts.openLink', { title: gift.title })}
							>
								<Icon name="link" size={11} />{t('gifts.link')}
							</a>
						{/if}
						{#if gift.visibility === 'private'}
							<span aria-hidden="true">·</span>
							<span class="inline-flex items-center gap-1" title={t('common.onlyYouSee')}>
								<Icon name="private" size={11} />{t('common.privateInline')}
							</span>
						{/if}
					</p>
					<!-- Under the idea rather than beside it, so a phone keeps the title on one line. -->
					{#if gift.state === 'idea' && mode === 'view'}
						<!-- Outlined, not filled: one per idea, so a list of them must not shout over the card's own add actions. -->
						<Button
							variant="secondary"
							size="sm"
							type="button"
							class="mt-2"
							onclick={() => start('give')}
						>
							{t('gifts.markGiven.open')}
						</Button>
					{/if}
				</div>
				<div class="flex shrink-0 items-center gap-1" data-gift-actions>
					<Button
						variant="ghost"
						size="sm"
						type="button"
						icon="rename"
						label={t('gifts.edit', { title: gift.title })}
						title={t('gifts.edit', { title: gift.title })}
						onclick={() => start('edit')}
					/>
					<RemoveButton
						kind="gift"
						id={gift.id}
						action="?/removeGift"
						fields={{ giftId: gift.id }}
						label={t('gifts.remove', { title: gift.title })}
						removed={t('gifts.removed')}
					/>
				</div>
			</div>

			{#if mode === 'give'}
				<form
					method="POST"
					action="?/markGiftGiven"
					use:enhance={savedGiven}
					transition:reveal
					class="mt-3 flex flex-col gap-3 rounded-control bg-bg-sunken p-3"
					data-testid="mark-given"
				>
					<h3 class="text-sm font-semibold text-fg">
						{t('gifts.markGiven.title', { title: gift.title })}
					</h3>
					<input type="hidden" name="giftId" value={gift.id} />
					<div class="flex flex-col gap-1">
						<span class="text-xs font-medium text-fg-muted">{t('gifts.form.on')}</span>
						<DateField name="givenOn" required value={today} label={t('gifts.form.on')} />
					</div>
					<GiftOccasionField />
					<FormError message={error} variant="inline" />
					<div class="flex justify-end gap-2">
						<Button variant="ghost" size="sm" type="button" onclick={close}>
							{t('common.cancel')}
						</Button>
						<Button variant="primary" size="sm">{t('gifts.markGiven')}</Button>
					</div>
				</form>
			{/if}
		{/if}
	</div>
</li>
