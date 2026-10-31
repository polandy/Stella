<script
	lang="ts"
	generics="T extends { id: string; title: string; dueOn: string | null; createdAt: number }"
>
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import type { KeptOf } from '$lib/pwa/outbox';
	import type { JustDoneTodos } from '$lib/todos/just-done.svelte';
	import { recallKeptTick } from '$lib/todos/kept-ticks.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { submitAction } from '$lib/undo/submit-action';
	import type { SubmitFunction } from '@sveltejs/kit';

	/*
	 * A to-do's tick box, wherever a to-do is listed (docs/02 §2.26): on the right of its row,
	 * where a right thumb finds it (docs/05 §5.1). Ticking saves at once through the outbox, so it
	 * works on a phone out of reach too; the toast offers *Undo*, which opens it again, and the
	 * row stays, struck through, while the toast does (`justDone`). The page posts to its own
	 * `tickTodo` and `untickTodo`, which take the person from the form.
	 */
	interface Props {
		todo: T;
		/** Whose to-do it is. */
		contactId: string;
		/** Just ticked: struck through while its toast stands (`cardTodos`). */
		done: boolean;
		justDone: JustDoneTodos<T>;
		/** Ticked on this device while Stella was out of reach, and not sent yet. */
		keptTick: KeptOf<'todo.tick'> | null;
		/** The box's id, which the row's line names, so the whole line ticks. */
		id: string;
		/** Checked from the tap until Stella has answered; a refusal unchecks it again. */
		ticking?: boolean;
	}
	let {
		todo,
		contactId,
		done,
		justDone,
		keptTick,
		id,
		ticking = $bindable(false)
	}: Props = $props();

	const t = useI18n().t;
	const removals = useRemovals();
	const ticked = $derived(ticking || done || keptTick !== null);

	/** *Undo* on the toast: the to-do opens again, where it stood. */
	async function reopen() {
		justDone.reopening(todo.id);
		const body = new FormData();
		body.set('todoId', todo.id);
		body.set('contactId', contactId);
		try {
			await submitAction(fetch, `${page.url.pathname}?/untickTodo`, body);
		} catch {
			removals.notify(t('errors.todo.couldNotSave'));
		}
		await invalidateAll();
		justDone.reopened(todo.id);
	}

	// A tick saves through the outbox, kept when Stella cannot take it (docs/02 §2.18).
	const keepTick = $derived(
		keepable(
			{
				toCommand: (_data, commandId) => ({
					id: commandId,
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
					removals.notify(t('todos.done', { title: todo.title }), () =>
						// Gone out meanwhile, it is Stella's: it is opened again from Activity, as the toast says.
						recallKeptTick(command.id, () => removals.notify(t('todos.tickOnItsWay')))
					);
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

<form method="POST" action="?/tickTodo" use:enhance={submitTick} class="flex shrink-0 pt-0.5">
	<input type="hidden" name="todoId" value={todo.id} />
	<input type="hidden" name="contactId" value={contactId} />
	<input
		{id}
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
