import { TranslatableError } from '../../../i18n/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import { FULL_DATE_SHAPE, isRealCalendarDay } from '../../../dates/calendar';
import { todayFor } from '../../../dates/today';
import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { ContactLookup } from '../contacts/contacts';
import { requireVisibleContact } from '../contacts/require-visible';

/*
 * To-do use-cases (docs/02 §2.26). A to-do belongs to the one person it is about: a short
 * line, maybe a day it is due by, open until somebody ticks it.
 *
 * A to-do is a child record of its person, so visibility follows the central rule (docs/03
 * §3.7): shared with the household unless its author made it private. Whoever may see one may
 * tick it, rewrite it or remove it — *I gave the book back* is said by whoever did. Only its
 * author makes it private or shared again, as for gifts. Every read goes through the adapter's
 * scoped queries.
 */

/** A to-do as stored and as read back. */
export interface Todo {
	id: string;
	/** The person it is about. */
	contactId: string;
	/** Who noted it; shown as *noted by*. Who is to do it is not recorded (docs/02 §2.26). */
	createdBy: string;
	visibility: Visibility;
	title: string;
	/** ISO `YYYY-MM-DD` it is due by, or null for no day. */
	dueOn: string | null;
	/** When it was ticked (epoch ms); null while open. */
	doneAt: number | null;
	/** The household's ISO day it was ticked — where the story shows it (§2.23); null while open. */
	doneOn: string | null;
	/** Who ticked it; null while open. */
	doneBy: string | null;
	createdAt: number;
	updatedAt: number;
}

/** A ticked to-do, as the person's story reads it (docs/02 §2.26). */
export type DoneTodo = Todo & { doneAt: number; doneOn: string };

/** Port the domain owns; the Drizzle adapter implements it with visibility-scoped reads. */
export interface TodoRepository {
	insert(todo: Todo): Promise<void>;
	/** The to-do on `contactId` the viewer may see, open or done, or null. */
	findVisibleTo(viewer: Viewer, contactId: string, todoId: string): Promise<Todo | null>;
	/** Store a to-do's new state; the caller found it through `findVisibleTo`. */
	update(todo: Todo): Promise<void>;
	/** Remove a to-do; the caller found it through `findVisibleTo`. */
	remove(todoId: string): Promise<void>;
	/** Every open to-do on a person the viewer may see, in no particular order. */
	listOpenForContactVisibleTo(viewer: Viewer, contactId: string): Promise<Todo[]>;
	/**
	 * One page of a person's done to-dos the viewer may see, newest first by (`doneOn`, `doneAt`),
	 * strictly older than `before` when given — the story's fourth source (docs/02 §2.23).
	 */
	listStoryPageForContactVisibleTo(
		viewer: Viewer,
		contactId: string,
		opts: { limit: number; before?: { doneOn: string; doneAt: number } }
	): Promise<DoneTodo[]>;
}

/** Collaborators the use-cases need, injected by the composition root. */
export interface TodoDeps {
	todos: TodoRepository;
	contacts: ContactLookup;
	ids: IdGenerator;
	clock: Clock;
}

/** The member doing it. */
export interface TodoActor {
	userId: string;
	householdId: string;
}

/** What a to-do says, as a form or a command hands it over. */
export interface TodoContent {
	title: string;
	dueOn: string | null;
	visibility: Visibility;
}

export interface AddTodoInput extends TodoContent {
	contactId: string;
}

export interface EditTodoInput extends TodoContent {
	contactId: string;
	todoId: string;
}

/** Which to-do a tick, an untick or a removal is about. */
export interface TodoRef {
	contactId: string;
	todoId: string;
}

/** A to-do that cannot be stored as asked: no line, or no real day. */
export class InvalidTodoError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'InvalidTodoError');
	}
}

/** The to-do is not one the member can see (any more): removed, or made private by its author. */
export class TodoGoneError extends TranslatableError {
	constructor() {
		super(phrase('errors.todo.gone'), 'TodoGoneError');
	}
}

function titleOf(raw: string): string {
	const title = raw.trim();
	if (title.length === 0) throw new InvalidTodoError(phrase('errors.todo.needTitle'));
	return title;
}

