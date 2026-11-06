<script lang="ts">
	import FormError from '$lib/components/ui/FormError.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { KeptOf } from '$lib/pwa/outbox';
	import type { HouseholdTodoView, TodoBand } from '$lib/todos/household';
	import type { JustDoneTodos } from '$lib/todos/just-done.svelte';
	import HouseholdTodoRow from './HouseholdTodoRow.svelte';

	/*
	 * Home's *To-dos* band (docs/02 §2.26.6): what is overdue or due within the week, across
	 * everyone the reader may see, at most three, above *Coming up* in the rail. *Show all*
	 * leads to `/todos`, which holds the rest; the band is absent while nothing is that close.
	 */
	interface Props {
		band: TodoBand<HouseholdTodoView>;
		today: string;
		justDone: JustDoneTodos<HouseholdTodoView>;
		ticksKept: Map<string, KeptOf<'todo.tick'>>;
		error: string | null;
	}
	let { band, today, justDone, ticksKept, error }: Props = $props();

	const t = useI18n().t;
</script>

<!-- Its heading is the rail section's around it (`RailSection`). -->
<div>
	<ul class="flex flex-col">
		{#each band.rows as row (row.todo.id)}
			<HouseholdTodoRow
				todo={row.todo}
				variant="band"
				{today}
				done={row.done}
				{justDone}
				keptTick={ticksKept.get(row.todo.id) ?? null}
			/>
		{/each}
	</ul>
	<FormError message={error} variant="inline" size="xs" />
	{#if band.showsAll}
		<a
			href="/todos"
			class="inline-block px-1.5 pt-1.5 text-xs font-medium text-link hover:underline"
			data-testid="todo-band-all">{t('home.showAll', { count: band.open })}</a
		>
	{/if}
</div>
