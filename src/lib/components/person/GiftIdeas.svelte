<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { PartialDate } from '$lib/dates/partial-date';
	import { useI18n } from '$lib/i18n/context.svelte';
	import GiftRow from './GiftRow.svelte';
	import type { PersonPageData } from './types';

	// The *Ideas* tab: open ideas, and the waiting ones folded under *Later* (docs/dev/02 §2.25.8).
	interface Props {
		open: PersonPageData['gifts'];
		waiting: PersonPageData['gifts'];
		gifts: PersonPageData['gifts'];
		name: string;
		today: string;
		birth: PartialDate | null;
		estimateHref: string;
		rowError: (giftId: string) => string | null;
		onGiven: () => void;
	}
	let { open, waiting, gifts, name, today, birth, estimateHref, rowError, onGiven }: Props =
		$props();

	const t = useI18n().t;
	let unfolded = $state(false);
</script>

{#snippet rows(list: PersonPageData['gifts'], testid: string)}
	<ul class="flex flex-col" data-testid={testid}>
		{#each list as gift (gift.id)}
			<GiftRow {gift} {gifts} {today} {birth} {estimateHref} error={rowError(gift.id)} {onGiven} />
		{/each}
	</ul>
{/snippet}

{#if open.length > 0}
	{@render rows(open, 'gift-ideas')}
{:else}
	<p class="py-2 text-sm text-fg-muted">
		{waiting.length > 0 ? t('when.allWaiting') : t('gifts.ideas.empty', { name })}
	</p>
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
