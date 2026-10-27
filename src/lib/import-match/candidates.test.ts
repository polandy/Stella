import { describe, expect, it } from 'bun:test';
import { matchCard } from './candidates';
import type { IncomingCard, MatchablePerson } from './card';

/*
 * Who a card may be (docs/concepts/contact-sources.md §1.2): a shared email or phone is strong,
 * a shared name alone is weak, more than one person is the member's pick, and nobody is new.
 * The people handed in are already the ones the member may see and browse.
 */

const card = (over: Partial<IncomingCard> = {}): IncomingCard => ({
	key: 'k',
	hash: 'h',
	firstName: 'Anna',
	lastName: 'Example',
	displayName: 'Anna Example',
	nickname: null,
	company: null,
	jobTitle: null,
	birthday: null,
	emails: [],
	phones: [],
	addresses: [],
	urls: [],
	tags: [],
	photo: null,
	...over
});

const person = (
	id: string,
	name: [string, string],
	fields: MatchablePerson['fields'] = []
): MatchablePerson => ({
	id,
	firstName: name[0],
	lastName: name[1],
	displayName: name.join(' '),
	fields
});

describe('matchCard', () => {
	it('is strong when one person shares an email, whatever the case', () => {
		const match = matchCard(
			card({ emails: [{ value: 'Anna.Example@example.org', label: null }] }),
			[
				person('p1', ['Anna', 'Muster'], [{ kind: 'email', value: 'anna.example@example.org' }]),
				person('p2', ['Bruno', 'Beispiel'])
			]
		);

		expect(match).toEqual({
			kind: 'strong',
			candidate: {
				personId: 'p1',
				strength: 'strong',
				reasons: [{ kind: 'email', value: 'anna.example@example.org' }]
			}
		});
	});

	it('is strong when one person shares a phone written another way', () => {
		const match = matchCard(
			card({
				firstName: 'Carla',
				lastName: 'Muster',
				displayName: 'Carla Muster',
				phones: [{ value: '0041 79 000 00 05', label: null }]
			}),
			[person('p1', ['Carla', 'Muster-Keller'], [{ kind: 'phone', value: '+41 79 000 00 05' }])]
		);

		expect(match.kind).toBe('strong');
	});

	it('is only weak when the phone agrees without a country on one side', () => {
		const match = matchCard(
			card({
				firstName: 'Bruno',
				lastName: 'Beispiel',
				displayName: 'Bruno Beispiel',
				phones: [{ value: '+41 79 000 00 04', label: null }]
			}),
			[person('p1', ['Bruno', 'B.'], [{ kind: 'phone', value: '079 000 00 04' }])]
		);

		expect(match).toEqual({
			kind: 'weak',
			candidate: {
				personId: 'p1',
				strength: 'weak',
				reasons: [{ kind: 'phoneAlike', value: '079 000 00 04' }]
			}
		});
	});

	it('is weak when only the name agrees, folded', () => {
		const match = matchCard(
			card({ firstName: 'Zoë', lastName: 'Müller', displayName: 'Zoë Müller' }),
			[person('p1', ['Muller', 'Zoe'])]
		);

		expect(match).toEqual({
			kind: 'weak',
			candidate: { personId: 'p1', strength: 'weak', reasons: [{ kind: 'name' }] }
		});
	});

	it('leaves the pick to the member when more than one person is reached', () => {
		const match = matchCard(
			card({ emails: [{ value: 'anna.example@example.org', label: null }] }),
			[
				person('p1', ['Anna', 'Example']),
				person('p2', ['Anna', 'Other'], [{ kind: 'email', value: 'anna.example@example.org' }])
			]
		);

		expect(match.kind).toBe('several');
		if (match.kind !== 'several') return;
		// The strong one first, so the member reads it first.
		expect(match.candidates.map((c) => [c.personId, c.strength])).toEqual([
			['p2', 'strong'],
			['p1', 'weak']
		]);
	});

	it('is several when two people share the one email', () => {
		const shared = [{ kind: 'email' as const, value: 'family@example.org' }];
		const match = matchCard(
			card({
				firstName: 'Eva',
				lastName: 'Brunner',
				displayName: 'Eva Brunner',
				emails: [{ value: 'family@example.org', label: null }]
			}),
			[person('p1', ['Hans', 'Brunner'], shared), person('p2', ['Rita', 'Brunner'], shared)]
		);

		expect(match.kind).toBe('several');
	});

	it('names each reason once per person', () => {
		const match = matchCard(
			card({
				emails: [
					{ value: 'a@example.org', label: null },
					{ value: 'A@example.org', label: null }
				]
			}),
			[person('p1', ['Anna', 'Example'], [{ kind: 'email', value: 'a@example.org' }])]
		);

		expect(match.kind === 'strong' && match.candidate.reasons).toEqual([
			{ kind: 'email', value: 'a@example.org' },
			{ kind: 'name' }
		]);
	});

	it('is none when nobody agrees on anything', () => {
		expect(
			matchCard(card({ firstName: 'Felix', lastName: 'Neu', displayName: 'Felix Neu' }), [
				person('p1', ['Anna', 'Example'])
			])
		).toEqual({ kind: 'none' });
	});

	it('never matches on a blank name', () => {
		expect(
			matchCard(card({ firstName: null, lastName: null, displayName: ' ' }), [
				{ id: 'p1', firstName: null, lastName: null, displayName: ' ', fields: [] }
			])
		).toEqual({ kind: 'none' });
	});
});
