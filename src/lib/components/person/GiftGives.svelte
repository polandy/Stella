<script lang="ts">
	import { dayLabel } from '#lib/dates/labels.js';
	import { splitGives } from '#lib/gifts/card.js';
	import { occasionLabel } from '#lib/gifts/labels.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import WhenChip from '#lib/components/when/WhenChip.svelte';
	import GiftStateMark from './GiftStateMark.svelte';
	import type { PersonPageData } from './types';

	// The *Gives* tab (docs/dev/02 §2.25.15): what this person gives whom, open ones first.
	interface Props {
		gives: PersonPageData['gives'];
		name: string;
		today: string;
	}
	let { gives, name, today }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const split = $derived(splitGives(gives));
</script>

{#snippet row(gift: PersonPageData['gives'][number])}
	<li class="flex items-start gap-2 py-1.5" data-testid="gift-gives-row">
		<GiftStateMark state={gift.state} />
		<div class="min-w-0 flex-1">
			<p class="text-sm text-fg">{gift.title}</p>
			<p class="text-sm text-fg-muted">
				<a href="/contacts/{gift.contactId}" class="hover:text-fg hover:underline">
					{t('gifts.gives.for', { name: gift.contactName })}
				</a>
				{#if gift.givenOn}
					<span>
						· {dayLabel(i18n, gift.givenOn)}{#if gift.occasion}
							· {occasionLabel(t, gift.occasion)}{/if}
					</span>
				{/if}
			</p>
			{#if gift.when}
				<WhenChip when={gift.when} state={null} {today} />
			{/if}
			{#if gift.hiddenFromRecipient}
				<p class="text-xs text-fg-subtle">{t('gifts.gives.kept', { name: gift.contactName })}</p>
			{/if}
		</div>
	</li>
{/snippet}

<p class="pb-2 text-sm text-fg-muted">{t('gifts.gives.hint', { name })}</p>
{#if gives.length === 0}
	<p class="py-2 text-sm text-fg-muted">{t('gifts.gives.none', { name })}</p>
{:else}
	{#if split.open.length > 0}
		<ul class="flex flex-col" data-testid="gift-gives-open">
			{#each split.open as gift (gift.id)}{@render row(gift)}{/each}
		</ul>
	{/if}
	{#if split.earlier.length > 0}
		<h3
			class="mt-3 mb-0.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase first:mt-0"
		>
			{t('gifts.gives.earlier')}
		</h3>
		<ul class="flex flex-col" data-testid="gift-gives-earlier">
			{#each split.earlier as gift (gift.id)}{@render row(gift)}{/each}
		</ul>
	{/if}
{/if}
