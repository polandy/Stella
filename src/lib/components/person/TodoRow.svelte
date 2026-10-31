<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import RemoveButton from '$lib/components/ui/RemoveButton.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import { recallable, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import type { JustDoneTodos } from '$lib/todos/just-done.svelte';
	import { dueLabel, dueStanding } from '$lib/todos/todos';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { submitAction } from '$lib/undo/submit-action';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { tick } from 'svelte';
	import TodoForm from './TodoForm.svelte';
	import type { PersonPageData } from './types';

	/*
	 * One open to-do on the To do card (docs/02 §2.26): a checkbox, the line, its day, who noted
	 * it. Ticking saves at once through the outbox, so it works on a phone out of reach too, and
	 * the toast offers *Undo*, which opens it again; the row stays, struck through, while the
	 * toast does. A tick kept on the device offers *Undo* on the row itself until it is on its
	 * way. The pencil rewrites it in place; removing it has the undo every removal has (docs/02
	 * §2.23).
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

	const standing = $derived(dueStanding(todo.dueOn, today));
	const due = $derived(dueLabel(i18n, todo.dueOn, today));
	const DUE_TONE = {
		overdue: 'font-medium text-fg',
		today: 'font-medium text-fg',
		soon: 'font-medium text-fg',
		later: 'text-fg-muted'
	} as const;

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

	/** *Undo* on the toast: the to-do opens again, where it stood. */
	async function reopen() {
		justDone.reopening(todo.id);
		const body = new FormData();
		body.set('todoId', todo.id);
		try {
			await submitAction(fetch, `${page.url.pathname}?/untickTodo`, body);
		} catch {
			removals.notify(t('errors.todo.couldNotSave'));
		}
		await invalidateAll();
		justDone.reopened(todo.id);
	}

	/** *Undo* for a tick still on this device: it is dropped there, and never sent. */
	function recallTick(commandId: string) {
		void outbox.discard(commandId).then((recalled) => {
			// Gone out meanwhile, it is Stella's: the toast's *Undo* then opens it again there.
			if (!recalled) removals.notify(t('todos.tickOnItsWay'));
		});
	}

	// A tick saves through the outbox, kept when Stella cannot take it (docs/02 §2.18).
	const keepTick = $derived(
		keepable(
			{
				toCommand: (_data, id) => ({
					id,
					type: 'todo.tick',
					payload: { contactId, todoId: todo.id },
					issuedAt: Date.now()
				}),
				// Shown on Home while it waits: the tick names nothing but its to-do.
				about: todo.title,
				errorKey: 'todoTickError',
				onApplied: () =>
					justDone.announced(
						todo.id,
						removals.notify(t('todos.done', { title: todo.title }), reopen)
					),
				onKept: (command) => {
					removals.notify(t('todos.done', { title: todo.title }), () => recallTick(command.id));
				}
			},
			() => {}
		)
	);
	const submitTick: SubmitFunction = async (input) => {
		justDone.saving(todo);
		await keepTick(input);
		// Applied, `done` holds the row; kept, `keptTick` does; refused, it is open again.
		justDone.unsaved(todo.id);
		ticking = false;
	};
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
		<form method="POST" action="?/tickTodo" use:enhance={submitTick} class="flex pt-0.5">
			<input type="hidden" name="todoId" value={todo.id} />
			<input
				id={checkboxId}
				type="checkbox"
				checked={ticked}
				disabled={ticked}
				aria-label={t('todos.tick', { title: todo.title })}
				onchange={(event) => {
					ticking = true;
					event.currentTarget.form?.requestSubmit();
				}}
				class="size-5 shrink-0 accent-primary"
				data-testid="todo-tick"
			/>
		</form>
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
					{:else if due && standing}
						<span class={DUE_TONE[standing]} data-testid="todo-due">{due}</span>
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
						label={t('todos.story.reopen', { title: todo.title })}
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
	{/if}
</li>
