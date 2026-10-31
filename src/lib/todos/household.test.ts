import { describe, expect, it } from 'bun:test';
import { hasPressingTodo, todoBand, todoListGroups } from './household';
import type { CardTodo } from './todos';

/*
 * The household's to-dos beyond one person (docs/02 §2.26.6): Home's band and the `/todos`
 * groups, both handed *today* and the card's rows (`cardTodos`), so a struck row stays put.
 */

const TODAY = '2026-10-31';
type T = { id: string; dueOn: string | null; createdAt: number };
const row = (id: string, dueOn: string | null, done = false): CardTodo<T> => ({
	todo: { id, dueOn, createdAt: 0 },
	done
});
const ids = (rows: readonly CardTodo<T>[]) => rows.map((r) => r.todo.id);

describe('todoBand', () => {
	it('holds what is overdue or due within the coming week, soonest first', () => {
		const band = todoBand(
			[
				row('overdue', '2026-10-28'),
				row('today', TODAY),
				row('later', '2026-11-08'),
				row('none', null)
			],
			TODAY
		);
		expect(ids(band.rows)).toEqual(['overdue', 'today']);
	});

	it('stops after three', () => {
		const band = todoBand(
			[row('a', '2026-10-30'), row('b', TODAY), row('c', '2026-11-02'), row('d', '2026-11-07')],
			TODAY
		);
		expect(ids(band.rows)).toEqual(['a', 'b', 'c']);
	});

	it('counts every open to-do for *Show all*, not only the soon ones', () => {
		const band = todoBand([row('a', TODAY), row('later', '2026-12-01'), row('none', null)], TODAY);
		expect(band.open).toBe(3);
		expect(band.showsAll).toBe(true);
	});

	it('has no *Show all* when the band already holds every open one', () => {
		const band = todoBand([row('a', TODAY), row('b', '2026-11-02')], TODAY);
		expect(band.showsAll).toBe(false);
	});

	it('keeps a just-ticked row in its place but does not count it as open', () => {
		const band = todoBand([row('a', TODAY, true), row('b', '2026-11-02')], TODAY);
		expect(ids(band.rows)).toEqual(['a', 'b']);
		expect(band.open).toBe(1);
		expect(band.showsAll).toBe(false);
	});

	it('is empty when nothing is due that soon', () => {
		expect(todoBand([row('later', '2026-11-20'), row('none', null)], TODAY).rows).toEqual([]);
	});
});

describe('hasPressingTodo', () => {
	it('is true for an overdue one or one due today, not for one later this week', () => {
		expect(hasPressingTodo([{ dueOn: '2026-10-30' }], TODAY)).toBe(true);
		expect(hasPressingTodo([{ dueOn: TODAY }], TODAY)).toBe(true);
		expect(hasPressingTodo([{ dueOn: '2026-11-01' }, { dueOn: null }], TODAY)).toBe(false);
	});
});

describe('todoListGroups', () => {
	it('groups into Overdue, This week, Later and No day, keeping the rows’ order', () => {
		const groups = todoListGroups(
			[
				row('o', '2026-10-20'),
				row('t', TODAY),
				row('s', '2026-11-07'),
				row('l', '2026-11-08'),
				row('n', null)
			],
			TODAY
		);
		expect(groups.map((g) => [g.key, ids(g.rows)])).toEqual([
			['overdue', ['o']],
			['thisWeek', ['t', 's']],
			['later', ['l']],
			['noDay', ['n']]
		]);
	});

	it('leaves out a group with nothing in it', () => {
		expect(todoListGroups([row('n', null)], TODAY).map((g) => g.key)).toEqual(['noDay']);
		expect(todoListGroups([], TODAY)).toEqual([]);
	});
});
