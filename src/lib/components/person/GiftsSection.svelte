<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { cardShape } from '$lib/contacts/empty-cards';
	import { sectionAnchor } from '$lib/contacts/sections';
	import { asksForGiftIdea, byYear, giftTabs, type GiftTab } from '$lib/gifts/card';
	import { isGiftState, occasionFromForm, type GiftState } from '$lib/gifts/gifts';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import GiftForm from './GiftForm.svelte';
	import GiftRow from './GiftRow.svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * The Gifts card (docs/02 §2.25): open ideas, what was given and what was received, one tab
	 * each — *Received* only once there is one. *+ Idea* is the card's own button, *+ Given* sits
	 * beside it, *+ Received* waits in the ⋯ menu. With nothing noted the card is one line
	 * (docs/05 §5.5), and *+ Given* joins *+ Received* in the menu so the line stays one line.
	 */
	let { data, form }: { data: PersonPageData; form: PersonForm } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const c = $derived(data.contact);
	// The writer's day, as the story's forms take it.
	const today = new Date().toLocaleDateString('en-CA');

	// A gift on its way out (docs/02 §2.23) is gone from the card while its undo window is open.
	const shown = $derived(data.gifts.filter((g) => !removals.isPending(removalKey('gift', g.id))));
	const ideas = $derived(shown.filter((g) => g.state === 'idea'));
	const given = $derived(shown.filter((g) => g.state === 'given'));
	const received = $derived(shown.filter((g) => g.state === 'received'));
	const tabs = $derived(
		giftTabs({ ideas: ideas.length, given: given.length, received: received.length })
	);

	let tab = $state<GiftTab>('ideas');
	// The Received tab leaves with its last gift; the card falls back to the ideas.
	const current = $derived(tabs.some((entry) => entry.tab === tab) ? tab : 'ideas');

	/** Gifts noted here while Stella was out of reach (docs/02 §2.18), until they are sent. */
	const kept = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'gift.add'> =>
				isKept(item, 'gift.add') && item.command.payload.contactId === c.id
		)
	);
	const holdsSomething = $derived(shown.length > 0 || kept.length > 0);
	const line = $derived(cardShape('gifts', holdsSomething) === 'line');

	// Which form the card's one form slot holds; *+ Idea* is its own button, so it is the rest.
	let open = $state(false);
	let adding = $state<GiftState>('idea');
	$effect(() => {
		if (!open) adding = 'idea';
	});
	function startAdding(kind: GiftState, close?: () => void) {
		close?.();
		adding = kind;
		open = true;
	}
	// The palette's *Gift idea for …* lands here with the idea form open (docs/05 §5.4). On a
	// navigation, not on every load: a save reloads the page, and must not open it again.
	afterNavigate(({ to }) => {
		if (to && asksForGiftIdea(to.url)) startAdding('idea');
	});
	/** Where a gift just saved shows: its own tab. */
	function showTabOf(kind: GiftState) {
		tab = kind === 'idea' ? 'ideas' : kind;
	}

	const HEADING = {
		idea: 'gifts.form.ideaFor',
		given: 'gifts.form.givenTo',
		received: 'gifts.form.receivedFrom'
	} as const;

	const text = (data: FormData, key: string): string | null => {
		const value = String(data.get(key) ?? '').trim();
		return value.length > 0 ? value : null;
	};
	const closeAdding = () => (open = false);

	// Noting a gift saves through the outbox, keeping it when Stella cannot take it (§2.18).
	const keepGift = $derived(
		keepable(
			{
				toCommand: (formData, id) => {
					const title = text(formData, 'title');
					const state = String(formData.get('state') ?? '');
					const givenOn = text(formData, 'givenOn');
					if (!title || !isGiftState(state) || (state !== 'idea' && !givenOn)) return null;
					return {
						id,
						type: 'gift.add',
						payload: {
							contactId: c.id,
							state,
							title,
							note: text(formData, 'note'),
							url: text(formData, 'url'),
							givenOn: state === 'idea' ? null : givenOn,
							occasion: occasionFromForm(
								text(formData, 'occasionChoice'),
								text(formData, 'occasionText')
							),
							visibility: formData.get('visibility') === 'private' ? 'private' : 'shared'
						},
						issuedAt: Date.now()
					};
				},
				about: c.displayName,
				errorKey: 'giftError',
				onApplied: (_result, command) => {
					removals.notify(t('components.saved'));
					if (command.type === 'gift.add') showTabOf(command.payload.state);
					closeAdding();
				},
				onKept: closeAdding
			},
			savedEnhance(removals, t('components.saved'), closeAdding)
		)
	);

	const rowError = (giftId: string): string | null =>
		form?.giftRowError && form.giftRowError.giftId === giftId ? form.giftRowError.message : null;

	const MENU_ITEM =
		'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft';

	function stepTab(event: KeyboardEvent) {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		const order = tabs.map((entry) => entry.tab);
		const at = order.indexOf(current) + (event.key === 'ArrowRight' ? 1 : -1);
		tab = order[(at + order.length) % order.length];
		document.getElementById(`gift-tab-${tab}`)?.focus();
	}
