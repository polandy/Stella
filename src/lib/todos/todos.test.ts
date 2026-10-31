import { describe, expect, it } from 'bun:test';
import type { DateLanguage } from '$lib/dates/labels';
import { INTL_LOCALES } from '$lib/i18n/locales';
import { en as english } from '$lib/i18n/messages/en';
import { createTranslator } from '$lib/i18n/translate';
import {
	asksForNewTodo,
	cardTodos,
	dueLabel,
	dueStanding,
	newTodoPath,
	orderOpenTodos
} from './todos';

/*
 * How an open to-do stands and reads (docs/02 §2.26): the card's order, whether a day is
 * overdue, and its label — all handed *today*, never reading the clock.
 */

const en: DateLanguage = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
const de: DateLanguage = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };
const TODAY = '2026-10-31';

describe('dueStanding', () => {
	it('has none without a day', () => {
		expect(dueStanding(null, TODAY)).toBeNull();
	});

	it('is overdue from the day after, today on the day, soon within a week, later after', () => {
		expect(dueStanding('2026-10-30', TODAY)).toBe('overdue');
		expect(dueStanding(TODAY, TODAY)).toBe('today');
		expect(dueStanding('2026-11-01', TODAY)).toBe('soon');
		expect(dueStanding('2026-11-07', TODAY)).toBe('soon');
		expect(dueStanding('2026-11-08', TODAY)).toBe('later');
	});
});

describe('dueLabel', () => {
	it('says nothing without a day', () => {
		expect(dueLabel(en, null, TODAY)).toBeNull();
	});

	it('says today and tomorrow rather than a date', () => {
		expect(dueLabel(en, TODAY, TODAY)).toBe('today');
		expect(dueLabel(en, '2026-11-01', TODAY)).toBe('tomorrow');
		expect(dueLabel(de, TODAY, TODAY)).toBe('heute');
	});

	it('names the day it is due by, the year only when it is another one', () => {
		expect(dueLabel(en, '2026-11-06', TODAY)).toBe('by Fri, 6 Nov');
		expect(dueLabel(de, '2026-11-06', TODAY)).toBe('bis Fr., 6. Nov.');
		expect(dueLabel(en, '2027-01-04', TODAY)).toBe('by Mon, 4 Jan 2027');
	});

	it('says since when one is overdue', () => {
		expect(dueLabel(en, '2026-10-28', TODAY)).toBe('was due Wed, 28 Oct');
		expect(dueLabel(de, '2026-10-28', TODAY)).toBe('war fällig am Mi., 28. Okt.');
	});
});

describe('orderOpenTodos', () => {
	const todo = (id: string, dueOn: string | null, createdAt: number) => ({ id, dueOn, createdAt });

	it('puts those with a day first, soonest first, then the rest newest first', () => {
		const ordered = orderOpenTodos([
			todo('old-no-day', null, 1),
			todo('late', '2026-11-20', 2),
			todo('new-no-day', null, 5),
			todo('soon', '2026-11-02', 3),
			todo('overdue', '2026-10-20', 4)
		]);
		expect(ordered.map((t) => t.id)).toEqual([
			'overdue',
			'soon',
			'late',
			'new-no-day',
			'old-no-day'
		]);
	});

	it('leaves its input alone', () => {
		const input = [todo('b', null, 1), todo('a', '2026-11-02', 2)];
		orderOpenTodos(input);
		expect(input.map((t) => t.id)).toEqual(['b', 'a']);
	});
});

describe('cardTodos', () => {
	const todo = (id: string, dueOn: string | null, createdAt: number) => ({ id, dueOn, createdAt });
	const book = todo('book', '2026-11-02', 1);
	const recipe = todo('recipe', null, 2);
	const rows = (list: ReturnType<typeof cardTodos<ReturnType<typeof todo>>>) =>
		list.map((row) => [row.todo.id, row.done]);

	it('shows the open ones in the card’s order, none of them done', () => {
		expect(rows(cardTodos([recipe, book], [], new Set()))).toEqual([
			['book', false],
			['recipe', false]
		]);
	});

	it('keeps a ticked one where it stood, struck through, while its toast stands', () => {
		const justDone = [{ todo: book, noticeId: 7, reopening: false }];
		expect(rows(cardTodos([recipe], justDone, new Set([7])))).toEqual([
			['book', true],
			['recipe', false]
		]);
	});

	it('so the last one ticked does not leave the card empty under the reader’s thumb', () => {
		const justDone = [{ todo: book, noticeId: 7, reopening: false }];
		expect(rows(cardTodos([], justDone, new Set([7])))).toEqual([['book', true]]);
	});

	it('marks it done while it is saved, before the page is read again', () => {
		const justDone = [{ todo: book, noticeId: null, reopening: false }];
		expect(rows(cardTodos([book], justDone, new Set()))).toEqual([['book', true]]);
	});

	it('shows it open once Stella says so again — unticked in Activity while the toast stands', () => {
		const justDone = [{ todo: book, noticeId: 7, reopening: false }];
		expect(rows(cardTodos([book], justDone, new Set([7])))).toEqual([['book', false]]);
	});

	it('keeps it in view, struck through, while the tick is still being saved', () => {
		const justDone = [{ todo: book, noticeId: null, reopening: false }];
		expect(rows(cardTodos([], justDone, new Set()))).toEqual([['book', true]]);
	});

	it('lets it go once the toast is gone', () => {
		const justDone = [{ todo: book, noticeId: 7, reopening: false }];
		expect(rows(cardTodos([recipe], justDone, new Set()))).toEqual([['recipe', false]]);
	});

	it('shows it open again while *Undo* is on its way, so the card does not blink', () => {
		const justDone = [{ todo: book, noticeId: 7, reopening: true }];
		expect(rows(cardTodos([], justDone, new Set()))).toEqual([['book', false]]);
		expect(rows(cardTodos([book], justDone, new Set()))).toEqual([['book', false]]);
	});
});

describe('newTodoPath', () => {
	it('lands on the person with the add field open, and is read back', () => {
		const path = newTodoPath('c1');
		expect(path).toBe('/contacts/c1?todo=new');
		expect(asksForNewTodo(new URL(path, 'https://stella.test'))).toBe(true);
		expect(asksForNewTodo(new URL('/contacts/c1', 'https://stella.test'))).toBe(false);
	});
});

describe('the English wording', () => {
	// Every message about to-dos as it reads, a function's filled with a stand-in for each value.
	const anyValue = new Proxy({}, { get: () => 'X' });
	const said = Object.entries(english)
		.filter(([key]) => /todo/i.test(key))
		.map(([key, message]): [string, string] => [
			key,
			typeof message === 'function'
				? String((message as (p: unknown) => unknown)(anyValue))
				: message
		]);
	const keysSaying = (pattern: RegExp) =>
		said.filter(([, text]) => pattern.test(text)).map(([key]) => key);

	it('says *To do* only as the card’s name; one item is a *to-do* everywhere else', () => {
		expect(keysSaying(/\bTo do\b/)).toEqual(['todos.title']);
		expect(keysSaying(/\btodos?\b/i)).toEqual([]);
	});
});
