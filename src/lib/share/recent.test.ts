import { describe, expect, it } from 'bun:test';
import { noteViewed, peopleToOffer, RECENT_OFFERED } from './recent';

const person = (id: string) => ({ id });

describe('who a share is offered to first', () => {
	it('puts the people last opened on this device first, in that order', () => {
		const offered = peopleToOffer([person('a'), person('b'), person('c')], ['c', 'a'], []);

		expect(offered.map((p) => p.id)).toEqual(['c', 'a', 'b']);
	});

	it('fills up with whoever was last touched, newest first', () => {
		const offered = peopleToOffer(
			[person('a'), person('b'), person('c'), person('d')],
			['d'],
			[
				{ contactId: 'c', lastTouchedOn: null },
				{ contactId: 'a', lastTouchedOn: '2026-10-01' },
				{ contactId: 'b', lastTouchedOn: '2026-10-20' },
				{ contactId: 'd', lastTouchedOn: '2026-10-30' }
			]
		);

		expect(offered.map((p) => p.id)).toEqual(['d', 'b', 'a', 'c']);
	});

	it(`offers no more than ${RECENT_OFFERED}`, () => {
		const people = Array.from({ length: 20 }, (_, i) => person(`p${i}`));

		expect(peopleToOffer(people, [], [])).toHaveLength(RECENT_OFFERED);
	});

	it('skips a remembered person the viewer can no longer see', () => {
		expect(peopleToOffer([person('a')], ['gone', 'a'], []).map((p) => p.id)).toEqual(['a']);
	});
});

describe('remembering who was opened', () => {
	it('moves the person opened to the front without a second copy', () => {
		expect(noteViewed(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
	});

	it(`keeps only the last ${RECENT_OFFERED}`, () => {
		const many = Array.from({ length: RECENT_OFFERED }, (_, i) => `p${i}`);

		const noted = noteViewed(many, 'new');

		expect(noted).toHaveLength(RECENT_OFFERED);
		expect(noted[0]).toBe('new');
	});
});
