import { describe, expect, it } from 'bun:test';
import { held, hiddenIds, sending, settle, takenBack, type Batches } from './batches';

/*
 * Last names held for the undo window before they are sent (docs/concepts/surnames.md §7,
 * docs/02 §2.23). The rows a batch names leave the list at once and come back only when the
 * batch is taken back or fails; what reaches the server waits for the window.
 */

const none: Batches = {};

describe('the held batches', () => {
	it('hides the people of a held batch, and of one being sent or sent', () => {
		let batches = held(none, 'b1', ['lea', 'max']);
		batches = held(batches, 'b2', ['jo']);
		batches = sending(batches, 'b2');
		expect([...hiddenIds(batches)].sort()).toEqual(['jo', 'lea', 'max']);
		expect([...hiddenIds(settle(batches, 'b2', 'sent'))].sort()).toEqual(['jo', 'lea', 'max']);
	});

	it('brings the people back when the batch is taken back before it was sent', () => {
		const batches = held(none, 'b1', ['lea']);
		const stillHeld = takenBack(batches, () => true);
		const undone = takenBack(batches, () => false);
		expect([...hiddenIds(stillHeld)]).toEqual(['lea']);
		expect([...hiddenIds(undone)]).toEqual([]);
	});

	it('never reads a batch on its way as taken back', () => {
		const batches = sending(held(none, 'b1', ['lea']), 'b1');
		expect([...hiddenIds(takenBack(batches, () => false))]).toEqual(['lea']);
	});

	it('brings the people back when the send failed', () => {
		const batches = sending(held(none, 'b1', ['lea']), 'b1');
		expect([...hiddenIds(settle(batches, 'b1', 'failed'))]).toEqual([]);
	});
});
