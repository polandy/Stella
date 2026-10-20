<!--
  @component
  The circle page's "Sub-circles · N" card (docs/02 §2.4.2): one row per direct sub-circle, each
  a link to it, with its period on a shared timeline. An undated row has no bar; with no dated
  row at all the card is a plain list. The bars are decoration — the label says the period.

  The card is always there, empty too, because it is where sub-circles are made: *New
  sub-circle* opens the create form in place, *Add existing* the circle picker, and each row's ⋯
  offers *Detach* and *Open*. A move happens at once and says so in a toast with *Undo*; there is
  no confirmation step (ADR-126).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import CirclePicker from '$lib/components/circle/CirclePicker.svelte';
	import ColourSwatches from '$lib/components/circle/ColourSwatches.svelte';
	import ParentField from '$lib/components/circle/ParentField.svelte';
	import { moveWithUndo } from '$lib/components/circle/circle-moves';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import { circleKindLabel } from '$lib/circles/labels';
	import { subCircleKindFor } from '$lib/circles/picker';
	import { circlePeriodLabel } from '$lib/circles/period';
	import { circleTimeline } from '$lib/circles/timeline';
	import type { TreeCircle } from '$lib/circles/tree';
	import { accentDotStyle, type Accent } from '$lib/design/tokens';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';

	interface Props {
		/** The circle whose card this is. */
		parent: Pick<TreeCircle, 'id' | 'name' | 'kind' | 'visibility'>;
		/** Every circle the reader sees, flat, for the picker. */
		all: readonly TreeCircle[];
		/** What the create form offers, as the list's does. */
		kinds: readonly string[];
		colors: readonly Accent[];
		/** The colour the create form starts on. */
		suggestedColor: Accent;
		/** The refusal of the last *New sub-circle*, which keeps its form open. */
		createError: string | null;
		/** The direct sub-circles newest first, each with how many circles lie further inside. */
		circles: (TreeCircle & { descendantCount: number })[];
		/** Direct sub-circles the reader may not see: counted, never named. */
		hiddenCount: number;
		/** Today (YYYY-MM-DD), where the timeline's marker stands. */
		today: string;
	}

	let {
		parent,
		all,
		kinds,
		colors,
		suggestedColor,
		createError,
		circles,
		hiddenCount,
		today
	}: Props = $props();

	const lang = useI18n();
	const t = lang.t;
	const removals = useRemovals();
	const context = $derived({ pageId: parent.id, removals, t });

	let creating = $state(false);
	let adding = $state(false);
	// The row whose ⋯ strip is open; one at a time.
	let actionsFor = $state<string | null>(null);
	// The create form: what a sub-circle of this kind most likely is, inside this circle.
	let newKind = $derived(subCircleKindFor(parent.kind));
	let newParent = $derived<string | null>(parent.id);
	const placeholder = $derived(
		newKind === 'class'
			? t('circles.sub.placeholder.class')
			: newKind === 'team'
				? t('circles.sub.placeholder.team')
				: t('circles.namePlaceholder')
	);

	function detach(circle: TreeCircle) {
		actionsFor = null;
		void moveWithUndo(context, circle.id, null, t('circles.sub.detached', { name: circle.name }));
	}

	function addExisting(id: string | null) {
		const chosen = all.find((c) => c.id === id);
		if (!chosen) return;
		void moveWithUndo(
			context,
			chosen.id,
			parent.id,
			t('circles.sub.added', { name: chosen.name, parent: parent.name })
		);
	}

	const INPUT = 'rounded-control border border-border-input bg-bg px-3 py-2 text-fg';
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

<Section
	title={t('circles.sub.heading')}
	count={circles.length + hiddenCount}
	addLabel={t('circles.sub.create')}
	addIcon="add"
	error={createError}
	empty={circles.length + hiddenCount === 0 ? t('circles.sub.empty') : undefined}
	bind:open={creating}
