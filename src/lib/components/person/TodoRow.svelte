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
	 * the toast offers *Undo*, which opens it again. The pencil rewrites it in place; removing it
	 * has the undo every removal has (docs/02 §2.23).
	 */
	interface Props {
		todo: PersonPageData['todos'][number];
		/** Whose to-do it is. */
		contactId: string;
		/** The household's day, which *overdue* is read against. */
		today: string;
		/** Ticked on this device while Stella was out of reach, and not sent yet. */
		keptTick: boolean;
		/** The refusal of this row's last save, if any. */
		error: string | null;
	}
	let { todo, contactId, today, keptTick, error }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	let mode = $state<'view' | 'edit'>('view');
	let row = $state<HTMLElement>();
	// Checked from the tap until Stella has answered; a refusal unchecks it again.
	let ticking = $state(false);
	const ticked = $derived(ticking || keptTick);

	const standing = $derived(dueStanding(todo.dueOn, today));
	const due = $derived(dueLabel(i18n, todo.dueOn, today));
	const DUE_TONE = {
		overdue: 'font-medium text-danger',
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
		const body = new FormData();
		body.set('todoId', todo.id);
		try {
			await submitAction(fetch, `${page.url.pathname}?/untickTodo`, body);
		} catch {
			removals.notify(t('errors.todo.couldNotSave'));
		}
		await invalidateAll();
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
				onApplied: () => removals.notify(t('todos.done', { title: todo.title }), reopen),
				onKept: () => {}
			},
			() => {}
		)
	);
	const submitTick: SubmitFunction = async (input) => {
		await keepTick(input);
		// Applied, the row is gone with the reload; kept, `keptTick` holds it; refused, it is open.
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
				<p class="break-words {ticked ? 'text-fg-muted line-through' : 'text-fg'}">
					{todo.title}
				</p>
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
			{#if !ticked}
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
