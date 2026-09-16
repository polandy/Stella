import { describe, expect, it } from 'bun:test';
import { allSent, answeredCount, type AnsweredClaims } from './answered';

/*
 * Held versus sent (docs/02 §2.4.1). The distinction exists because of one defect: a screen
 * that treats "answered and no longer held" as sent hides a row the moment it is taken back,
 * since an undone answer is also no longer held.
 */

const held = (answer: 'accept' | 'decline') => ({ answer, committed: false });
const sent = (answer: 'accept' | 'decline') => ({ answer, committed: true });

describe('answeredCount', () => {
	it('counts held and sent alike, because the reader sees no difference', () => {
		const answered: AnsweredClaims = { a: held('accept'), b: sent('decline') };
		expect(answeredCount(answered)).toBe(2);
	});

	it('forgets a claim taken back', () => {
		expect(answeredCount({})).toBe(0);
	});
});

describe('allSent', () => {
	it('is true only once every claim went through', () => {
		expect(allSent({ a: sent('accept'), b: sent('decline') }, ['a', 'b'])).toBe(true);
	});

	/* The defect, as a case: one still held means the group stays on screen. */
	it('is false while any answer is still inside its undo window', () => {
		expect(allSent({ a: sent('accept'), b: held('decline') }, ['a', 'b'])).toBe(false);
	});

	it('is false for a claim nobody has answered', () => {
		expect(allSent({ a: sent('accept') }, ['a', 'b'])).toBe(false);
	});

	/* An empty group is not a finished one; it is a group that should never have rendered. */
	it('is false for no claims at all', () => {
		expect(allSent({}, [])).toBe(false);
	});
});
