<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import GiftRecordSheet from '#lib/components/gifts/GiftRecordSheet.svelte';
	import IdeaListRow from '#lib/components/gifts/IdeaListRow.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { foldWaiting } from '#lib/gifts/idea-list.js';
	import { nextOccasionLabel } from '#lib/gifts/labels.js';
	import { waitingPreference, type WaitingPreference } from '#lib/gifts/waiting-preference.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { contactSectionPath } from '#lib/people/sections.js';
	import { useRemovals } from '#lib/undo/context.svelte.js';
	import { removalKey } from '#lib/undo/keys.js';
	import { SvelteSet } from 'svelte/reactivity';
	import type { ActionData, PageData } from './$types';

	/*
	 * Every open gift idea of the household (docs/dev/02 §2.25.6), one card per person, whoever's
	 * occasion comes next on top. An idea given here leaves the list while its undo window runs
	 * and for as long as its answer is on the way. Ideas still waiting for their time stay folded
	 * away unless the viewer chose to see them (§2.25.8).
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	/** An occasion this close is the one to shop for now. */
	const SOON_DAYS = 30;

	/** Ideas whose answer left the undo window and is being sent. */
	const sending = new SvelteSet<string>();
	const shown = (giftId: string) =>
		!sending.has(giftId) && !removals.isPending(removalKey('gift', giftId));

	let showWaiting = $state(false);
	let preference: WaitingPreference | undefined;
	onMount(() => {
		try {
			preference = waitingPreference(localStorage, data.viewerId);
			showWaiting = preference.load();
		} catch {
			// Merely reading `localStorage` throws where storage is blocked; they stay hidden.
		}
	});
	function toggleWaiting() {
		showWaiting = !showWaiting;
		preference?.save(showWaiting);
	}

	const listed = $derived(
		data.groups.map((group) => ({
			...group,
			ideas: group.ideas.filter((idea) => shown(idea.id))
		}))
	);
	const hasWaiting = $derived(
		listed.some((group) => group.ideas.some((idea) => idea.whenState?.kind === 'waiting'))
	);
	const folded = $derived(foldWaiting(listed, showWaiting));
	const groups = $derived(folded.groups);
	const open = $derived(
		groups.reduce(
			(sum, group) => sum + group.ideas.filter((idea) => idea.whenState?.kind !== 'waiting').length,
			0
		)
	);

	function settled(giftId: string, sent: boolean) {
		// Fresh data first, then let go: by then the given idea is no longer in it.
		if (sent) void invalidateAll().then(() => sending.delete(giftId));
		else sending.delete(giftId);
	}

	// *Record given…* for everyone (§2.25.14): whom each row is for is chosen on the row.
	let recording = $state(false);

	const rowError = (giftId: string) =>
		form?.giftRowError?.giftId === giftId ? form.giftRowError.message : null;
</script>

<svelte:head><title>{t('common.pageTitle', { page: t('gifts.list.title') })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-6 md:py-10">
	<header class="flex flex-col gap-1">
		<div class="flex items-start gap-2">
			<h1 class="flex flex-1 items-baseline gap-2 text-2xl font-semibold text-fg">
				{t('gifts.list.title')}
				{#if open > 0}
					<span class="text-sm font-normal text-fg-muted" data-testid="gift-list-open"
						>{t('gifts.list.open', { count: open })}</span
					>
				{/if}
			</h1>
			<Button
				variant="secondary"
				size="sm"
				type="button"
				icon="gift"
				onclick={() => (recording = true)}
				data-testid="gift-record-open">{t('gifts.record.open')}</Button
			>
		</div>
		<p class="text-sm text-fg-muted">{t('gifts.list.intro')}</p>
		{#if hasWaiting}
			<button
				type="button"
				class="mt-1 inline-flex items-center gap-1 self-start text-xs font-semibold tracking-wide text-fg-subtle uppercase hover:text-fg"
				aria-pressed={showWaiting}
				onclick={toggleWaiting}
				data-testid="gift-list-waiting"
			>
				<Icon name={showWaiting ? 'collapse' : 'expand'} size={12} />{t(
					'gifts.list.waitingToggle',
					{ count: folded.hidden }
				)}
			</button>
		{/if}
	</header>

	{#if groups.length}
		{#each groups as group (group.contactId)}
			<section
				class="rounded-app bg-card p-4 shadow-card"
				aria-labelledby="gift-list-{group.contactId}"
				data-testid="gift-list-group"
			>
				<div class="flex items-center gap-3">
					<Avatar
						id={group.contactId}
						name={group.contactName}
						avatarPhotoId={group.avatarPhotoId}
					/>
					<div class="min-w-0 flex-1">
						<h2 id="gift-list-{group.contactId}" class="font-semibold break-words text-fg">
							<a href={contactSectionPath(group.contactId, 'gifts')} class="hover:underline"
								>{group.contactName}</a
							>
						</h2>
						<p
							class="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs {group
								.next.daysUntil <= SOON_DAYS
								? 'bg-warning-soft font-medium text-fg'
								: 'bg-bg-sunken text-fg-muted'}"
							data-testid="gift-list-next"
						>
							<Icon name={group.next.kind === 'birthday' ? 'calendar' : 'gift'} size={11} />
							{nextOccasionLabel(i18n, group.next)}
						</p>
					</div>
					<span class="shrink-0 text-xs text-fg-muted"
						>{t('gifts.list.ideas', { count: group.ideas.length })}</span
					>
				</div>
				<ul class="mt-2">
					{#each group.ideas as idea (idea.id)}
						<IdeaListRow
							{idea}
							next={group.next}
							today={data.today}
							error={rowError(idea.id)}
							onSending={(giftId) => sending.add(giftId)}
							onSettled={settled}
						/>
					{/each}
				</ul>
			</section>
		{/each}
	{:else if hasWaiting}
		<p class="py-2 text-sm text-fg-muted" data-testid="gift-list-all-waiting">
			{t('gifts.list.allWaiting')}
		</p>
	{:else}
		<EmptyState icon="idea" title={t('gifts.list.empty')} hint={t('gifts.list.emptyHint')} />
	{/if}
</main>

<GiftRecordSheet
	bind:open={recording}
	recipient={null}
	birth={null}
	today={data.today}
	planned={data.planned}
	start={null}
	people={data.people}
	ties={[]}
	household={[]}
	gifts={[]}
	error={form && 'giftRecordError' in form ? (form.giftRecordError ?? null) : null}
/>
