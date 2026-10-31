<script lang="ts">
	import TodoDue from '$lib/components/todos/TodoDue.svelte';
	import TodoTick from '$lib/components/todos/TodoTick.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import RemoveButton from '$lib/components/ui/RemoveButton.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import { recallable, type KeptOf } from '$lib/pwa/outbox';
	import type { JustDoneTodos } from '$lib/todos/just-done.svelte';
	import { recallKeptTick } from '$lib/todos/kept-ticks.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { tick } from 'svelte';
	import TodoForm from './TodoForm.svelte';
	import type { PersonPageData } from './types';

	/*
	 * One open to-do on the To do card (docs/02 §2.26): the line, its day, who noted it, and the
	 * tick box on the right (`TodoTick`). A tick kept on the device offers *Undo* on the row
	 * itself until it is on its way. The pencil rewrites it in place; removing it has the undo
	 * every removal has (docs/02 §2.23).
	 */
	interface Props {
		todo: PersonPageData['todos'][number];
		/** Whose to-do it is. */
		contactId: string;
		/** The household's day, which *overdue* is read against. */
		today: string;
		/** Just ticked: struck through while its toast stands (`cardTodos`). */
		done: boolean;
		/** Where a tick is announced, so the row stays while its toast does. */
		justDone: JustDoneTodos<PersonPageData['todos'][number]>;
		/** Ticked on this device while Stella was out of reach, and not sent yet. */
		keptTick: KeptOf<'todo.tick'> | null;
		/** The refusal of this row's last save, if any. */
		error: string | null;
	}
	let { todo, done, justDone, contactId, today, keptTick, error }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	let mode = $state<'view' | 'edit'>('view');
	let row = $state<HTMLElement>();
	// Checked from the tap until Stella has answered; a refusal unchecks it again.
	let ticking = $state(false);
	const ticked = $derived(ticking || done || keptTick !== null);
	const checkboxId = $derived(`todo-tick-${todo.id}`);

	const due = $derived(todo.dueOn !== null);

	async function startEditing() {
		mode = 'edit';
		await tick();
		row?.querySelector<HTMLElement>('input:not([type="hidden"])')?.focus();
	}
	function close() {
		mode = 'view';
		void tick().then(() => row?.querySelector<HTMLElement>('[data-todo-actions] button')?.focus());
	}
	const savedEdit = savedEnhance(removals, t('components.saved'), close);

	/** *Undo* for a tick still on this device: it is dropped there, and never sent. */
	function recallTick(commandId: string) {
		// Gone out meanwhile, it is Stella's: it is opened again from Activity, as the toast says.
		recallKeptTick(commandId, () => removals.notify(t('todos.tickOnItsWay')));
	}
</script>

<li bind:this={row} class="flex gap-3 border-t border-border-subtle py-2.5 first:border-t-0">
	{#if mode === 'edit'}
		<div class="min-w-0 flex-1" transition:reveal>
			<TodoForm
				{todo}
				heading={t('todos.edit', { title: todo.title })}
				action="?/editTodo"
				submit={savedEdit}
				{today}
				canChooseVisibility={todo.mine}
				{error}
				onCancel={close}
			/>
		</div>
	{:else}
		<div class="flex min-w-0 flex-1 flex-wrap items-start gap-x-2 gap-y-1">
			<div class="min-w-0 flex-1">
				<!-- The whole line ticks: a 20 px box alone is too small a target on a phone. -->
				<label
					for={checkboxId}
					class="block break-words {ticked
						? 'text-fg-muted line-through'
						: 'cursor-pointer text-fg'}"
				>
					{todo.title}
				</label>
				<p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-subtle">
					{#if keptTick}
						<span class="inline-flex items-center gap-1">
							<Icon name="offline" size={11} />{t('home.outbox.notSent')}
						</span>
					{:else}
						<TodoDue dueOn={todo.dueOn} {today} />
					{/if}
					{#if todo.notedBy}
						{#if due || keptTick}<span aria-hidden="true">·</span>{/if}
						<span>{t('todos.notedBy', { name: todo.notedBy })}</span>
					{/if}
					{#if todo.visibility === 'private'}
						{#if due || keptTick || todo.notedBy}<span aria-hidden="true">·</span>{/if}
						<span class="inline-flex items-center gap-1" title={t('common.onlyYouSee')}>
							<Icon name="private" size={11} />{t('common.privateInline')}
						</span>
					{/if}
				</p>
				<FormError message={error} variant="inline" />
			</div>
			{#if keptTick && recallable(keptTick)}
				<div class="flex shrink-0 items-center" data-todo-actions>
					<Button
						variant="ghost"
						size="sm"
						type="button"
						label={t('todos.recallTick', { title: todo.title })}
						onclick={() => recallTick(keptTick.command.id)}
						data-testid="todo-recall">{t('common.undo')}</Button
					>
				</div>
			{:else if !ticked}
				<div class="flex shrink-0 items-center gap-1" data-todo-actions>
					<Button
						variant="ghost"
						size="sm"
						type="button"
						icon="rename"
						label={t('todos.edit', { title: todo.title })}
						title={t('todos.edit', { title: todo.title })}
						onclick={startEditing}
					/>
					<RemoveButton
						kind="todo"
						id={todo.id}
						action="?/removeTodo"
						fields={{ todoId: todo.id }}
						label={t('todos.remove', { title: todo.title })}
						removed={t('todos.removed')}
					/>
				</div>
			{/if}
		</div>
		<TodoTick {todo} {contactId} {done} {justDone} {keptTick} id={checkboxId} bind:ticking />
	{/if}
</li>
