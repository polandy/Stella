import { describe, expect, it } from 'bun:test';
import { focusAfterAnswer, owesFocus, type ListedRow } from './answer-focus';

/*
 * Where keyboard focus goes once an answered row has left its list (docs/05 §5.4, issue #127).
 * The focused button leaves with the row, so without a decision the browser drops focus on the
 * page itself and the next Tab starts again at the top — row forty becomes forty Tabs away.
 */

const row = (key: string, leaving = false): ListedRow => ({ key, leaving });

describe('focusAfterAnswer', () => {
	it('lands on the same control of the row that took the answered one’s place', () => {
		const rows = [row('a'), row('b', true), row('c')];
		expect(focusAfterAnswer(rows, 'b', 'decline', 'nowhere')).toEqual({
			row: 'c',
			control: 'decline'
		});
		expect(focusAfterAnswer(rows, 'b', 'accept', 'nowhere')).toEqual({
			row: 'c',
			control: 'accept'
		});
	});

	/*
	 * On the review page every person is a block of their own, and the rows are read in page
	 * order: when a person's last row goes, the next person's first row is what moved up.
	 */
	it('carries on into the next block when the answered row was the last of its own', () => {
		const rows = [row('ann-1'), row('ann-2', true), row('bob-1'), row('bob-2')];
		expect(focusAfterAnswer(rows, 'ann-2', 'accept', 'nowhere')).toEqual({
			row: 'bob-1',
			control: 'accept'
		});
	});

	/* A quick run of answers leaves several rows on their way out at once; none can take focus. */
	it('steps over rows that are themselves still leaving', () => {
		const rows = [row('a', true), row('b', true), row('c', true), row('d')];
		expect(focusAfterAnswer(rows, 'b', 'decline', 'nowhere')).toEqual({
			row: 'd',
			control: 'decline'
		});
	});

	it('falls back to the row above when nothing is left below', () => {
		const rows = [row('a'), row('b'), row('c', true)];
		expect(focusAfterAnswer(rows, 'c', 'decline', 'nowhere')).toEqual({
			row: 'b',
			control: 'decline'
		});
	});

	it('goes to the heading once the list is empty', () => {
		expect(focusAfterAnswer([row('a', true)], 'a', 'accept', 'nowhere')).toBe('heading');
		expect(focusAfterAnswer([row('a', true), row('b', true)], 'a', 'accept', 'nowhere')).toBe(
			'heading'
		);
	});

	/* Without its own position there is no "row that took its place" to point at. */
	it('goes to the heading when the answered row is no longer listed', () => {
		expect(focusAfterAnswer([row('a'), row('b')], 'gone', 'accept', 'nowhere')).toBe('heading');
	});

	/* Some browsers blur a row that turns inert, others leave focus in it until it is removed. */
	it('acts while focus is still inside the leaving row', () => {
		const rows = [row('a', true), row('b')];
		expect(focusAfterAnswer(rows, 'a', 'accept', 'leaving-row')).toEqual({
			row: 'b',
			control: 'accept'
		});
	});

	/*
	 * The reader moved on during the row's way out — tabbed ahead, clicked into a field, pressed
	 * Undo in the toast. Pulling focus back would take their place away a second time.
	 */
	it('leaves focus alone once the reader has put it somewhere else', () => {
		const rows = [row('a', true), row('b')];
		expect(focusAfterAnswer(rows, 'a', 'accept', 'elsewhere')).toBeNull();
	});
});

describe('owesFocus', () => {
	it('is owed for an answer given from a button the reader can see is focused', () => {
		expect(owesFocus({ inAnswer: true, visible: true })).toBe(true);
	});

	/*
	 * A click focuses the button too, in most browsers — but without a visible ring, and a
	 * pointer reader never asked for a place in the tab order. Moving focus for them could
	 * scroll the page (the heading may be far above), undoing the hold that keeps the list still
	 * under their hand.
	 */
	it('is not owed for an answer given with a pointer', () => {
		expect(owesFocus({ inAnswer: true, visible: false })).toBe(false);
	});

	it('is not owed when focus was never on the answer', () => {
		expect(owesFocus({ inAnswer: false, visible: true })).toBe(false);
	});
});
