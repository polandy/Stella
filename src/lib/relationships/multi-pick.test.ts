import { describe, expect, it } from 'bun:test';
import {
	capState,
	chipRefusals,
	exclusionForEveryone,
	oneDateForAll,
	parentsOnRecord,
	pickCap,
	secondParentOffer,
	sharedSince,
	sincePerPair
} from './multi-pick';
import type { KinChoice } from './since';

const childOf = { type: { key: 'parent_child' }, side: 'reverse' as const };
const parentOf = { type: { key: 'parent_child' }, side: 'forward' as const };

describe('pickCap', () => {
	it('lets a partnership take one person, whichever side and word', () => {
		expect(pickCap({ type: { key: 'partner' }, side: 'forward' }, 0)).toBe(1);
		expect(pickCap({ type: { key: 'spouse' }, side: 'forward' }, 2)).toBe(1);
	});

	it('gives "Child of" two parents minus the ones already on record', () => {
		expect(pickCap(childOf, 0)).toBe(2);
		expect(pickCap(childOf, 1)).toBe(1);
		expect(pickCap(childOf, 2)).toBe(0);
	});

	it('never goes below nothing, however many parents a household recorded', () => {
		expect(pickCap(childOf, 3)).toBe(0);
	});

	it('leaves "Parent of" and every other type unlimited', () => {
		expect(pickCap(parentOf, 2)).toBeNull();
		expect(pickCap({ type: { key: 'sibling' }, side: 'forward' }, 0)).toBeNull();
		expect(pickCap({ type: { key: 'godparent' }, side: 'reverse' }, 2)).toBeNull();
	});

	it('is unlimited while no type is chosen', () => {
		expect(pickCap(null, 2)).toBeNull();
	});
});

describe('parentsOnRecord', () => {
	it('counts the parents the household recorded for this person only', () => {
		const parentEdges = [
			{ parentId: 'anna', childId: 'lio' },
			{ parentId: 'otto', childId: 'anna' },
			{ parentId: 'anna', childId: 'mia' }
		];
		expect(parentsOnRecord({ parentEdges }, 'lio')).toBe(1);
		expect(parentsOnRecord({ parentEdges }, 'otto')).toBe(0);
	});
});

describe('capState', () => {
	it('is open and in range with no cap', () => {
		expect(capState(null, 5)).toEqual({ full: false, excess: 0 });
	});

	it('is full once as many are picked as the type takes', () => {
		expect(capState(2, 1)).toEqual({ full: false, excess: 0 });
		expect(capState(2, 2)).toEqual({ full: true, excess: 0 });
	});

	it('counts the people over the cap, so none of them is dropped silently', () => {
		expect(capState(1, 3)).toEqual({ full: true, excess: 2 });
	});

	it('is full at once when the type takes nobody more', () => {
		expect(capState(0, 0)).toEqual({ full: true, excess: 0 });
	});
});

describe('chipRefusals', () => {
	const refusedFor = (ids: string[]) => (id: string) => (ids.includes(id) ? { reason: `no ${id}` } : null);

	it('names each picked person the household rules out, in the order they were picked', () => {
		expect(chipRefusals(['lio', 'otto', 'mia', 'tom'], refusedFor(['tom', 'otto']), [])).toEqual([
			{ targetId: 'otto', exclusion: { reason: 'no otto' } },
			{ targetId: 'tom', exclusion: { reason: 'no tom' } }
		]);
	});

	it('marks the people a refused save named', () => {
		expect(
			chipRefusals(['lio', 'otto'], refusedFor([]), [{ targetId: 'otto', reason: 'already Parent of Anna' }])
		).toEqual([{ targetId: 'otto', reason: 'already Parent of Anna' }]);
	});

	it('forgets a refusal once its person is no longer picked', () => {
		expect(chipRefusals(['lio'], refusedFor([]), [{ targetId: 'otto', reason: 'already Parent of Anna' }])).toEqual(
			[]
		);
	});

	it('prefers what the household rules out now over what an earlier save was told', () => {
		expect(chipRefusals(['otto'], refusedFor(['otto']), [{ targetId: 'otto', reason: 'stale' }])).toEqual([
			{ targetId: 'otto', exclusion: { reason: 'no otto' } }
		]);
	});

	it('is empty with nobody picked', () => {
		expect(chipRefusals([], refusedFor(['otto']), [])).toEqual([]);
	});
});

describe('exclusionForEveryone', () => {
	const refusedFor = (ids: string[]) => (id: string) => (ids.includes(id) ? { reason: id } : null);

	it('rules nothing out with nobody picked', () => {
		expect(exclusionForEveryone([], refusedFor(['otto']))).toBeNull();
	});

	it('greys an entry out for one person exactly as before', () => {
		expect(exclusionForEveryone(['otto'], refusedFor(['otto']))).toEqual({ reason: 'otto' });
	});

	it('leaves an entry pickable while anyone picked could take it', () => {
		expect(exclusionForEveryone(['otto', 'lio'], refusedFor(['otto']))).toBeNull();
	});

	it('greys an entry out, with the first reason, when it is refused for everyone picked', () => {
		expect(exclusionForEveryone(['otto', 'lio'], refusedFor(['otto', 'lio']))).toEqual({ reason: 'otto' });
	});
});

