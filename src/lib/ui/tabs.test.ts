import { describe, expect, it } from 'bun:test';
import { tabAfterKey } from './tabs';

/*
 * A tab list is one Tab stop; the arrow keys move along it (WAI-ARIA tabs pattern), wrapping
 * at either end so the reader never has to turn round.
 */

const TABS = ['all', 'stella', 'immich'] as const;

describe('tabAfterKey', () => {
	it('steps right and left along the list', () => {
		expect(tabAfterKey(TABS, 'all', 'ArrowRight')).toBe('stella');
		expect(tabAfterKey(TABS, 'stella', 'ArrowLeft')).toBe('all');
	});

	it('wraps round at either end', () => {
		expect(tabAfterKey(TABS, 'immich', 'ArrowRight')).toBe('all');
		expect(tabAfterKey(TABS, 'all', 'ArrowLeft')).toBe('immich');
	});

	it('leaves every other key to the page', () => {
		expect(tabAfterKey(TABS, 'all', 'Enter')).toBeNull();
		expect(tabAfterKey(TABS, 'all', 'ArrowDown')).toBeNull();
	});

	it('has nowhere to go in an empty list', () => {
		expect(tabAfterKey([], 'all', 'ArrowRight')).toBeNull();
	});
});
