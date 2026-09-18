import { describe, expect, it } from 'bun:test';
import { filterSummary, nextMenuIndex } from './menu';

/*
 * The two decisions behind the graph toolbar's menus (docs/05 §5.8): what the Filter button
 * says about what is shown, and where the arrow keys move inside an open menu.
 */

describe('filterSummary', () => {
	const all = ['family', 'romantic', 'social', 'professional', 'circles', 'kinship'];

	it('counts what is shown out of everything there is', () => {
		const summary = filterSummary(new Set(['family', 'social']), all, new Set(all));

		expect(summary).toMatchObject({ shown: 2, total: 6 });
	});

	it('calls a map narrowed once it shows less than it opened with', () => {
		expect(filterSummary(new Set(all.slice(1)), all, new Set(all)).narrowed).toBe(true);
	});

	it('does not call a map narrowed that shows just what it opened with', () => {
		// The person-page map opens with circles off: five of six, and nothing the reader did.
		const opening = new Set(all.filter((k) => k !== 'circles'));

		expect(filterSummary(new Set(opening), all, opening).narrowed).toBe(false);
		expect(filterSummary(new Set(opening), all, opening).shown).toBe(5);
	});

	it('calls a map narrowed that shows the same number but different kinds', () => {
		const opening = new Set(all.filter((k) => k !== 'circles'));
		const swapped = new Set(all.filter((k) => k !== 'kinship'));

		expect(filterSummary(swapped, all, opening).narrowed).toBe(true);
	});
});

describe('nextMenuIndex', () => {
	it('steps down and up, wrapping at either end', () => {
		expect(nextMenuIndex(0, 3, 'ArrowDown')).toBe(1);
		expect(nextMenuIndex(2, 3, 'ArrowDown')).toBe(0);
		expect(nextMenuIndex(0, 3, 'ArrowUp')).toBe(2);
	});

	it('jumps to the first and the last item', () => {
		expect(nextMenuIndex(1, 3, 'Home')).toBe(0);
		expect(nextMenuIndex(1, 3, 'End')).toBe(2);
	});

	it('starts at the top when nothing has focus yet', () => {
		expect(nextMenuIndex(-1, 3, 'ArrowDown')).toBe(0);
		expect(nextMenuIndex(-1, 3, 'ArrowUp')).toBe(2);
	});

	it('ignores every other key', () => {
		expect(nextMenuIndex(1, 3, 'a')).toBeNull();
	});
});
