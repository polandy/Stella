import { describe, expect, it } from 'bun:test';
import { fieldInView, panelPlacement, PANEL_MIN_BELOW_PX } from './panel-placement';

const view = { top: 0, bottom: 800 };

describe('panelPlacement', () => {
	it('opens below when there is room', () => {
		const p = panelPlacement({ field: { top: 100, bottom: 140 }, view });
		expect(p.side).toBe('below');
		expect(p.maxHeight).toBe(800 - 140 - 8);
	});

	it('flips above when the room below is tight and the room above is larger', () => {
		const p = panelPlacement({ field: { top: 600, bottom: 640 }, view });
		expect(p.side).toBe('above');
		expect(p.maxHeight).toBe(600 - 8);
	});

	it('stays below when above is no roomier', () => {
		const p = panelPlacement({
			field: { top: 20, bottom: 60 },
			view: { top: 0, bottom: 60 + PANEL_MIN_BELOW_PX - 10 }
		});
		expect(p.side).toBe('below');
	});

	it('honours a keyboard-shrunk viewport', () => {
		const p = panelPlacement({ field: { top: 300, bottom: 340 }, view: { top: 0, bottom: 450 } });
		expect(p.side).toBe('above');
	});

	it('never reports a negative height', () => {
		const p = panelPlacement({ field: { top: 0, bottom: 800 }, view });
		expect(p.maxHeight).toBeGreaterThanOrEqual(0);
	});
});

describe('fieldInView', () => {
	it('is true while any part of the field is visible', () => {
		expect(fieldInView({ top: -10, bottom: 20 }, view)).toBe(true);
	});
	it('is false once it scrolled out either side', () => {
		expect(fieldInView({ top: -60, bottom: -20 }, view)).toBe(false);
		expect(fieldInView({ top: 820, bottom: 860 }, view)).toBe(false);
	});
});
