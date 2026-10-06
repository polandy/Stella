import { describe, expect, it } from 'bun:test';
import {
	filterSummary,
	menuMaxHeight,
	menuOpensUpward,
	menuShift,
	nearMiss,
	nextMenuIndex
} from './menu';

/*
 * The decisions behind the graph toolbar's menus (docs/05 §5.8): what the Filter button says
 * about what is shown, where the arrow keys move inside an open menu, and how far an open menu
 * moves to stay on the map.
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

describe('menuShift', () => {
	// A phone-sized map, 12 px kept clear at each side.
	const map = { left: 0, right: 412 };
	const MARGIN = 12;

	it('leaves a menu that fits where it opened', () => {
		expect(menuShift({ left: 20, right: 300 }, map, MARGIN)).toBe(0);
	});

	it('pulls a menu running past the right edge back inside', () => {
		// Filter's menu opening under a pill that stands right of the search field.
		expect(menuShift({ left: 215, right: 495 }, map, MARGIN)).toBe(412 - MARGIN - 495);
	});

	it('pushes a menu running past the left edge back inside', () => {
		expect(menuShift({ left: -40, right: 240 }, map, MARGIN)).toBe(MARGIN + 40);
	});

	it('keeps the start in view when the menu is wider than the map', () => {
		const shift = menuShift({ left: 100, right: 600 }, map, MARGIN);

		expect(100 + shift).toBe(MARGIN);
	});
});

describe('menuOpensUpward', () => {
	// A phone screen 915 px tall, 12 px kept clear top and bottom.
	const screen = { top: 0, bottom: 915 };
	const MARGIN = 12;

	it('opens below when the menu fits there', () => {
		expect(menuOpensUpward({ top: 100, bottom: 130 }, 320, screen, MARGIN)).toBe(false);
	});

	it('opens above a pill near the foot of the screen', () => {
		// The day pill in the composer, a sheet at the bottom of the phone.
		expect(menuOpensUpward({ top: 820, bottom: 845 }, 320, screen, MARGIN)).toBe(true);
	});

	it('stays below when there is even less room above', () => {
		expect(menuOpensUpward({ top: 200, bottom: 230 }, 800, screen, MARGIN)).toBe(false);
	});
});

describe('menuMaxHeight', () => {
	// The map on a person's page: 730 px tall on the screen, the pill near its top.
	const map = { top: 250, bottom: 980 };
	const pill = { top: 280, bottom: 310 };
	const MARGIN = 12;
	const GAP = 6;

	it('lets a menu below its pill reach down to the foot of the map, no further', () => {
		expect(menuMaxHeight(pill, false, map, MARGIN, GAP)).toBe(980 - 12 - 310 - 6);
	});

	it('lets a menu above its pill reach up to the top of the map', () => {
		const low = { top: 900, bottom: 930 };

		expect(menuMaxHeight(low, true, map, MARGIN, GAP)).toBe(900 - 6 - (250 + 12));
	});

	it('never asks for less than nothing', () => {
		expect(menuMaxHeight({ top: 970, bottom: 1000 }, false, map, MARGIN, GAP)).toBe(0);
	});
});

describe('nearMiss', () => {
	const menu = { left: 100, top: 50, right: 300, bottom: 400 };

	it('a tap a thumb-width outside the edge was meant for the menu', () => {
		expect(nearMiss(menu, { x: 310, y: 200 }, 16)).toBe(true);
		expect(nearMiss(menu, { x: 90, y: 405 }, 16)).toBe(true);
	});

	it('a tap well away from the menu is a deliberate close', () => {
		expect(nearMiss(menu, { x: 330, y: 200 }, 16)).toBe(false);
		expect(nearMiss(menu, { x: 200, y: 20 }, 16)).toBe(false);
	});

	it('the margin edge itself still counts as near', () => {
		expect(nearMiss(menu, { x: 316, y: 50 }, 16)).toBe(true);
		expect(nearMiss(menu, { x: 317, y: 50 }, 16)).toBe(false);
	});
});
