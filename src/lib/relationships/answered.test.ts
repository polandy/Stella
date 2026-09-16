import { describe, expect, it } from 'bun:test';
import { allSent, answeredCount, wasTakenBack, type AnsweredClaims } from './answered';

/*
 * Held versus sent (docs/02 §2.4.1). The distinction exists because of one defect: a screen
 * that treats "answered and no longer held" as sent hides a row the moment it is taken back,
 * since an undone answer is also no longer held.
 */

const held = (answer: 'accept' | 'decline') => ({ answer, state: 'held' }) as const;
const sending = (answer: 'accept' | 'decline') => ({ answer, state: 'sending' }) as const;
const sent = (answer: 'accept' | 'decline') => ({ answer, state: 'sent' }) as const;

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

describe('wasTakenBack', () => {
	it('is true for an answer the store stopped holding before it was ever sent', () => {
		expect(wasTakenBack(held('accept'), false)).toBe(true);
	});

	it('is false while the window is still open', () => {
		expect(wasTakenBack(held('accept'), true)).toBe(false);
	});

	/*
	 * The defect this exists for: the store drops a removal from pending *before* the request it
	 * triggers comes back, so between those two moments an answer on its way to the server looks
	 * exactly like one that was taken back. Reading it as an undo put the answered row back on
	 * screen, count and all, while the write was in flight — and it stayed wrong until a reload.
	 */
	it('is false for an answer already on its way to the server', () => {
		expect(wasTakenBack(sending('accept'), false)).toBe(false);
	});

	it('is false for one that arrived', () => {
		expect(wasTakenBack(sent('decline'), false)).toBe(false);
	});
});
