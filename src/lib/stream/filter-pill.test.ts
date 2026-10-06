import { describe, expect, it } from 'bun:test';
import { NO_FILTER } from './filter';
import { filterPill } from './filter-pill';

/*
 * On a phone Home folds the What and Who chip rows into one *Filter* pill (docs/02 §2.22.2,
 * docs/05 §5.5). The pill has to say whether the stream is narrowed — a narrowed stream must
 * never pass for a quiet household — and by what, without opening the sheet.
 */

describe('filterPill', () => {
	it('stays plain and counts nothing for the whole stream', () => {
		expect(filterPill(NO_FILTER)).toEqual({ count: 0, highlighted: false, narrowedTo: [] });
	});

	it('counts one for a kind and names it', () => {
		expect(filterPill({ kind: 'moment', memberId: null })).toEqual({
			count: 1,
			highlighted: true,
			narrowedTo: [{ axis: 'kind', kind: 'moment' }]
		});
	});

	it('counts one for a member and names them', () => {
		expect(filterPill({ kind: null, memberId: 'u2' })).toEqual({
			count: 1,
			highlighted: true,
			narrowedTo: [{ axis: 'member', memberId: 'u2' }]
		});
	});

	it('counts both axes, the kind first as the sheet lists it', () => {
		const pill = filterPill({ kind: 'interaction', memberId: 'u1' });

		expect(pill.count).toBe(2);
		expect(pill.highlighted).toBe(true);
		expect(pill.narrowedTo).toEqual([
			{ axis: 'kind', kind: 'interaction' },
			{ axis: 'member', memberId: 'u1' }
		]);
	});
});
