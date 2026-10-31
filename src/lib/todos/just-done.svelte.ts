import type { Removals } from '$lib/undo/context.svelte';
import { cardTodos, type CardTodo, type JustDone } from './todos';

/*
 * The browser side of `cardTodos`: the to-dos ticked on this page, held until their toast is
 * gone (docs/02 §2.26.2). The person page owns one, because the card's place on the page — top
 * while anything is in it — has to count them too.
 */

type CardTodoShape = { id: string; dueOn: string | null; createdAt: number };

export class JustDoneTodos<T extends CardTodoShape> {
	#entries = $state.raw<JustDone<T>[]>([]);
	readonly #removals: Removals;

	constructor(removals: Removals) {
		this.#removals = removals;
	}

	/** The card's rows: the open to-dos and those just ticked (reactive). */
	rows(open: readonly T[]): CardTodo<T>[] {
		return cardTodos(open, this.#entries, this.#standing());
	}

	/** A tick is being saved: the row stays, struck through. */
	saving(todo: T): void {
		const standing = this.#standing();
		// What is no longer in view is let go here, so the list never grows past the toasts.
		const kept = this.#entries.filter(
			(entry) =>
				entry.todo.id !== todo.id &&
				(entry.reopening || entry.noticeId === null || standing.has(entry.noticeId))
		);
		this.#entries = [...kept, { todo, noticeId: null, reopening: false }];
	}

	/** Stella has it, and the toast announcing it is `noticeId`: the row stays while it stands. */
	announced(todoId: string, noticeId: number): void {
		this.#update(todoId, (entry) => ({ ...entry, noticeId }));
	}

	/** The tick was kept on the device or refused: the row is the outbox's or open again. */
	unsaved(todoId: string): void {
		this.#entries = this.#entries.filter(
			(entry) => entry.todo.id !== todoId || entry.noticeId !== null
		);
	}

	/** *Undo* is on its way: the row shows open until the page is read again. */
	reopening(todoId: string): void {
		this.#update(todoId, (entry) => ({ ...entry, reopening: true }));
	}

	/** The page has been read again after *Undo*: the to-do is an open one again, or gone. */
	reopened(todoId: string): void {
		this.#entries = this.#entries.filter((entry) => entry.todo.id !== todoId);
	}

	#standing(): Set<number> {
		return new Set(this.#removals.snapshot.notices.map((notice) => notice.id));
	}

	#update(todoId: string, change: (entry: JustDone<T>) => JustDone<T>): void {
		this.#entries = this.#entries.map((entry) =>
			entry.todo.id === todoId ? change(entry) : entry
		);
	}
}
