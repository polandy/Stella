import { describe, expect, it } from 'bun:test';
import {
	homeOffers,
	journalCount,
	subjectsAdded,
	subjectsUnfit,
	type OfferPerson
} from './composer-subjects';

/*
 * The people a moment is about, as the composer offers them (docs/02 §2.20.3): the anchor's
 * homes, offered never preselected; a private person only in a private moment.
 */

const person = (id: string, visibility: 'shared' | 'private' = 'shared'): OfferPerson => ({
	id,
	displayName: `${id} Brunner`,
	firstName: id,
	visibility
});
const people = [
	person('markus'),
	person('sandra'),
	person('lea'),
	person('tim'),
	person('jonas', 'private'),
	person('oma')
];
const brunners = { id: 'home-1', memberIds: ['markus', 'sandra', 'lea', 'tim', 'jonas'] };
const weekend = { id: 'home-2', memberIds: ['markus', 'oma'] };
const ids = (list: readonly OfferPerson[]) => list.map((p) => p.id);

describe('homeOffers', () => {
	it('offers the anchor’s housemates the moment’s audience may name', () => {
		const [offer] = homeOffers('markus', [], 'shared', [brunners], people);
		expect(offer.homeId).toBe('home-1');
		expect(ids(offer.take)).toEqual(['sandra', 'lea', 'tim']);
		expect(ids(offer.privateOnly)).toEqual(['jonas']);
	});

	it('offers a private housemate in a private moment', () => {
		const [offer] = homeOffers('markus', [], 'private', [brunners], people);
		expect(ids(offer.take)).toEqual(['sandra', 'lea', 'tim', 'jonas']);
		expect(offer.privateOnly).toEqual([]);
	});

	it('makes one offer per home', () => {
		const offers = homeOffers('markus', [], 'shared', [brunners, weekend], people);
		expect(offers.map((o) => o.homeId)).toEqual(['home-1', 'home-2']);
	});

	it('leaves out who is already in the moment, and a home with nobody left to add', () => {
		const offers = homeOffers(
			'markus',
			['sandra', 'lea', 'tim', 'oma'],
			'shared',
			[brunners, weekend],
			people
		);
		expect(offers).toEqual([]);
		const [offer] = homeOffers('markus', ['sandra'], 'shared', [brunners], people);
		expect(ids(offer.take)).toEqual(['lea', 'tim']);
	});

	it('offers nothing without an anchor or for a home they do not live in', () => {
		expect(homeOffers(null, [], 'shared', [brunners], people)).toEqual([]);
		expect(homeOffers('oma', [], 'shared', [brunners], people)).toEqual([]);
	});

	it('leaves out a housemate the author cannot see', () => {
		const [offer] = homeOffers(
			'markus',
			[],
			'shared',
			[brunners],
			people.filter((p) => p.id !== 'tim')
		);
		expect(ids(offer.take)).toEqual(['sandra', 'lea']);
	});
});

describe('subjectsAdded', () => {
	it('adds each person once, never the anchor', () => {
		expect(subjectsAdded(['sandra'], ['sandra', 'lea', 'markus'], 'markus')).toEqual([
			'sandra',
			'lea'
		]);
	});
});

describe('subjectsUnfit', () => {
	it('names the chips a shared moment may not be about', () => {
		expect(ids(subjectsUnfit(['sandra', 'jonas'], 'shared', people))).toEqual(['jonas']);
		expect(subjectsUnfit(['sandra', 'jonas'], 'private', people)).toEqual([]);
	});
});

describe('journalCount', () => {
	it('counts the anchor and every other subject once', () => {
		expect(journalCount('markus', ['sandra', 'lea', 'markus'])).toBe(3);
		expect(journalCount(null, ['sandra'])).toBe(1);
		expect(journalCount('markus', [])).toBe(1);
	});
});
