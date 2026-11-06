import { describe, expect, it } from 'bun:test';
import { SAVED_NOTICE_MS, savedMomentAnchor } from './saved-moment';
import { UNDO_WINDOW_MS } from '$lib/undo/pending-removals';

describe('a moment just saved', () => {
	it('is found by the id of its journal entry', () => {
		expect(savedMomentAnchor('01HXYZ')).toBe('moment-01HXYZ');
	});

	it('is pointed to for less than an undo window', () => {
		expect(SAVED_NOTICE_MS).toBeLessThan(UNDO_WINDOW_MS);
	});
});
