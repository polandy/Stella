import { describe, expect, it } from 'bun:test';
import { circleTimeline } from './timeline';

/*
 * The geometry of a circle's sub-circles timeline (docs/02 §2.4.2): one bar per dated
 * sub-circle on a month axis, an open end running to the axis end, a today marker and a tick at
 * every new year. Percentages, so the page only places them.
 */

const TODAY = '2026-10-19';

describe('circleTimeline', () => {
	it('spans the axis from the first start to the last end, with today inside', () => {
		const line = circleTimeline(
			[
				{ startDate: '2025-01', endDate: '2025-12' },
				{ startDate: '2026-01', endDate: '2026-12' }
			],
			TODAY
		)!;
		// Jan 2025 … Dec 2026 inclusive: 24 months, the first bar the left half.
		expect(line.bars[0]).toEqual({ left: 0, width: 50, open: false });
		expect(line.bars[1]).toEqual({ left: 50, width: 50, open: false });
		// Mid-October 2026 is month 21 and a half of 24.
		expect(line.today).toBeCloseTo((21 + 18 / 31) * (100 / 24), 5);
		expect(line.ticks).toEqual([{ year: 2026, at: 50 }]);
	});

	it('runs an open-ended bar to the axis end and keeps the axis a while past today', () => {
		const line = circleTimeline([{ startDate: '2026-08', endDate: null }], TODAY)!;
		const bar = line.bars[0]!;
		expect(bar.open).toBe(true);
		expect(bar.left).toBe(0);
		expect(bar.left + bar.width).toBeCloseTo(100, 5);
		// Six months past today: Aug 2026 … Apr 2027.
		expect(line.ticks).toEqual([{ year: 2027, at: (5 / 9) * 100 }]);
	});

	it('keeps a short circle visible', () => {
		const line = circleTimeline(
			[
				{ startDate: '2000-01', endDate: '2000-01' },
				{ startDate: '2020-01', endDate: '2026-12' }
			],
			TODAY
		)!;
		expect(line.bars[0]!.width).toBeGreaterThanOrEqual(1.5);
	});

	it('gives an undated row no bar, and has nothing to draw when no row is dated', () => {
		const line = circleTimeline(
			[
				{ startDate: null, endDate: null },
				{ startDate: '2025-08', endDate: '2026-07' }
			],
			TODAY
		)!;
		expect(line.bars[0]).toBeNull();
		expect(line.bars[1]).not.toBeNull();
		expect(circleTimeline([{ startDate: null, endDate: '2026-07' }], TODAY)).toBeNull();
	});
});
