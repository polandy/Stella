import { describe, expect, it } from 'bun:test';
import { navigationTurns } from './navigation-turns';

/*
 * Leaving a page ends its undo window: the layout holds the navigation back, sends what was
 * pending, then issues it again (docs/04 §4.9). Only the latest navigation may be issued again —
 * one the reader has since moved on from would pull them back to where they no longer are.
 */

describe('navigationTurns', () => {
	it('lets the latest navigation go ahead once its removals are sent', () => {
		const turns = navigationTurns();
		const toPeople = turns.take();
		expect(toPeople()).toBe(true);
	});

	it('stops a held navigation once a newer one has started', () => {
		const turns = navigationTurns();
		const toPeople = turns.take();
		const toPerson = turns.take();
		expect(toPeople()).toBe(false);
		expect(toPerson()).toBe(true);
	});

	it('keeps separate layouts from answering for each other', () => {
		const one = navigationTurns();
		const other = navigationTurns();
		const held = one.take();
		other.take();
		expect(held()).toBe(true);
	});
});
