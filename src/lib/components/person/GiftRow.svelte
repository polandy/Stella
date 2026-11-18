<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import RemoveButton from '$lib/components/ui/RemoveButton.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import type { PartialDate } from '$lib/dates/partial-date';
	import { addedLabel, occasionLabel } from '$lib/gifts/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import { isOpenGift } from '$lib/gifts/gifts';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import WhenChip from '$lib/components/when/WhenChip.svelte';
	import { ideaState } from '$lib/gifts/idea-when';
	import { asks } from '$lib/when/state';
	import { tick } from 'svelte';
	import GiftForm from './GiftForm.svelte';
	import GiftBoughtButton from './GiftBoughtButton.svelte';
	import GiftGiveForm from './GiftGiveForm.svelte';
	import GiftStateMark from './GiftStateMark.svelte';
	import GiftWhenAsk from './GiftWhenAsk.svelte';
	import type { GroupLink, PersonPageData } from './types';

	/*
	 * One gift on the Gifts card (docs/dev/02 §2.25): what it is, its note, when and why it was given,
	 * who noted it — and what can be done with it. An idea offers *Bought* (§2.25.9) and *Mark as
	 * given*, which asks only for the day and the occasion; a bought one *Mark as given* and *Not
	 * bought yet*. Every gift can be rewritten in place and removed with the undo every removal
	 * has (docs/dev/02 §2.23).
	 */
	interface Props {
		gift: PersonPageData['gifts'][number];
		/** Every gift on the person, for the *already given* hint while it is rewritten. */
		gifts: PersonPageData['gifts'];
		/** The day *Mark as given* starts on. */
		today: string;
		/** The person's birth date, for an idea's age (§2.25.8). */
		birth: PartialDate | null;
		/** Where their birth year can be estimated. */
		estimateHref: string;
		/** The refusal of this row's last save, if any. */
		error: string | null;
		/** The idea was given: the card shows where it went. */
		onGiven: () => void;
		/** Whom a surprise is kept from, and whom the form may keep it from (§2.25.10). */
		name: string;
		/** The person is a member other than the viewer, so a gift may be kept from them. */
		recipientIsMember: boolean;
		/** One idea several people get: who else, and how to open *Who has it?* (§2.25.11). */
		group?: GroupLink | null;
	}
	let {
		gift,
		gifts,
		today,
		birth,
		estimateHref,
		error,
		onGiven,
		name,
		recipientIsMember,
		group = null
	}: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const listOf = (names: string[]) =>
		new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(names);

	// A refused save leaves its form open (`savedEnhance` closes only on success), so the
	// reason stands in the form it is about.
	let mode = $state<'view' | 'edit' | 'give'>('view');
	let row = $state<HTMLElement>();
	// Held by its toast, or on its way after *Bought* / *Not bought yet*.
	let away = $state(false);

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
	/** Where the idea stands against its when; a passed or yearly one asks whether it still stands. */
	const whenState = $derived(gift.state === 'idea' ? ideaState(gift, birth, today) : null);

	/** When an idea was noted: *Added 3 October 2026*, in the reader's time zone. */
	const added = $derived(
		isOpenGift(gift.state)
			? addedLabel(i18n, gift.createdAt, Intl.DateTimeFormat().resolvedOptions().timeZone)
			: null
	);
</script>

<li
	bind:this={row}
	class="flex gap-3 border-t border-border-subtle py-2.5 first:border-t-0"
	class:hidden={away}
>
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
					recipient={recipientIsMember ? name : null}
					{birth}
					{estimateHref}
					{error}
					onCancel={close}
				/>
			</div>
		{:else}
			<div class="flex flex-wrap items-start gap-x-2 gap-y-1">
				<div class="min-w-0 flex-1">
					<p class="font-medium break-words text-fg">{gift.title}</p>
					{#if when}<p class="text-sm text-fg-muted">{when}</p>{/if}
					{#if gift.when}<WhenChip when={gift.when} state={whenState} {today} />{/if}
					{#if group && group.names.length}
						<button
							type="button"
							class="block text-left text-sm text-fg-muted hover:text-fg hover:underline"
							onclick={group.open}
							data-testid="gift-also-for"
						>
							{t('gifts.group.alsoFor', { names: listOf(group.names) })} ›
						</button>
					{/if}
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
						{#if gift.hiddenFromRecipient}
							<span aria-hidden="true">·</span>
							<span class="inline-flex items-center gap-1" data-testid="gift-surprise">
								<Icon name="surprise" size={11} />{t('gifts.surprise.inline', { name })}
							</span>
						{/if}
						{#if gift.visibility === 'private'}
							<span aria-hidden="true">·</span>
							<span class="inline-flex items-center gap-1" title={t('common.onlyYouSee')}>
								<Icon name="private" size={11} />{t('common.privateInline')}
							</span>
						{/if}
					</p>
					{#if gift.when && whenState && asks(whenState) && mode === 'view'}
						<GiftWhenAsk
							gift={{ id: gift.id, title: gift.title, when: gift.when }}
							standing={whenState}
							{birth}
							{today}
							{estimateHref}
							{error}
						/>
					{/if}
					<!-- Under the idea rather than beside it, so a phone keeps the title on one line. -->
					{#if isOpenGift(gift.state) && mode === 'view'}
						<!-- Outlined, not filled: one per idea, so a list of them must not shout over the card's own add actions. -->
						<div class="mt-2 flex flex-wrap gap-2">
							{#if gift.state === 'idea'}
								<GiftBoughtButton {gift} bought onAway={(next) => (away = next)} />
							{/if}
							<Button variant="secondary" size="sm" type="button" onclick={() => start('give')}>
								{t('gifts.markGiven.open')}
							</Button>
							{#if gift.state === 'bought'}
								<GiftBoughtButton {gift} bought={false} onAway={(next) => (away = next)} />
							{/if}
						</div>
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
				<GiftGiveForm {gift} {today} {error} submit={savedGiven} onCancel={close} />
			{/if}
		{/if}
	</div>
</li>