>
	{#snippet action()}
		<Button
			type="button"
			variant="secondary"
			size="sm"
			icon="subCircle"
			onclick={() => (adding = true)}
			data-testid="sub-circles-add-existing">{t('circles.sub.addExisting')}</Button
		>
	{/snippet}
	{#snippet editor()}
		<form
			method="POST"
			action="?/createSubCircle"
			use:enhance
			aria-label={t('circles.sub.createLabel', { name: parent.name })}
			class="flex flex-col gap-4"
			data-testid="sub-circle-create"
		>
			<label class="flex flex-col gap-1 text-sm">
				<span class="text-fg-muted">{t('circles.name')}</span>
				<input name="name" {placeholder} required autocomplete="off" class={INPUT} />
			</label>
			<div class="flex flex-wrap gap-4">
				<label class="flex min-w-40 flex-1 flex-col gap-1 text-sm">
					<span class="text-fg-muted">{t('circles.kindLabel')}</span>
					<select name="kind" bind:value={newKind} class={INPUT}>
						{#each kinds as kind (kind)}
							<option value={kind}>{circleKindLabel(t, kind)}</option>
						{/each}
					</select>
				</label>
			</div>
			<ParentField
				circles={all}
				subjectId={null}
				subjectName={null}
				shared
				bind:value={newParent}
				idPrefix="sub-circle-new"
			/>
			<ColourSwatches {colors} selected={suggestedColor} />
			<div class="flex flex-wrap gap-2">
				<Button variant="primary" size="sm">{t('circles.create')}</Button>
				<Button size="sm" variant="ghost" type="button" onclick={() => (creating = false)}
					>{t('common.cancel')}</Button
				>
			</div>
		</form>
	{/snippet}
	<div class="flex flex-col gap-1" data-testid="sub-circles">
		{#each circles as circle, i (circle.id)}
			{@const bar = timeline?.bars[i] ?? null}
			<div data-testid="sub-circle-row">
				<div class="flex items-center gap-1">
					<a
						href="/circles/{circle.id}"
						class="grid min-w-0 flex-1 gap-1 rounded-control px-2 py-2 transition-colors hover:bg-card-hover {timeline
							? 'md:grid-cols-[minmax(180px,34%)_1fr] md:items-center md:gap-4'
							: ''}"
						data-testid="sub-circle"
					>
						<span class="flex min-w-0 items-center gap-2">
							<span class="size-2.5 shrink-0 rounded-full" style={accentDotStyle(circle.color)}
							></span>
							<span class="min-w-0">
								<span class="block truncate text-sm font-medium text-fg">{circle.name}</span>
								<span class="block text-xs text-fg-subtle">{detail(circle)}</span>
							</span>
						</span>
						{#if timeline}
							<!-- The border token, not bg-sunken: on Mocha's card the sunken ground all but vanishes. -->
							<span class="relative block h-[18px] rounded-full bg-border" aria-hidden="true">
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
					<button
						type="button"
						class="grid size-8 shrink-0 place-items-center rounded-control text-fg-muted transition-colors hover:bg-card-hover hover:text-fg"
						aria-label={t('circles.sub.actions', { name: circle.name })}
						aria-expanded={actionsFor === circle.id}
						onclick={() => (actionsFor = actionsFor === circle.id ? null : circle.id)}
						data-testid="sub-circle-actions"
					>
						<Icon name="more" size={16} />
					</button>
				</div>
				{#if actionsFor === circle.id}
					<div transition:reveal class="flex flex-wrap gap-2 px-2 pb-2 pl-6">
						<Button
							type="button"
							size="sm"
							variant="secondary"
							icon="unlink"
							onclick={() => detach(circle)}
							data-testid="sub-circle-detach"
							>{t('circles.sub.detach', { parent: parent.name })}</Button
						>
						<Button size="sm" variant="ghost" icon="forward" href="/circles/{circle.id}"
							>{t('common.open')}</Button
						>
					</div>
				{/if}
			</div>
		{/each}
		{#if timeline}
			<!-- The year marks under the tracks, lined up with them on a wide screen; the empty
			     column under the rows' ⋯ keeps them in line. -->
			<div class="flex gap-1" aria-hidden="true">
				<div class="flex-1 px-2 md:grid md:grid-cols-[minmax(180px,34%)_1fr] md:gap-4">
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
				<span class="w-8 shrink-0"></span>
			</div>
		{/if}
		{#if hiddenCount > 0}
			<span class="px-2 py-1 text-xs text-fg-subtle">
				{t('circles.sub.more', { count: hiddenCount })}
			</span>
		{/if}
	</div>
</Section>

<CirclePicker
	circles={all}
	mode="add"
	subjectId={parent.id}
	subjectName={parent.name}
	bind:open={adding}
	onchoose={addExisting}
/>
