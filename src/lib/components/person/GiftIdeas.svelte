<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { PartialDate } from '#lib/dates/partial-date.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { occasionHeading } from '#lib/gifts/labels.js';
	import { byOccasion, occasionTally } from '#lib/gifts/occasions.js';
	import GiftRow from './GiftRow.svelte';
	import type { GiverChoices, GroupLink, PersonPageData } from './types';

	// The *Ideas* tab: open ideas, the waiting ones folded under *Later* (docs/dev/02 §2.25.8), and
	// the bought ones under *Ready to give* (§2.25.9) — or, once one has a giver or a day, every open
	// and bought gift under its occasion (§2.25.13).
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
		householdGivers: ReadonlySet<string>;
		places: string[];
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
		givers,
		householdGivers,
		places
	}: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const occasions = $derived(byOccasion([...open, ...ready], birth));
	let unfolded = $state(false);
</script>

{#snippet rows(list: PersonPageData['gifts'], testid: string)}
	<ul class="flex flex-col" data-testid={testid}>
		{#each list as gift (gift.id)}
			<GiftRow
				{householdGivers}
				{places}
				grouped={occasions !== null}
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

{#if occasions}
	{#each occasions as group (group.on)}
		{@const heading = occasionHeading(i18n, group, today)}
		{@const tally = occasionTally(group.gifts)}
		{@const openOnes = group.gifts.filter((gift) => gift.state !== 'bought')}
		{@const boughtOnes = group.gifts.filter((gift) => gift.state === 'bought')}
		<section class="mt-3 first:mt-0" data-testid="gift-occasion">
			<h3 class="flex flex-wrap items-baseline gap-x-2 border-b border-border-subtle pb-1">
				<span class="text-sm font-semibold text-fg">{heading.title}</span>
				{#if heading.near}<span class="text-xs text-fg-muted">{heading.near}</span>{/if}
				{#if group.on !== null}
					<span class="ml-auto text-xs text-fg-subtle tabular-nums" data-testid="gift-tally">
						{t('gifts.byOccasion.tally', tally)}
					</span>
				{/if}
			</h3>
			{#if openOnes.length > 0}{@render rows(openOnes, 'gift-ideas')}{/if}
			{#if boughtOnes.length > 0}
				<div class="opacity-70">{@render rows(boughtOnes, 'gift-ready')}</div>
			{/if}
		</section>
	{/each}
{:else if open.length > 0}
	{@render rows(open, 'gift-ideas')}
{:else if waiting.length > 0}
	<p class="py-2 text-sm text-fg-muted">{t('when.allWaiting')}</p>
{:else}
	<p class="py-2 text-sm text-fg-muted">
		{ready.length > 0 ? t('gifts.ideas.allBought', { name }) : t('gifts.ideas.empty', { name })}
	</p>
{/if}

{#if ready.length > 0 && occasions === null}
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
