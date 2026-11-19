<script lang="ts">
	import ComingUp from '#lib/components/stream/ComingUp.svelte';
	import RailSection from '#lib/components/stream/RailSection.svelte';
	import MemoryBand from '#lib/components/memories/MemoryBand.svelte';
	import type { ImmichMemories } from '#lib/components/memories/immich-memories.svelte.js';
	import TodoBand from '#lib/components/todos/TodoBand.svelte';
	import { useTranslate } from '#lib/i18n/context.svelte.js';
	import type { KeptOf } from '#lib/pwa/outbox.js';
	import { memoryRail, railSummary, todoRailFirst } from '#lib/stream/rail-summary.js';
	import type { HouseholdTodoView, TodoBand as Band } from '#lib/todos/household.js';
	import type { JustDoneTodos } from '#lib/todos/just-done.svelte.js';
	import type { PageData } from '../../../routes/(app)/$types';

	/*
	 * Home's rail (docs/dev/05 §5.5): what is to do, what is coming up, and what happened on this day
	 * in earlier years. Home mounts it only while one of them has something, and places it.
	 */
	interface Props {
		band: Band<HouseholdTodoView>;
		today: string;
		justDone: JustDoneTodos<HouseholdTodoView>;
		ticksKept: Map<string, KeptOf<'todo.tick'>>;
		todoTickError: string | null;
		upcoming: PageData['upcoming'];
		plans: PageData['plans'];
		planRowError: { planId: string | null; message: string } | null;
		planTickError: string | null;
		memories: PageData['memories'];
		immichMemories: ImmichMemories;
		hasMemories: boolean;
		class: string;
	}
	let {
		band,
		today,
		justDone,
		ticksKept,
		todoTickError,
		upcoming,
		plans,
		planRowError,
		planTickError,
		memories,
		immichMemories,
		hasMemories,
		class: className
	}: Props = $props();

	const t = useTranslate();

	// A phone folds each rail section to one line: how many, and the first (docs/dev/05 §5.5.1).
	const todoSummary = $derived(railSummary(band.due, todoRailFirst(band.rows)));
	const memorySummary = $derived.by(() => {
		const { count, first } = memoryRail(
			memories.years,
			memories.photos.length + immichMemories.years.reduce((sum, year) => sum + year.total, 0)
		);
		return railSummary(count, first);
	});
</script>

<aside
	class="flex min-w-0 flex-col gap-6 max-lg:gap-0 max-lg:divide-y max-lg:divide-border max-lg:rounded-app max-lg:border max-lg:border-border max-lg:bg-card lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start {className}"
	aria-label={t('home.atAGlance')}
>
	{#if band.rows.length}
		<RailSection icon="todo" title={t('todos.band.title')} summary={todoSummary} testid="todo-band">
			<TodoBand {band} {today} {justDone} {ticksKept} error={todoTickError} />
		</RailSection>
	{/if}
	{#if upcoming.length || plans.asking.length || plans.coming.length}
		<ComingUp {upcoming} {plans} {today} {planRowError} {planTickError} />
	{/if}
	{#if hasMemories}
		<RailSection
			icon="memories"
			title={t('memories.title')}
			summary={memorySummary}
			testid="memory-band"
		>
			<MemoryBand
				years={memories.years}
				photos={memories.photos}
				more={memories.more}
				{today}
				immich={immichMemories}
			/>
		</RailSection>
	{/if}
</aside>
