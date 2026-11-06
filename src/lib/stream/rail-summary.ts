import type { CardTodo } from '$lib/todos/todos';

/*
 * The phone's one line per rail section (docs/05 §5.5.1): Home's rail folds to *To-dos*,
 * *Coming up* and *On this day*, each reading how many and the first of them, so the stream
 * starts near the top. The first is never words a veil would hide: a private item is skipped,
 * and with nothing else the count stands alone. Pure.
 */

/** *2 · Call Rosa about the move*, or *2* with nothing to name. */
export function railSummary(count: number, first: string | null): string {
	return first === null ? String(count) : `${count} · ${first}`;
}

/** The first open, shared to-do of the band, by its title. */
export function todoRailFirst(
	rows: readonly CardTodo<{ title: string; visibility: 'shared' | 'private' }>[]
): string | null {
	const first = rows.find((row) => !row.done && row.todo.visibility === 'shared');
	return first?.todo.title ?? null;
}

interface MemoryYear {
	year: number;
	rows: readonly { line: string | null; isPrivate: boolean; people: readonly { name: string }[] }[];
}

/** The day's entries in earlier years, the first named with its year; or its photos, counted. */
export function memoryRail(
	years: readonly MemoryYear[],
	photos: number
): { count: number; first: string | null } {
	const count = years.reduce((sum, year) => sum + year.rows.length, 0);
	if (count === 0) return { count: photos, first: null };
	for (const year of years) {
		const row = year.rows.find((r) => !r.isPrivate);
		if (row) return { count, first: `${row.line ?? row.people[0]?.name ?? ''}, ${year.year}` };
	}
	return { count, first: null };
}
