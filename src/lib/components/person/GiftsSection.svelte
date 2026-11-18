<script lang="ts">
	import { browser } from '$app/environment';
	import { deviceDay, writersDay } from '$lib/dates/today';
	import { afterNavigate } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import KeptItem from '$lib/components/pwa/KeptItem.svelte';
	import MenuButton from '$lib/components/ui/MenuButton.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import { cardShape } from '$lib/people/empty-cards';
	import { datesEditorPath } from '$lib/people/identity-card';
	import { sectionAnchor } from '$lib/people/sections';
	import { giftGroupPath } from '$lib/gifts/group-form';
	import { asksForGiftIdea, byYear, giftTabs, splitIdeas, type GiftTab } from '$lib/gifts/card';
	import type { AddableGiftState } from '$lib/gifts/gifts';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { birthOf } from '$lib/when/resolve';
	import { giftAddCommand } from './gift-add-command';
	import GiftForm from './GiftForm.svelte';
	import GiftGroupPanel from '$lib/components/gifts/GiftGroupPanel.svelte';
	import { alsoFor } from '$lib/gifts/group-panel';
	import GiftIdeas from './GiftIdeas.svelte';
	import GiftRow from './GiftRow.svelte';
	import type { GroupLink, PersonForm, PersonPageData } from './types';

	/*
	 * The Gifts card (docs/dev/02 §2.25): open ideas, what was given and what was received, one tab
	 * each — *Received* only once there is one. *+ Idea* is the card's own button, *+ Given* sits
	 * beside it, *+ Received* waits in the ⋯ menu. With nothing noted the card is one line
	 * (docs/dev/05 §5.5), and *+ Given* joins *+ Received* in the menu so the line stays one line.
	 */
	let { data, form }: { data: PersonPageData; form: PersonForm } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const c = $derived(data.contact);
	// The writer's day, as the story's forms take it.
	const today = $derived(writersDay(data.today, browser ? deviceDay() : null));

	// A gift on its way out (docs/dev/02 §2.23) is gone from the card while its undo window is open,
	// and so is an open one whose group's *Remove all open* is (§2.25.11).
	const shown = $derived(
		data.gifts.filter(
			(g) =>
				!removals.isPending(removalKey('gift', g.id)) &&
				!(
					g.groupId &&
					g.state !== 'given' &&
					removals.isPending(removalKey('gift-group', `remove/${g.groupId}`))
				)
		)
	);
	const birth = $derived(birthOf(c));
	const estimateHref = $derived(datesEditorPath(c.id));
	// Ideas waiting for an age or a day are folded away, and out of the count (§2.25.8).
	const ideas = $derived(
		splitIdeas(
			shown.filter((g) => g.state === 'idea'),
			birth,
			data.today
		)
	);
	// Bought ones wait under *Ready to give*, out of the count like the waiting ones (§2.25.9).
	const ready = $derived(shown.filter((g) => g.state === 'bought'));
	const given = $derived(shown.filter((g) => g.state === 'given'));
	const received = $derived(shown.filter((g) => g.state === 'received'));
	const tabs = $derived(
		giftTabs({ ideas: ideas.open.length, given: given.length, received: received.length })
	);

	let tab = $state<GiftTab>('ideas');
	// The Received tab leaves with its last gift; the card falls back to the ideas.
	const current = $derived(tabs.some((entry) => entry.tab === tab) ? tab : 'ideas');

	/** Gifts noted here while Stella was out of reach (docs/dev/02 §2.18), until they are sent. */
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
	let adding = $state<AddableGiftState>('idea');
	$effect(() => {
		if (!open) adding = 'idea';
	});
	function startAdding(kind: AddableGiftState, close?: () => void) {
		close?.();
		adding = kind;
		open = true;
	}
	// The palette's *Gift idea for …* lands here with the idea form open (docs/dev/05 §5.4). On a
	// navigation, not on every load: a save reloads the page, and must not open it again.
	afterNavigate(({ to }) => {
		if (to && asksForGiftIdea(to.url)) startAdding('idea');
	});
	/** Where a gift just saved shows: its own tab. */
	function showTabOf(kind: AddableGiftState) {
		tab = kind === 'idea' ? 'ideas' : kind;
	}

	const HEADING = {
		idea: 'gifts.form.ideaFor',
		given: 'gifts.form.givenTo',
		received: 'gifts.form.receivedFrom'
	} as const;

	const closeAdding = () => (open = false);

	// Noting a gift saves through the outbox, keeping it when Stella cannot take it (§2.18).
	const keepGift = $derived(
		keepable(
			{
				toCommand: (formData, id) => giftAddCommand(formData, id, c.id, Date.now()),
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

	// *Who has it?* for the one idea several people get that is open (§2.25.11).
	let openGroupId = $state<string | null>(null);
	const openGroup = $derived(data.giftGroups.find((group) => group.id === openGroupId) ?? null);
	function groupOf(gift: PersonPageData['gifts'][number]): GroupLink | null {
		const group = gift.groupId && data.giftGroups.find((found) => found.id === gift.groupId);
		if (!group) return null;
		return { names: alsoFor(group.members, c.id), open: () => (openGroupId = group.id) };
	}

	const rowError = (giftId: string): string | null =>
		form?.giftRowError && form.giftRowError.giftId === giftId ? form.giftRowError.message : null;

	const MENU_ITEM =
		'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft';
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
				<!-- One idea for them and others, each with what it comes to (docs/dev/02 §2.25.11). -->
				<a href={giftGroupPath(c.id)} role="menuitem" class={MENU_ITEM} onclick={close}>
					<Icon name="people" size={14} />{t('gifts.several.menu')}
				</a>
				<!-- Every idea of the household on one page (docs/dev/02 §2.25.6). -->
				<a href="/gifts" role="menuitem" class={MENU_ITEM} onclick={close}>
					<Icon name="idea" size={14} />{t('gifts.allIdeas')}
				</a>
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
		<Tabs
			tabs={tabs.map((entry) => entry.tab)}
			chosen={current}
			onchoose={(next) => (tab = next)}
			label={t('gifts.tabs.label')}
			idPrefix="gift-tab"
			panel="gift-panel"
			class="mb-2"
		>
			{#snippet content(which)}
				{@const count = tabs.find((entry) => entry.tab === which)?.count ?? null}
				{t(`gifts.tab.${which}`)}{#if count !== null}<span class="tabular-nums"
						>{` · ${count}`}</span
					>{/if}
			{/snippet}
		</Tabs>

		<div role="tabpanel" id="gift-panel" aria-labelledby="gift-tab-{current}" data-tab={current}>
			{#if current === 'ideas'}
				<GiftIdeas
					open={ideas.open}
					waiting={ideas.waiting}
					{ready}
					gifts={shown}
					name={c.displayName}
					{today}
					{birth}
					{estimateHref}
					{rowError}
					onGiven={() => (tab = 'given')}
					recipientIsMember={data.recipientIsMember}
					{groupOf}
				/>
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
									{birth}
									{estimateHref}
									error={rowError(gift.id)}
									onGiven={() => (tab = 'given')}
									name={c.displayName}
									recipientIsMember={data.recipientIsMember}
									group={groupOf(gift)}
								/>
							{/each}
						</ul>
					{/each}
				{/if}
			{/if}
		</div>
	{/if}

	{#if openGroup}
		<GiftGroupPanel
			group={openGroup}
			contactId={c.id}
			people={data.people}
			{today}
			error={form?.giftGroupError?.groupId === openGroup.id ? form.giftGroupError.message : null}
			bind:open={() => openGroupId !== null, (next) => !next && (openGroupId = null)}
		/>
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
				{birth}
				{estimateHref}
				canChooseVisibility
				recipient={data.recipientIsMember ? c.displayName : null}
			/>
		{/key}
	{/snippet}
</Section>
