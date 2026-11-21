<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { PartialDate } from '#lib/dates/partial-date.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import GiftRow from './GiftRow.svelte';
	import type { GiverChoices, GroupLink, PersonPageData } from './types';

	// The *Ideas* tab: open ideas, the waiting ones folded under *Later* (docs/dev/02 §2.25.8), and
	// the bought ones under *Ready to give* (§2.25.9).
	interface Props {
		open: PersonPageData['gifts'];
		waiting: PersonPageData['gifts'];
		ready: PersonPageData['gifts'];
		gifts: PersonPageData['gifts'];
		name: string;
		today: string;
		birth: PartialDate | null;
		estimateHref: string;
		rowError: (giftId: string) => string | null;
		onGiven: () => void;
		recipientIsMember: boolean;
		groupOf: (gift: PersonPageData['gifts'][number]) => GroupLink | null;
		givers: GiverChoices;
	}
	let {
		open,
		waiting,
		ready,
		gifts,
		name,
		today,
		birth,
		estimateHref,
		rowError,
		onGiven,
		recipientIsMember,
		groupOf,
		givers
	}: Props = $props();

	const t = useI18n().t;
	let unfolded = $state(false);
</script>

{#snippet rows(list: PersonPageData['gifts'], testid: string)}
	<ul class="flex flex-col" data-testid={testid}>
		{#each list as gift (gift.id)}
			<GiftRow
				{gift}
				{gifts}
				{today}
				{birth}
				{estimateHref}
				error={rowError(gift.id)}
				{onGiven}
				{name}
				{recipientIsMember}
				group={groupOf(gift)}
				{givers}
			/>
		{/each}
	</ul>
{/snippet}

{#if open.length > 0}
	{@render rows(open, 'gift-ideas')}
{:else if waiting.length > 0}
	<p class="py-2 text-sm text-fg-muted">{t('when.allWaiting')}</p>
{:else}
	<p class="py-2 text-sm text-fg-muted">
		{ready.length > 0 ? t('gifts.ideas.allBought', { name }) : t('gifts.ideas.empty', { name })}
	</p>
{/if}

{#if ready.length > 0}
	<h3
		class="mt-3 mb-0.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase"
		data-testid="gift-ready-heading"
	>
		{t('gifts.ready')}<span class="tabular-nums">{` · ${ready.length}`}</span>
	</h3>
	{@render rows(ready, 'gift-ready')}
{/if}

{#if waiting.length > 0}
	<button
		type="button"
		class="mt-2 inline-flex items-center gap-1 text-xs font-semibold tracking-wide text-fg-subtle uppercase hover:text-fg"
		aria-expanded={unfolded}
		onclick={() => (unfolded = !unfolded)}
		data-testid="gift-later"
	>
		<Icon name={unfolded ? 'collapse' : 'expand'} size={12} />{t('when.fold', {
			count: waiting.length
		})}
	</button>
	{#if unfolded}
		<div class="opacity-80">{@render rows(waiting, 'gift-waiting')}</div>
	{/if}
{/if}