/** The day it is due by; empty means none. */
function dueOnOf(raw: string | null): string | null {
	const day = (raw ?? '').trim();
	if (day.length === 0) return null;
	if (!FULL_DATE_SHAPE.test(day)) throw new InvalidTodoError(phrase('errors.todo.needDay'));
	if (!isRealCalendarDay(day)) throw new InvalidTodoError(phrase('errors.todo.noSuchDay', { day }));
	return day;
}

const viewerOf = (actor: TodoActor): Viewer => ({
	id: actor.userId,
	householdId: actor.householdId
});

async function requireVisibleTodo(
	deps: Pick<TodoDeps, 'todos'>,
	actor: TodoActor,
	{ contactId, todoId }: TodoRef
): Promise<Todo> {
	const todo = await deps.todos.findVisibleTo(viewerOf(actor), contactId, todoId);
	if (!todo) throw new TodoGoneError();
	return todo;
}

/** Note a to-do on a person the author can see. */
export async function addTodo(
	deps: TodoDeps,
	author: TodoActor,
	input: AddTodoInput
): Promise<{ todoId: string }> {
	await requireVisibleContact(deps.contacts, author, input.contactId);
	const title = titleOf(input.title);
	const dueOn = dueOnOf(input.dueOn);
	const now = deps.clock.now();
	const todoId = deps.ids.next();
	await deps.todos.insert({
		id: todoId,
		contactId: input.contactId,
		createdBy: author.userId,
		visibility: input.visibility,
		title,
		dueOn,
		doneAt: null,
		doneOn: null,
		doneBy: null,
		createdAt: now,
		updatedAt: now
	});
	return { todoId };
}

/** Rewrite a to-do's line and day; only its author may change who sees it. */
export async function editTodo(
	deps: TodoDeps,
	editor: TodoActor,
	input: EditTodoInput
): Promise<{ todoId: string }> {
	const todo = await requireVisibleTodo(deps, editor, input);
	await deps.todos.update({
		...todo,
		title: titleOf(input.title),
		dueOn: dueOnOf(input.dueOn),
		visibility: todo.createdBy === editor.userId ? input.visibility : todo.visibility,
		updatedAt: deps.clock.now()
	});
	return { todoId: todo.id };
}

/**
 * Tick a to-do off. One already done stays as it was — who ticked it first keeps the credit —
 * so a tick held on a phone and sent twice is harmless (docs/04 §4.11.2).
 */
export async function tickTodo(
	deps: TodoDeps,
	actor: TodoActor,
	ref: TodoRef
): Promise<{ todoId: string }> {
	const todo = await requireVisibleTodo(deps, actor, ref);
	if (todo.doneAt !== null) return { todoId: todo.id };
	const now = deps.clock.now();
	await deps.todos.update({
		...todo,
		doneAt: now,
		doneOn: todayFor(deps.clock),
		doneBy: actor.userId,
		updatedAt: now
	});
	return { todoId: todo.id };
}

/** Open a ticked to-do again — the toast's *Undo*, or its ticked box in Activity. */
export async function untickTodo(
	deps: TodoDeps,
	actor: TodoActor,
	ref: TodoRef
): Promise<{ todoId: string }> {
	const todo = await requireVisibleTodo(deps, actor, ref);
	if (todo.doneAt === null) return { todoId: todo.id };
	await deps.todos.update({
		...todo,
		doneAt: null,
		doneOn: null,
		doneBy: null,
		updatedAt: deps.clock.now()
	});
	return { todoId: todo.id };
}

/** Remove a to-do the member can see — a done one leaves the story with it: nothing is kept. */
export async function removeTodo(
	deps: TodoDeps,
	actor: TodoActor,
	ref: TodoRef
): Promise<{ todoId: string }> {
	const todo = await requireVisibleTodo(deps, actor, ref);
	await deps.todos.remove(todo.id);
	return { todoId: todo.id };
}

/** The open to-dos on a person the viewer may see. */
export async function listOpenTodosForContact(
	deps: Pick<TodoDeps, 'todos'>,
	viewer: Viewer,
	contactId: string
): Promise<Todo[]> {
	return deps.todos.listOpenForContactVisibleTo(viewer, contactId);
}
