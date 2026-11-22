<script lang="ts">
	import GiverText from './GiverText.svelte';
	import GiftStateMark from '#lib/components/person/GiftStateMark.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { giverSegments, occasionHeading } from '#lib/gifts/labels.js';
	import type { OverviewOccasion } from '#lib/gifts/occasion-overview.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { contactSectionPath } from '#lib/people/sections.js';

	/*
	 * The household's list by occasion (docs/dev/02 §2.25.6): under each day every recipient, who
	 * gives what, what is done and what is still free. Read-only; a gift is changed on its
	 * person's Gifts card, which each recipient's name opens.
	 */
	interface Props {
		occasions: readonly OverviewOccasion[];
		today: string;
		/** Opens *Record given…* on a passed occasion's day. */
		onRecord: (on: string) => void;
	}
	let { occasions, today, onRecord }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
</script>

{#each occasions as occasion (occasion.on)}
	{@const heading = occasionHeading(
		i18n,
		{ on: occasion.on, when: occasion.on ? { kind: 'on_date', on: occasion.on } : null },
		today
	)}
	<section
		class="rounded-app bg-card p-4 shadow-card"
		data-testid="gift-occasion"
		aria-label={heading.title}
	>
		<h2 class="flex flex-wrap items-baseline gap-x-2 border-b border-border-subtle pb-1">
			<span class="font-semibold text-fg">{heading.title}</span>
			{#if heading.near}<span class="text-xs text-fg-muted">{heading.near}</span>{/if}
			{#if occasion.on !== null}
				<span class="ml-auto text-xs text-fg-subtle tabular-nums" data-testid="gift-tally">
					{t('gifts.byOccasion.tally', occasion.tally)}
				</span>
			{/if}
		</h2>
		{#if occasion.on !== null && occasion.on < today}
			<p class="mt-1.5 text-xs text-fg-muted" data-testid="gift-occasion-over">
				{t('gifts.record.over', { occasion: heading.title })}
				<button
					type="button"
					class="font-medium text-primary underline-offset-2 hover:underline"
					onclick={() => occasion.on && onRecord(occasion.on)}>{t('gifts.record.overLink')}</button
				>
			</p>
		{/if}
		{#each occasion.recipients as recipient (recipient.contactId)}
			<div class="mt-3" data-testid="gift-occasion-recipient">
				<div class="flex items-center gap-2">
					<Avatar
						id={recipient.contactId}
						name={recipient.contactName}
						avatarPhotoId={recipient.avatarPhotoId}
						size={28}
					/>
					<a
						href={contactSectionPath(recipient.contactId, 'gifts')}
						class="min-w-0 flex-1 font-medium break-words text-fg hover:underline"
						>{recipient.contactName}</a
					>
					<span class="shrink-0 text-xs text-fg-muted tabular-nums">
						{t('gifts.byOccasion.tally', recipient.tally)}
					</span>
				</div>
				<ul class="mt-1">
					{#each recipient.gifts as gift (gift.id)}
						{@const giver = giverSegments(t, gift.giver, gift.state)}
						<li
							class="flex gap-3 border-t border-border-subtle py-2 first:border-t-0"
							class:opacity-70={gift.state === 'bought'}
							data-testid="gift-occasion-gift"
						>
							<GiftStateMark state={gift.state} />
							<div class="min-w-0 flex-1">
								<p class="font-medium break-words text-fg">{gift.title}</p>
								{#if giver ?? (gift.state === 'idea' ? t('gifts.free') : null)}
									<p class="text-sm text-fg-muted">
										{#if giver}<GiverText segments={giver} />{:else}{t('gifts.free')}{/if}
									</p>
								{/if}
								{#if gift.hiddenFromRecipient}
									<p class="inline-flex items-center gap-1 text-xs text-fg-subtle">
										<Icon name="surprise" size={11} />{t('gifts.surprise.inline', {
											name: recipient.contactName
										})}
									</p>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</section>
{/each}
