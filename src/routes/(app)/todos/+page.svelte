<script lang="ts">
	import HouseholdTodoRow from '$lib/components/todos/HouseholdTodoRow.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { todoListGroups, type TodoGroupKey } from '$lib/todos/household';
	import { JustDoneTodos } from '$lib/todos/just-done.svelte';
	import { keptTicks } from '$lib/todos/kept-ticks.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import type { ActionData, PageData } from './$types';

	/*
	 * Every open to-do of the household (docs/02 §2.26.6), grouped by its day: *Overdue*, *This
	 * week*, *Later*, *No day*. A row ticked here stays, struck through, while its toast stands,
	 * as on the person's card; the box is on the right, under the thumb (docs/05 §5.1).
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const t = useI18n().t;

	const justDone = new JustDoneTodos<PageData['todos'][number]>(useRemovals());
	const rows = $derived(justDone.rows(data.todos));
	const groups = $derived(todoListGroups(rows, data.today));
	const open = $derived(rows.filter((row) => !row.done).length);
	const ticksKept = $derived(keptTicks());

	const HEADING = {
		overdue: 'todos.list.overdue',
		thisWeek: 'todos.list.thisWeek',
		later: 'todos.list.later',
		noDay: 'todos.list.noDay'
	} as const satisfies Record<TodoGroupKey, string>;
</script>

<svelte:head><title>{t('common.pageTitle', { page: t('todos.list.title') })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-6 md:py-10">
	<header class="flex flex-col gap-1">
		<h1 class="flex items-baseline gap-2 text-2xl font-semibold text-fg">
			{t('todos.list.title')}
			{#if open > 0}
				<span class="text-sm font-normal text-fg-muted" data-testid="todo-list-open"
					>{t('todos.list.open', { count: open })}</span
				>
			{/if}
		</h1>
		<p class="text-sm text-fg-muted">{t('todos.list.intro')}</p>
	</header>

	<FormError message={form?.todoTickError ?? null} />

	{#if groups.length}
		{#each groups as group (group.key)}
			<section
				class="rounded-app bg-card px-4 py-3 shadow-card"
				aria-labelledby="todo-list-{group.key}"
				data-testid="todo-list-group"
			>
				<h2
					id="todo-list-{group.key}"
					class="flex items-baseline gap-2 text-sm font-semibold text-fg"
				>
					{t(HEADING[group.key])}
					<span class="text-xs font-normal text-fg-muted">{group.rows.length}</span>
				</h2>
				<ul class="mt-1">
					{#each group.rows as row (row.todo.id)}
						<HouseholdTodoRow
							todo={row.todo}
							variant="list"
							today={data.today}
							done={row.done}
							{justDone}
							keptTick={ticksKept.get(row.todo.id) ?? null}
						/>
					{/each}
				</ul>
			</section>
		{/each}
	{:else}
		<EmptyState icon="todo" title={t('todos.list.empty')} hint={t('todos.list.emptyHint')} />
	{/if}
</main>
