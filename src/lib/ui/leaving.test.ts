import { describe, expect, it } from 'bun:test';
import { leavingStyle, LEAVE_MS, type LeavingBox } from './leaving';

/*
 * The shape a leaving row has at each point of its way out (docs/05 §5.4).
 *
 * The transition itself belongs to the browser, but the shape it hands the row at each point
 * does not. How much the list gives back is deliberately *not* computed from that shape — it is
 * read off the list, whose own arithmetic lives in `placeAfter` next door — because a row's
 * height and the space it takes in a list are not the same number.
 */

const row: LeavingBox = {
	height: 74,
	paddingTop: 8,
	paddingBottom: 8,
	marginBottom: 0,
	borderWidth: 1
};

describe('leavingStyle', () => {
	it('leaves the row untouched at the start, except for clipping what it closes over', () => {
		const style = leavingStyle(row, 1);
		expect(style).toContain('opacity: 1');
		expect(style).toContain('height: 74px');
		expect(style).toContain('padding-top: 8px');
		expect(style).toContain('overflow: hidden');
	});

	it('closes every part of the box, not only its height', () => {
		const style = leavingStyle(row, 0);
		for (const gone of [
			'height: 0px',
			'padding-top: 0px',
			'padding-bottom: 0px',
			'border-width: 0px',
			'opacity: 0'
		]) {
			expect(style).toContain(gone);
		}
	});

	/*
	 * The soft part: the row is invisible well before the list finishes closing over it, so the
	 * eye reads *gone* first and *shorter* second rather than watching a shrinking sliver.
	 */
	it('has finished fading while the height is still closing', () => {
		expect(leavingStyle(row, 0.45)).toContain('opacity: 1');
		expect(leavingStyle(row, 0.2)).toContain('opacity: 0.444');
		expect(leavingStyle(row, 0.45)).not.toContain('height: 0px');
	});
});

describe('LEAVE_MS', () => {
	it('is the measured duration, not a number typed into a component', () => {
		expect(LEAVE_MS).toBe(200);
	});
});