</script>

<Section
	id={sectionAnchor('gifts')}
	title={t('gifts.title')}
	addLabel={t('gifts.addIdea')}
	empty={line ? t('gifts.none') : undefined}
	error={form?.giftError ?? null}
	bind:open
>
	{#snippet action()}
		{#if !line && !open}
			<Button
				variant="ghost"
				size="sm"
				type="button"
				icon="add"
				onclick={() => startAdding('given')}
			>
				{t('gifts.addGiven')}
			</Button>
		{/if}
	{/snippet}
	{#snippet menu()}
		<MenuButton label={t('gifts.menu')} align="end" look="button">
			{#snippet trigger()}<Icon name="more" size={16} />{/snippet}
			{#snippet children({ close })}
				{#if line}
					<button
						type="button"
						role="menuitem"
						class={MENU_ITEM}
						onclick={() => startAdding('given', close)}
					>
						<Icon name="add" size={14} />{t('gifts.addGiven')}
					</button>
				{/if}
				<button
					type="button"
					role="menuitem"
					class={MENU_ITEM}
					onclick={() => startAdding('received', close)}
				>
					<Icon name="add" size={14} />{t('gifts.addReceived')}
				</button>
			{/snippet}
		</MenuButton>
	{/snippet}

	{#if kept.length > 0}
		<ul class="mb-3 flex flex-col gap-2" data-testid="kept-gifts">
			{#each kept as item (item.command.id)}
				<li>
					<KeptItem {item}>
						<p class="mt-1 text-fg">{item.command.payload.title}</p>
					</KeptItem>
				</li>
			{/each}
		</ul>
	{/if}

	{#if shown.length > 0}
		<div
			role="tablist"
			aria-label={t('gifts.tabs.label')}
			tabindex="-1"
			class="mb-2 flex w-fit max-w-full gap-1 rounded-full bg-bg-sunken p-1"
			onkeydown={stepTab}
		>
			{#each tabs as entry (entry.tab)}
				<button
					type="button"
					role="tab"
					id="gift-tab-{entry.tab}"
					aria-selected={current === entry.tab}
					aria-controls="gift-panel"
					tabindex={current === entry.tab ? 0 : -1}
					onclick={() => (tab = entry.tab)}
					class="rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap text-fg-muted transition-colors hover:text-fg aria-selected:bg-card aria-selected:font-medium aria-selected:text-fg aria-selected:shadow-card"
				>
					{t(`gifts.tab.${entry.tab}`)}{#if entry.count !== null}<span class="tabular-nums"
							>{` · ${entry.count}`}</span
						>{/if}
				</button>
			{/each}
		</div>

		<div role="tabpanel" id="gift-panel" aria-labelledby="gift-tab-{current}" data-tab={current}>
			{#if current === 'ideas'}
				{#if ideas.length === 0}
					<p class="py-2 text-sm text-fg-muted">
						{t('gifts.ideas.empty', { name: c.displayName })}
					</p>
				{:else}
					<ul class="flex flex-col" data-testid="gift-ideas">
						{#each ideas as gift (gift.id)}
							<GiftRow
								{gift}
								gifts={shown}
								{today}
								error={rowError(gift.id)}
								onGiven={() => (tab = 'given')}
							/>
						{/each}
					</ul>
				{/if}
			{:else}
				{@const list = current === 'given' ? given : received}
				{#if list.length === 0}
					<p class="py-2 text-sm text-fg-muted">{t('gifts.given.empty')}</p>
				{:else}
					{#each byYear(list) as year (year.year)}
						<h3
							class="mt-3 mb-0.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase first:mt-0"
						>
							{year.year}
						</h3>
						<ul class="flex flex-col" data-testid="gift-year">
							{#each year.gifts as gift (gift.id)}
								<GiftRow
									{gift}
									gifts={shown}
									{today}
									error={rowError(gift.id)}
									onGiven={() => (tab = 'given')}
								/>
							{/each}
						</ul>
					{/each}
				{/if}
			{/if}
		</div>
	{/if}

	{#snippet editor()}
		<!-- A fresh form per kind: what an idea folds away, a given gift asks for. -->
		{#key adding}
			<GiftForm
				kind={adding}
				gifts={shown}
				heading={t(HEADING[adding], { name: c.displayName })}
				action="?/addGift"
				submit={keepGift}
				{today}
				canChooseVisibility
			/>
		{/key}
	{/snippet}
</Section>
