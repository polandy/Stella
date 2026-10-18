<!--
  @component
  The circle page's "Sub-circles · N" card (docs/02 §2.4.2): one row per direct sub-circle, each
  a link to it, with its period on a shared timeline. An undated row has no bar; with no dated
  row at all the card is a plain list. The bars are decoration — the label says the period.
-->
<script lang="ts">
	import Section from '$lib/components/ui/Section.svelte';
	import { circlePeriodLabel } from '$lib/circles/period';
	import { circleTimeline } from '$lib/circles/timeline';
	import type { TreeCircle } from '$lib/circles/tree';
	import { accentDotStyle } from '$lib/design/tokens';
	import { useI18n } from '$lib/i18n/context.svelte';

	interface Props {
		/** The direct sub-circles in sibling order, each with how many circles lie further inside. */
		circles: (TreeCircle & { descendantCount: number })[];
		/** Direct sub-circles the reader may not see: counted, never named. */
		hiddenCount: number;
		/** Today (YYYY-MM-DD), where the timeline's marker stands. */
		today: string;
	}

	let { circles, hiddenCount, today }: Props = $props();

	const lang = useI18n();
	const t = lang.t;
	const timeline = $derived(circleTimeline(circles, today));
	// A year mark too close to the today label would print over it; today wins.
	const TICK_CLEARANCE = 8;
	const ticks = $derived(
		(timeline?.ticks ?? []).filter(
			(tick) => timeline?.today == null || Math.abs(tick.at - timeline.today) >= TICK_CLEARANCE
		)
	);

	function detail(circle: Props['circles'][number]): string {
		return [
			circlePeriodLabel(lang, circle.startDate, circle.endDate) ?? t('circles.sub.noPeriod'),
			t('circles.memberCount', { count: circle.memberCount }),
			circle.descendantCount > 0 ? t('circles.sub.inside', { count: circle.descendantCount }) : null
		]
			.filter(Boolean)
			.join(' · ');
	}
</script>

<Section title={t('circles.sub.heading')} count={circles.length + hiddenCount}>
	<div class="flex flex-col gap-1" data-testid="sub-circles">
		{#each circles as circle, i (circle.id)}
			{@const bar = timeline?.bars[i] ?? null}
			<a
				href="/circles/{circle.id}"
				class="grid gap-1 rounded-control px-2 py-2 transition-colors hover:bg-card-hover {timeline
					? 'md:grid-cols-[minmax(180px,34%)_1fr] md:items-center md:gap-4'
					: ''}"
				data-testid="sub-circle"
			>
				<span class="flex min-w-0 items-center gap-2">
					<span class="size-2.5 shrink-0 rounded-full" style={accentDotStyle(circle.color)}></span>
					<span class="min-w-0">
						<span class="block truncate text-sm font-medium text-fg">{circle.name}</span>
						<span class="block text-xs text-fg-subtle">{detail(circle)}</span>
					</span>
				</span>
				{#if timeline}
					<span class="relative block h-[18px] rounded-full bg-bg-sunken" aria-hidden="true">
						{#if bar}
							<span
								class="absolute inset-y-[3px] {bar.open ? 'rounded-l-full' : 'rounded-full'}"
								style="left: {bar.left}%; width: {bar.width}%; {accentDotStyle(circle.color)}"
							></span>
						{/if}
						{#if timeline.today !== null}
							<span
								class="absolute inset-y-0 w-0.5 bg-fg opacity-55"
								style="left: {timeline.today}%"
							></span>
						{/if}
					</span>
				{/if}
			</a>
		{/each}
		{#if timeline}
			<!-- The year marks under the tracks, lined up with them on a wide screen. -->
			<div class="px-2 md:grid md:grid-cols-[minmax(180px,34%)_1fr] md:gap-4" aria-hidden="true">
				<span class="hidden md:block"></span>
				<span class="relative block h-4 text-[11px] text-fg-subtle">
					{#each ticks as tick (tick.year)}
						<span class="absolute -translate-x-1/2" style="left: {tick.at}%">{tick.year}</span>
					{/each}
					{#if timeline.today !== null}
						<span class="absolute -translate-x-1/2 text-fg-muted" style="left: {timeline.today}%"
							>{t('circles.sub.today')}</span
						>
					{/if}
				</span>
			</div>
		{/if}
		{#if hiddenCount > 0}
			<span class="px-2 py-1 text-xs text-fg-subtle">
				{t('circles.sub.more', { count: hiddenCount })}
			</span>
		{/if}
	</div>
</Section>
