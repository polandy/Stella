<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import KeptItem from '$lib/components/pwa/KeptItem.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { cardShape } from '$lib/people/empty-cards';
	import { sectionAnchor } from '$lib/people/sections';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { asksForNewTodo } from '$lib/todos/todos';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { tick } from 'svelte';
	import TodoForm from './TodoForm.svelte';
	import TodoRow from './TodoRow.svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * The To do card (docs/02 §2.26): what is still owed this person, those with a day first.
	 * The page sets it right under the identity card while something is open and at its end, as
	 * one line, while nothing is (docs/05 §5.5) — so a to-do is the first thing read about
	 * somebody exactly as long as there is one.
	 */
	let { data, form }: { data: PersonPageData; form: PersonForm } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const c = $derived(data.contact);

	// A to-do on its way out (docs/02 §2.23) is gone from the card while its undo window is open.
	const shown = $derived(
		data.todos.filter((todo) => !removals.isPending(removalKey('todo', todo.id)))
	);

	/** To-dos noted here while Stella was out of reach (docs/02 §2.18), until they are sent. */
	const kept = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'todo.add'> =>
				isKept(item, 'todo.add') && item.command.payload.contactId === c.id
		)
	);
	/** The to-dos ticked here while out of reach: struck through until the tick is sent. */
	const keptTicks = $derived(
		new Set(
			outbox.mine
				.filter((item): item is KeptOf<'todo.tick'> => isKept(item, 'todo.tick'))
				.map((item) => item.command.payload.todoId)
		)
	);
	const line = $derived(cardShape('todos', shown.length > 0 || kept.length > 0) === 'line');

	let open = $state(false);
	// The palette's *To do for …* lands here with the form open (docs/05 §5.4). On a navigation,
	// not on every load: a save reloads the page, and must not open it again.
	afterNavigate(({ to }) => {
		if (to && asksForNewTodo(to.url)) open = true;
	});

	const closeAdding = () => (open = false);
	/**
	 * The first to-do moves the card from the page's end to under the identity card; the reader
	 * is taken along, so what they just saved is in view.
	 */
	async function followTheCard() {
		closeAdding();
		await tick();
		document.getElementById(sectionAnchor('todos'))?.scrollIntoView({ block: 'nearest' });
	}

	const text = (formData: FormData, key: string): string | null => {
		const value = String(formData.get(key) ?? '').trim();
		return value.length > 0 ? value : null;
	};

	// Noting a to-do saves through the outbox, keeping it when Stella cannot take it (§2.18).
	const keepTodo = $derived(
		keepable(
			{
				toCommand: (formData, id) => {
					const title = text(formData, 'title');
					if (!title) return null;
					return {
						id,
						type: 'todo.add',
						payload: {
							contactId: c.id,
							title,
							dueOn: text(formData, 'dueOn'),
							visibility: formData.get('visibility') === 'private' ? 'private' : 'shared'
						},
						issuedAt: Date.now()
					};
				},
				about: c.displayName,
				errorKey: 'todoError',
				onApplied: () => {
					removals.notify(t('components.saved'));
					void followTheCard();
				},
				onKept: closeAdding
			},
			savedEnhance(removals, t('components.saved'), closeAdding)
		)
	);

	const rowError = (todoId: string): string | null =>
		form?.todoRowError && form.todoRowError.todoId === todoId ? form.todoRowError.message : null;
</script>

<Section
	id={sectionAnchor('todos')}
	title={t('todos.title')}
	addLabel={t('todos.add')}
	empty={line ? t('todos.none') : undefined}
	error={form?.todoError ?? null}
	bind:open
>
	<FormError message={form?.todoTickError ?? null} variant="inline" />

	{#if kept.length > 0}
		<ul class="mb-3 flex flex-col gap-2" data-testid="kept-todos">
			{#each kept as item (item.command.id)}
				<li>
					<KeptItem {item}>
						<p class="mt-1 text-fg">{item.command.payload.title}</p>
					</KeptItem>
				</li>
			{/each}
		</ul>
	{/if}

	{#if shown.length > 0}
		<ul class="flex flex-col" data-testid="todos">
			{#each shown as todo (todo.id)}
				<TodoRow
					{todo}
					contactId={c.id}
					today={data.today}
					keptTick={keptTicks.has(todo.id)}
					error={rowError(todo.id)}
				/>
			{/each}
		</ul>
	{/if}

	{#snippet editor()}
		<TodoForm
			heading={t('todos.form.for', { name: c.displayName })}
			action="?/addTodo"
			submit={keepTodo}
			today={data.today}
			canChooseVisibility
		/>
	{/snippet}
</Section>