describe('sincePerPair', () => {
	const parentOfKin: KinChoice = { category: 'family', symmetric: false, side: 'forward' };
	const childOfKin: KinChoice = { category: 'family', symmetric: false, side: 'reverse' };
	const friendOf: KinChoice = { category: 'social', symmetric: true, side: 'forward' };
	const anna = { birthDate: '1984-02-11' };
	const lio = { id: 'lio', birthDate: '2015-04-12' };
	const mia = { id: 'mia', birthDate: '2018-09-03' };
	const tom = { id: 'tom', birthDate: null };

	it('dates each child from their own birthday', () => {
		expect(sincePerPair(parentOfKin, anna, [lio, mia, tom])).toEqual([
			{ targetId: 'lio', sinceDate: '2015-04-12' },
			{ targetId: 'mia', sinceDate: '2018-09-03' },
			{ targetId: 'tom', sinceDate: '' }
		]);
	});

	it('dates both parents from the one child', () => {
		const bert = { id: 'bert', birthDate: '1982-07-30' };
		const annaPicked = { id: 'anna', birthDate: '1984-02-11' };
		expect(sincePerPair(childOfKin, lio, [annaPicked, bert])).toEqual([
			{ targetId: 'anna', sinceDate: '2015-04-12' },
			{ targetId: 'bert', sinceDate: '2015-04-12' }
		]);
	});

	it('suggests nothing outside the family', () => {
		expect(sincePerPair(friendOf, anna, [lio])).toEqual([{ targetId: 'lio', sinceDate: '' }]);
	});

	it('suggests nothing while no type is chosen', () => {
		expect(sincePerPair(null, anna, [lio])).toEqual([{ targetId: 'lio', sinceDate: '' }]);
	});
});

describe('sharedSince', () => {
	it('is the one day every pair gets', () => {
		expect(
			sharedSince([
				{ targetId: 'anna', sinceDate: '2015-04-12' },
				{ targetId: 'bert', sinceDate: '2015-04-12' }
			])
		).toBe('2015-04-12');
	});

	it('is blank when no pair gets a day', () => {
		expect(sharedSince([{ targetId: 'a', sinceDate: '' }, { targetId: 'b', sinceDate: '' }])).toBe('');
	});

	it('is null when the days differ, so each pair keeps its own', () => {
		expect(
			sharedSince([
				{ targetId: 'lio', sinceDate: '2015-04-12' },
				{ targetId: 'tom', sinceDate: '' }
			])
		).toBeNull();
	});

	it('is blank with nobody picked', () => {
		expect(sharedSince([])).toBe('');
	});
});

describe('oneDateForAll', () => {
	it('starts from the first day any pair was given', () => {
		expect(
			oneDateForAll([
				{ targetId: 'tom', sinceDate: '' },
				{ targetId: 'mia', sinceDate: '2018-09-03' },
				{ targetId: 'lio', sinceDate: '2015-04-12' }
			])
		).toBe('2018-09-03');
	});

	it('is blank when no pair was given one', () => {
		expect(oneDateForAll([{ targetId: 'tom', sinceDate: '' }])).toBe('');
	});
});

/*
 * D4: with one parent picked for "Child of", the form offers the likely second parent under the
 * field — one tap, never preselected (docs/concepts/multi-pick-relationships.html).
 */
describe('secondParentOffer', () => {
	const facts = {
		parentEdges: [] as { parentId: string; childId: string }[],
		romanticPairs: [{ a: 'anna', b: 'bert' }]
	};
	const offer = (over: Partial<Parameters<typeof secondParentOffer>[0]> = {}) =>
		secondParentOffer({
			choice: childOf,
			pickedIds: ['anna'],
			child: { id: 'lio', birthDate: '2015-05-20' },
			facts,
			isRefused: () => false,
			canOffer: () => true,
			...over
		});

	it('offers the picked parent’s partner for "Child of"', () => {
		expect(offer()).toEqual({ parentId: 'anna', partnerId: 'bert' });
	});

	it('offers nobody for any other type or side', () => {
		expect(offer({ choice: parentOf })).toBeNull();
		expect(offer({ choice: { type: { key: 'sibling' }, side: 'forward' } })).toBeNull();
		expect(offer({ choice: null })).toBeNull();
	});

	it('waits for exactly one parent: nobody yet, or both already picked', () => {
		expect(offer({ pickedIds: [] })).toBeNull();
		expect(offer({ pickedIds: ['anna', 'carl'] })).toBeNull();
	});

	it('offers nobody while the picked parent is refused', () => {
		expect(offer({ isRefused: (id) => id === 'anna' })).toBeNull();
	});

	// Not someone the picker could take: out of sight, or ruled out by the exclusion rules.
	it('offers nobody the field could not take', () => {
		expect(offer({ canOffer: (id) => id !== 'bert' })).toBeNull();
	});

	it('leaves the step-parent check and the free slot to rule L3', () => {
		const later = { ...facts, romanticPairs: [{ a: 'anna', b: 'bert', sinceDate: '2019-01-01' }] };
		expect(offer({ facts: later })).toBeNull();
		const oneOnRecord = { ...facts, parentEdges: [{ parentId: 'carl', childId: 'lio' }] };
		expect(offer({ facts: oneOnRecord })).toBeNull();
	});
});
