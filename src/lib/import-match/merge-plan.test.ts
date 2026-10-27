import { describe, expect, it } from 'bun:test';
import { mergePlan } from './merge-plan';
import type { IncomingCard, StellaPerson } from './card';

/*
 * What *Same person* writes (docs/02 §2.16.2): only what the person is
 * missing, never a change without asking — a differing birthday or name is a conflict, a
 * differing company, job or nickname stays out and is said to.
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

const person = (over: Partial<StellaPerson> = {}): StellaPerson => ({
	id: 'p1',
	firstName: 'Anna',
	lastName: 'Example',
	displayName: 'Anna Example',
	nickname: null,
	company: null,
	jobTitle: null,
	birthday: null,
	hasPhoto: false,
	fields: [],
	homeLines: [],
	tags: [],
	...over
});

describe('mergePlan', () => {
	it('adds the emails, phones and websites the person does not have, labels and all', () => {
		const plan = mergePlan(
			card({
				emails: [
					{ value: 'Anna.Example@example.org', label: { known: 'home' } },
					{ value: 'anni@example.net', label: { typed: 'Old school' } }
				],
				phones: [
					{ value: '079 000 00 01', label: { known: 'mobile' } },
					{ value: '+41 31 000 00 02', label: { known: 'home' } }
				],
				urls: [{ value: 'https://Example.org/anna', label: null }]
			}),
			person({
				fields: [
					{ kind: 'email', value: 'anna.example@example.org' },
					{ kind: 'phone', value: '+41 79 000 00 01' },
					{ kind: 'url', value: 'https://example.org/anna' }
				]
			})
		);

		expect(plan.add).toEqual([
			{ kind: 'email', value: 'anni@example.net', label: { typed: 'Old school' } },
			{ kind: 'phone', value: '+41 31 000 00 02', label: { known: 'home' } }
		]);
		expect(plan.conflicts).toEqual([]);
	});

	it('counts the line of a home they live in as their address', () => {
		const plan = mergePlan(
			card({
				addresses: [
					{ value: 'Examplestrasse 1, 3007 Bern, Switzerland', label: { known: 'home' } },
					{ value: 'Musterweg 9, 3600 Thun', label: null }
				]
			}),
			person({ homeLines: ['examplestrasse 1 3007 bern switzerland'] })
		);

		expect(plan.add).toEqual([{ kind: 'address', value: 'Musterweg 9, 3600 Thun', label: null }]);
	});

	it('adds a card field once even when the card repeats it', () => {
		const plan = mergePlan(
			card({
				emails: [
					{ value: 'a@example.org', label: null },
					{ value: 'A@example.org', label: null }
				]
			}),
			person()
		);

		expect(plan.add).toEqual([{ kind: 'email', value: 'a@example.org', label: null }]);
	});

	it('fills an empty nickname, company, job, last name and birthday', () => {
		const plan = mergePlan(
			card({
				nickname: 'Anni',
				company: 'Example AG',
				jobTitle: 'Engineer',
				birthday: { value: '--04-07', precision: 'month_day' }
			}),
			person({ lastName: null, displayName: 'Anna' })
		);

		expect(plan.add).toEqual([
			{ kind: 'lastName', value: 'Example' },
			{ kind: 'nickname', value: 'Anni' },
			{ kind: 'company', value: 'Example AG' },
			{ kind: 'jobTitle', value: 'Engineer' },
			{ kind: 'birthday', date: { value: '--04-07', precision: 'month_day' } }
		]);
	});

	it('keeps a differing company, job or nickname out and says so', () => {
		const plan = mergePlan(
			card({ nickname: 'Anni', company: 'Other GmbH', jobTitle: 'Example AG' }),
			person({ nickname: 'Annie', company: 'Example AG', jobTitle: 'example ag' })
		);

		expect(plan.add).toEqual([]);
		expect(plan.kept).toEqual([
			{ kind: 'nickname', value: 'Anni' },
			{ kind: 'company', value: 'Other GmbH' }
		]);
	});

	it('asks about a differing birthday', () => {
		const plan = mergePlan(
			card({ birthday: { value: '--04-07', precision: 'month_day' } }),
			person({ birthday: { value: '1986-04-17', precision: 'full' } })
		);

		expect(plan.conflicts).toEqual([
			{
				kind: 'birthday',
				stella: { value: '1986-04-17', precision: 'full' },
				card: { value: '--04-07', precision: 'month_day' }
			}
		]);
	});

	it('does not ask when Stella already knows the same day with its year', () => {
		const plan = mergePlan(
			card({ birthday: { value: '--04-17', precision: 'month_day' } }),
			person({ birthday: { value: '1986-04-17', precision: 'full' } })
		);

		expect(plan.conflicts).toEqual([]);
		expect(plan.add).toEqual([]);
	});

	it('asks when the card would give a year Stella does not have', () => {
		const plan = mergePlan(
			card({ birthday: { value: '1986-04-17', precision: 'full' } }),
			person({ birthday: { value: '--04-17', precision: 'month_day' } })
		);

		expect(plan.conflicts.map((c) => c.kind)).toEqual(['birthday']);
	});

	it('asks about a differing first or last name, but not about case or accents', () => {
		const plan = mergePlan(
			card({ firstName: 'Zoe', lastName: 'Muster', displayName: 'Zoe Muster' }),
			person({ firstName: 'Zoë', lastName: 'Muster-Keller', displayName: 'Zoë Muster-Keller' })
		);

		expect(plan.conflicts).toEqual([{ kind: 'lastName', stella: 'Muster-Keller', card: 'Muster' }]);
	});

	it('adds the picture only when it is on the card and the person has none', () => {
		expect(mergePlan(card({ photo: 'inline' }), person()).add).toEqual([{ kind: 'photo' }]);
		expect(mergePlan(card({ photo: 'inline' }), person({ hasPhoto: true })).add).toEqual([]);
		expect(mergePlan(card({ photo: 'link' }), person()).add).toEqual([]);
	});

	it('adds the tags the person does not carry yet, whatever the case', () => {
		const plan = mergePlan(
			card({ tags: ['family', 'Kindergarten 2023'] }),
			person({ tags: ['Family'] })
		);

		expect(plan.add).toEqual([{ kind: 'tag', name: 'Kindergarten 2023' }]);
	});

	it('has nothing to add for a card Stella already holds in full', () => {
		expect(mergePlan(card(), person())).toEqual({ add: [], conflicts: [], kept: [] });
	});
});
