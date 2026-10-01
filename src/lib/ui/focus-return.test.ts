import { describe, expect, it } from 'bun:test';
import { neighbourAfterLeaving, owesFocusBack, type ListedRow } from './focus-return';

/*
 * Where keyboard focus goes when the control holding it disappears (WCAG 2.4.3): a form that
 * closes after Save or Cancel, a row that leaves its list on Remove. Without a decision the
 * browser drops focus on the page itself and the next Tab starts again at the top.
 */

const row = (key: string, leaving = false): ListedRow => ({ key, leaving });

describe('neighbourAfterLeaving', () => {
	it('is the row that moves up into the gone row’s place', () => {
		expect(neighbourAfterLeaving([row('a'), row('b'), row('c')], 'b')).toBe('c');
	});

	it('steps over rows that are on their way out themselves', () => {
		expect(neighbourAfterLeaving([row('a'), row('b'), row('c', true), row('d')], 'b')).toBe('d');
	});

	it('falls back to the nearest row above when nothing stands below', () => {
		expect(neighbourAfterLeaving([row('a'), row('b', true), row('c')], 'c')).toBe('a');
	});

	it('is null when no row is left, so the caller lands on the list’s heading', () => {
		expect(neighbourAfterLeaving([row('a')], 'a')).toBeNull();
		expect(neighbourAfterLeaving([row('a', true), row('b')], 'b')).toBeNull();
	});

	it('is null for a row that is not in the list at all', () => {
		expect(neighbourAfterLeaving([row('a')], 'z')).toBeNull();
	});
});

describe('owesFocusBack', () => {
	it('takes focus back when it was inside and the browser has dropped it on the page', () => {
		expect(owesFocusBack({ hadFocusInside: true, focusNow: 'page' })).toBe(true);
	});

	it('leaves focus alone when the reader has already put it somewhere else', () => {
		expect(owesFocusBack({ hadFocusInside: true, focusNow: 'elsewhere' })).toBe(false);
	});

	it('does not pull focus to a form that was closed from somewhere else', () => {
		expect(owesFocusBack({ hadFocusInside: false, focusNow: 'page' })).toBe(false);
	});
});
