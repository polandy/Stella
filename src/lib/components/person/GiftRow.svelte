<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import RemoveButton from '#lib/components/ui/RemoveButton.svelte';
	import { dayLabel } from '#lib/dates/labels.js';
	import type { PartialDate } from '#lib/dates/partial-date.js';
	import { addedLabel, giverSegments, occasionLabel } from '#lib/gifts/labels.js';
	import { useGiftCurrency } from '#lib/gifts/currency.svelte.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { reveal } from '#lib/motion/motion.svelte.js';
	import { isOpenGift } from '#lib/gifts/gifts.js';
	import { useRemovals } from '#lib/undo/context.svelte.js';
	import { savedEnhance } from '#lib/undo/saved.js';
	import GiverText from '#lib/components/gifts/GiverText.svelte';
	import WhenChip from '#lib/components/when/WhenChip.svelte';
	import { ideaState } from '#lib/gifts/idea-when.js';
	import { asks } from '#lib/when/state.js';
	import { tick } from 'svelte';
	import GiftAssignForm from './GiftAssignForm.svelte';
	import GiftForm from './GiftForm.svelte';
	import { handsOver } from '#lib/gifts/occasions.js';
	import GiftBoughtSheet from './GiftBoughtSheet.svelte';
	import GiftGiveForm from './GiftGiveForm.svelte';
	import GiftRowActions from './GiftRowActions.svelte';
	import GiftStateMark from './GiftStateMark.svelte';
	import GiftWhenAsk from './GiftWhenAsk.svelte';
	import type { GiverChoices, GroupLink, PersonPageData } from './types';

	/*
	 * One gift on the Gifts card (docs/dev/02 §2.25): what it is, its note, when and why it was given,
	 * who noted it — and what can be done with it. An idea offers *Besorgt…*, or *Erledigt* when
	 * someone outside the household gives it (§2.25.9), and *Mark as given*, which asks only for the
	 * day and the occasion; a bought one *Mark as given* and its undo; either one *Vergeben…* to
	 * whoever gives it (§2.25.12). Every gift can be rewritten in place and removed with the undo
	 * every removal has (docs/dev/02 §2.23).
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
		/** Whom *Vergeben…* offers as the giver. */
		givers: GiverChoices;
		/** The household's own givers: their gifts are *besorgt*, anyone else's *erledigt* (D17). */
		householdGivers: ReadonlySet<string>;
		/** Where bought gifts already wait, for *Besorgt…* (D20). */
		places: string[];
		/** The card is grouped by occasion: an idea nobody gives reads *still free*. */
		grouped?: boolean;
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
		group = null,
		givers,
		householdGivers,
		places,
		grouped = false
	}: Props = $props();

	const i18n = useI18n();
	const money = useGiftCurrency();
	const t = i18n.t;
	const removals = useRemovals();
	const listOf = (names: string[]) =>
		new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(names);

	// A refused save leaves its form open (`savedEnhance` closes only on success), so the
	// reason stands in the form it is about.
	let mode = $state<'view' | 'edit' | 'give' | 'assign' | 'buy'>('view');
	let row = $state<HTMLElement>();
	// Held by its toast, or on its way after *Bought* / *Not bought yet*.
	let away = $state(false);

	async function start(next: 'edit' | 'give' | 'assign' | 'buy') {
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
	const giver = $derived(giverSegments(t, gift.giver, gift.state));
	const ours = $derived(handsOver(gift.giver, householdGivers));
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
					<p class="font-medium break-words text-fg">
						{gift.title}{#if gift.value !== null}<span
								class="font-normal text-fg-muted"
								data-testid="gift-value"
							>
								· {money.label(gift.value)}</span
							>{/if}
					</p>
					{#if when}<p class="text-sm text-fg-muted">{when}</p>{/if}
					{#if giver}<p class="text-sm text-fg-muted" data-testid="gift-giver-line">
							<GiverText segments={giver} />
						</p>
					{:else if grouped && gift.state === 'idea'}
						<p class="text-sm text-fg-subtle" data-testid="gift-free">{t('gifts.free')}</p>
					{/if}
					{#if gift.state === 'bought' && gift.storedAt}
						<p
							class="inline-flex items-center gap-1 text-sm text-fg-muted"
							title={t('gifts.storedAt')}
							data-testid="gift-stored-at"
						>
							<Icon name="stored" size={13} /><span class="sr-only">{t('gifts.storedAt')}:</span>
							{gift.storedAt}
						</p>
					{/if}
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
						<GiftRowActions {gift} {ours} onStart={start} onAway={(next) => (away = next)} />
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

			{#if mode === 'buy'}
				<GiftBoughtSheet
					{gift}
					{name}
					recipient={recipientIsMember ? name : null}
					{places}
					onAway={(next) => {
						away = next;
						if (next) mode = 'view';
					}}
					onCancel={close}
				/>
			{:else if mode === 'give'}
				<GiftGiveForm {gift} {today} {error} submit={savedGiven} onCancel={close} />
			{:else if mode === 'assign'}
				<GiftAssignForm
					{gift}
					{givers}
					recipient={recipientIsMember ? name : null}
					{birth}
					{today}
					{estimateHref}
					{error}
					submit={savedEdit}
					onCancel={close}
				/>
			{/if}
		{/if}
	</div>
</li>
