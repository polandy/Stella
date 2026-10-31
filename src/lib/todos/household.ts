import { dueStanding, type CardTodo } from './todos';

/*
 * The household's to-dos beyond one person (docs/02 §2.26.6): what Home's *To do* band holds
 * and how `/todos` groups them. Pure and handed *today*, the household's day; both take the
 * card's rows (`cardTodos`), so a row just ticked stays where it stood while its toast does.
 */

/** An open to-do as Home's band and `/todos` show it: the card's words and whom it is about. */
export interface HouseholdTodoView {
	id: string;
	contactId: string;
	contactName: string;
	avatarPhotoId: string | null;
	title: string;
	dueOn: string | null;
	visibility: 'shared' | 'private';
	mine: boolean;
	/** Who noted it, when somebody else did. */
	notedBy: string | null;
	createdAt: number;
}

/** The band stops after three rows, as *Coming up* does (docs/05 §5.5.1). */
const BAND_CAP = 3;

type Dated = { dueOn: string | null };

const inBand = (todo: Dated, today: string): boolean => {
	const standing = dueStanding(todo.dueOn, today);
	return standing === 'overdue' || standing === 'today' || standing === 'soon';
};

export interface TodoBand<T> {
	/** Overdue or due within the coming week, soonest first, at most three; empty: no band. */
	rows: CardTodo<T>[];
	/** Every open to-do the reader may see — the *Show all N* that leads to `/todos`. */
	open: number;
	/** Whether `/todos` holds more than the band shows. */
	showsAll: boolean;
}

/** Home's *To do* band, from the card's rows in their order (`cardTodos`). */
export function todoBand<T extends Dated>(
	rows: readonly CardTodo<T>[],
	today: string
): TodoBand<T> {
	const shown = rows.filter((row) => inBand(row.todo, today)).slice(0, BAND_CAP);
	const open = rows.filter((row) => !row.done).length;
	return { rows: shown, open, showsAll: open > shown.filter((row) => !row.done).length };
}

/**
 * Whether a to-do is overdue or due today — then, below `lg`, the rail stands above the stream,
 * as it does for a date within 14 days (docs/05 §5.5.1).
 */
export function hasPressingTodo(todos: readonly Dated[], today: string): boolean {
	return todos.some((todo) => todo.dueOn !== null && todo.dueOn <= today);
}

export type TodoGroupKey = 'overdue' | 'thisWeek' | 'later' | 'noDay';

export interface TodoGroup<T> {
	key: TodoGroupKey;
	rows: CardTodo<T>[];
}

const GROUP_OF = {
	overdue: 'overdue',
	today: 'thisWeek',
	soon: 'thisWeek',
	later: 'later'
} as const;

const GROUP_ORDER: readonly TodoGroupKey[] = ['overdue', 'thisWeek', 'later', 'noDay'];

/** `/todos`: *Overdue*, *This week*, *Later*, *No day*, each in the rows' order; none empty. */
export function todoListGroups<T extends Dated>(
	rows: readonly CardTodo<T>[],
	today: string
): TodoGroup<T>[] {
	const keyOf = (todo: T): TodoGroupKey => {
		const standing = dueStanding(todo.dueOn, today);
		return standing === null ? 'noDay' : GROUP_OF[standing];
	};
	return GROUP_ORDER.map((key) => ({
		key,
		rows: rows.filter((row) => keyOf(row.todo) === key)
	})).filter((group) => group.rows.length > 0);
}
