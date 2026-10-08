import { describe, expect, it } from 'bun:test';
import { parseStoryCursor } from './cursor';

/*
 * The story cursor crosses the wire (docs/02 §2.23): the client posts back whatever the last
 * page handed it. Anything else has to be refused rather than coerced — a cursor read as
 * "start from the top" would quietly re-serve the whole story from the beginning, and one read
 * as "finished" would silently truncate it.
 */

const point = { day: '2026-08-05', recordedAt: 1_733_000_000_000 };

describe('parseStoryCursor', () => {
	it('accepts the three states a source can resume in', () => {
		expect(parseStoryCursor({ journal: 'top', interactions: 'finished', gifts: 'top' })).toEqual({
			journal: 'top',
			interactions: 'finished',
			gifts: 'top'
		});
		expect(parseStoryCursor({ journal: point, interactions: point, gifts: point })).toEqual({
			journal: point,
			interactions: point,
			gifts: point
		});
	});

	it('refuses a cursor that is missing a source', () => {
		expect(parseStoryCursor({ journal: 'top' })).toBeNull();
		expect(parseStoryCursor({})).toBeNull();
		// A page opened before gifts were in the story: refused, not read as "no gifts".
		expect(parseStoryCursor({ journal: 'top', interactions: 'top' })).toBeNull();
	});

	it('refuses a resume state it does not know', () => {
		expect(parseStoryCursor({ journal: 'restart', interactions: 'top', gifts: 'top' })).toBeNull();
	});

	it('refuses a point that is not a real point', () => {
		const rest = { interactions: 'top', gifts: 'top' };
		expect(parseStoryCursor({ journal: { day: '2026-08-05' }, ...rest })).toBeNull();
		expect(parseStoryCursor({ journal: { day: '', recordedAt: 1 }, ...rest })).toBeNull();
		expect(
			parseStoryCursor({ journal: { day: '2026-08-05', recordedAt: '1' }, ...rest })
		).toBeNull();
	});

	it('refuses anything that is not an object', () => {
		expect(parseStoryCursor(null)).toBeNull();
		expect(parseStoryCursor('top')).toBeNull();
		expect(parseStoryCursor([])).toBeNull();
	});
});
