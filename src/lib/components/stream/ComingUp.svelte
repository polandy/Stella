<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { occasionLabel, whenLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { glide } from '$lib/motion/motion.svelte';
	import { contactSectionPath } from '$lib/people/sections';
	import { railSummary } from '$lib/stream/rail-summary';
	import type { PageData } from '../../../routes/(app)/$types';
	import RailSection from './RailSection.svelte';

	/*
	 * Home's *Coming up* (docs/02 §2.13): the birthdays and anniversaries close ahead, each with
	 * *Write a moment* and the gift ideas noted for it, in the rail beside or above the stream.
	 */
	let { upcoming }: { upcoming: PageData['upcoming'] } = $props();

	const i18n = useI18n();
	const t = i18n.t;

	// One vertical list at every width — beside the stream from lg, above or below it on a
	// phone. Nothing scrolls sideways, so nothing hides off the right edge.
	const LIST = 'flex flex-col';
	const ROW =
		'grid grid-cols-[28px_1fr] items-center gap-2.5 rounded-app px-1.5 py-1.5 transition-colors hover:bg-card';
	// A phone shows the first few rows and keeps the rest one tap away; from lg the whole list
	// is there (docs/05 §5.5).
	const CAP = 3;
	const OVERFLOW = 'max-lg:hidden';
	let showAll = $state(false);

	/** The folded line on a phone: *3 · Mia turns 7 · on Saturday* (docs/05 §5.5.1). */
	const summary = $derived.by(() => {
		const [first] = upcoming;
		if (!first) return '';
		const when = whenLabel(i18n, first.daysUntil, first.date);
		return railSummary(
			upcoming.length,
			`${first.contactName} ${occasionLabel(i18n, first)} · ${when}`
		);
	});
</script>

<RailSection icon="calendar" title={t('home.comingUp')} {summary} testid="coming-up">
	<!-- *Show all* opens the rest of the list in place (docs/05 §5.11). -->
	<ul class={LIST} use:glide={{ key: showAll }}>
		{#each upcoming as item, i (item.contactId + item.date + item.kind)}
			<li class="{ROW} {i >= CAP && !showAll ? OVERFLOW : ''}">
				<Avatar
					id={item.contactId}
					name={item.contactName}
					avatarPhotoId={item.avatarPhotoId}
					size={28}
				/>
				<div class="min-w-0 text-[13px] leading-snug text-fg-muted">
					<a href="/contacts/{item.contactId}" class="font-semibold text-fg hover:underline"
						>{item.contactName}</a
					>
					<span>{occasionLabel(i18n, item)}</span>
					<span class="block text-xs text-fg-subtle">
						{whenLabel(i18n, item.daysUntil, item.date)}
						<span aria-hidden="true">·</span>
						<!-- A line of its own height on a touch screen, so the name above stays
							     its own target (docs/05 §5.9). -->
						<a
							href="/?about={item.contactId}"
							class="text-link hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-6 pointer-coarse:items-center"
							>{t('home.writeMoment')}</a
						>
					</span>
					{#if item.giftIdeas > 0}
						<!-- The occasion is the moment an idea was noted for (docs/02 §2.13.3). -->
						<a
							href={contactSectionPath(item.contactId, 'gifts')}
							class="mt-0.5 inline-flex items-center gap-1 text-xs text-link hover:underline"
							aria-label={t('home.giftIdeasFor', {
								count: item.giftIdeas,
								name: item.contactName
							})}
							data-testid="coming-up-gift-ideas"
							><Icon name="gift" size={12} />{t('home.giftIdeas', {
								count: item.giftIdeas
							})}</a
						>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
	{#if upcoming.length > CAP && !showAll}
		<button
			type="button"
			class="self-start px-1.5 pt-1.5 text-xs font-medium text-link hover:underline lg:hidden"
			onclick={() => (showAll = true)}
		>
			{t('home.showAll', { count: upcoming.length })}
		</button>
	{/if}
</RailSection>
