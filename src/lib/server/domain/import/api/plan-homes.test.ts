import { describe, expect, it } from 'bun:test';
import type { ApiContactField, ApiExistingPerson } from './document';
import type { KnownField, KnownHome } from './plan';
import { context, doc, idOf, ME, NOW, person, planned, refused, SOURCE } from './plan.fixture';

/*
 * Who lives together (docs/02 §2.16.1, *A shared home*): an entry says `home: { with: ref }`
 * instead of repeating an address, and moves in with that person — into the home they live
 * in, or into a home made of their one address, as *Also lives here …* does on a person page.
 */

const address = (value: string): ApiContactField => ({ kind: 'address', value, label: null });
const phone = (value: string): ApiContactField => ({ kind: 'phone', value, label: null });

const homeIdOf = (ref: string) => `api~${SOURCE}~h~${ref}`;
const resident = (homeId: string, contactId: string) => ({
	homeId,
	contactId,
	createdBy: ME,
	createdAt: NOW
});

const ANNA = { id: 'c-anna', displayName: 'Anna Brunner', birthDate: null };
const TIM = { id: 'c-tim', displayName: 'Tim Brunner', birthDate: null };

const existing = (
	ref: string,
	id: string,
	over: Partial<ApiExistingPerson> = {}
): ApiExistingPerson => ({ ref, existingId: id, fields: [], ...over });

const field = (over: Partial<KnownField> & Pick<KnownField, 'id'>): KnownField => ({
	kind: 'address',
	value: 'Lindenweg 4, 3000 Bern',
	label: null,
	meta: null,
	sortOrder: 0,
	...over
});

const LINDENWEG: KnownHome = { id: 'h-lindenweg', label: 'Home', value: 'Lindenweg 4, 3000 Bern' };

/** Anna (and Tim) visible, with what they hold. */
const household = (
	held: {
		fieldsOf?: [string, KnownField[]][];
		homesOf?: [string, KnownHome[]][];
	} = {}
) =>
	context({
		people: new Map([
			[ANNA.id, ANNA],
			[TIM.id, TIM]
		]),
		fieldsOf: new Map(held.fieldsOf ?? []),
		homesOf: new Map(held.homesOf ?? [])
	});

describe('moving in with someone the document names', () => {
	it('turns a new person’s one address into a home the others join, instead of a field', () => {
		const plan = planned(
			doc({
				people: [
					person('anna', { fields: [phone('+41 79'), address('Lindenweg 4, 3000 Bern')] }),
					person('tim', { home: { with: 'anna' } }),
					person('mia', { home: { with: 'anna' } })
				]
			})
		);
		expect(plan.homes).toEqual([
			{
				id: homeIdOf('anna'),
				householdId: 'household-1',
				label: null,
				value: 'Lindenweg 4, 3000 Bern',
				meta: null,
				createdBy: ME,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
		expect(plan.fields.map((f) => f.kind)).toEqual(['phone']);
		expect(plan.residents).toEqual([
			resident(homeIdOf('anna'), idOf('anna')),
			resident(homeIdOf('anna'), idOf('tim')),
			resident(homeIdOf('anna'), idOf('mia'))
		]);
	});

	it('may name someone listed later in the document', () => {
		const plan = planned(
			doc({
				people: [
					person('tim', { home: { with: 'anna' } }),
					person('anna', { fields: [address('Lindenweg 4')] })
				]
			})
		);
		expect(plan.residents.map((r) => r.contactId)).toEqual([idOf('anna'), idOf('tim')]);
	});

	it('joins the home an existing person already lives in', () => {
		const plan = planned(
			doc({ people: [existing('anna', ANNA.id), person('mia', { home: { with: 'anna' } })] }),
			household({ homesOf: [[ANNA.id, [LINDENWEG]]] })
		);
		expect(plan.homes).toEqual([]);
		expect(plan.residents).toEqual([resident(LINDENWEG.id, idOf('mia'))]);
	});

	it('makes a home of an existing person’s own address, which leaves their fields', () => {
		const plan = planned(
			doc({ people: [existing('anna', ANNA.id), person('mia', { home: { with: 'anna' } })] }),
			household({
				fieldsOf: [[ANNA.id, [field({ id: 'f-anna', label: 'Home', meta: '{"city":"Bern"}' })]]]
			})
		);
		expect(plan.homes).toEqual([
			expect.objectContaining({
				id: homeIdOf('anna'),
				label: 'Home',
				value: 'Lindenweg 4, 3000 Bern',
				meta: '{"city":"Bern"}'
			})
		]);
		expect(plan.droppedFields).toEqual([{ contactId: ANNA.id, fieldId: 'f-anna' }]);
		expect(plan.residents.map((r) => r.contactId)).toEqual([ANNA.id, idOf('mia')]);
	});

	it('makes a home of the address the document completes an existing person with', () => {
		const plan = planned(
			doc({
				people: [
					existing('anna', ANNA.id, { fields: [address('Lindenweg 4')] }),
					existing('tim', TIM.id, { home: { with: 'anna' } })
				]
			}),
			household()
		);
		expect(plan.fields).toEqual([]);
		expect(plan.homes.map((h) => h.value)).toEqual(['Lindenweg 4']);
		expect(plan.residents.map((r) => r.contactId)).toEqual([ANNA.id, TIM.id]);
	});

	it('lets the same line someone moving in has as their own give way, as on the person page', () => {
		const plan = planned(
			doc({
				people: [
					existing('anna', ANNA.id),
					existing('tim', TIM.id, { home: { with: 'anna' } }),
					person('mia', { home: { with: 'anna' }, fields: [address('lindenweg 4 3000 BERN')] })
				]
			}),
			household({
				homesOf: [[ANNA.id, [LINDENWEG]]],
				fieldsOf: [
					[
						TIM.id,
						[
							field({ id: 'f-tim-same', value: 'Lindenweg 4 · 3000 Bern' }),
							field({ id: 'f-tim-work', value: 'Bahnhofplatz 1, 3011 Bern', sortOrder: 1 })
						]
					]
				]
			})
		);
		// A different address stays theirs: the API cannot tell whether it is a second home.
		expect(plan.droppedFields).toEqual([{ contactId: TIM.id, fieldId: 'f-tim-same' }]);
		expect(plan.fields).toEqual([]);
		expect(plan.report.people.find((p) => p.ref === 'mia')?.fieldsAdded).toBe(0);
		expect(plan.report.alreadyThere.fields).toBe(1);
	});

	it('changes nothing when sent again', () => {
		const plan = planned(
			doc({
				people: [existing('anna', ANNA.id), existing('tim', TIM.id, { home: { with: 'anna' } })]
			}),
			household({
				homesOf: [
					[ANNA.id, [LINDENWEG]],
					[TIM.id, [LINDENWEG]]
				]
			})
		);
		expect(plan.homes).toEqual([]);
		expect(plan.residents).toEqual([]);
		expect(plan.report.alreadyThere.residents).toBe(1);
	});

	it('changes nothing for people the document created before', () => {
		// The second sending: Anna's address is a home by now, and Tim lives in it.
		const sentBefore = (ref: string) => ({ id: idOf(ref), displayName: ref, birthDate: null });
		const home = { id: homeIdOf('anna'), label: null, value: 'Lindenweg 4' };
		const plan = planned(
			doc({
				people: [
					person('anna', { fields: [address('Lindenweg 4')] }),
					person('tim', { home: { with: 'anna' } })
				]
			}),
			context({
				people: new Map([
					[idOf('anna'), sentBefore('anna')],
					[idOf('tim'), sentBefore('tim')]
				]),
				homesOf: new Map([
					[idOf('anna'), [home]],
					[idOf('tim'), [home]]
				])
			})
		);
		expect(plan.homes).toEqual([]);
		expect(plan.residents).toEqual([]);
		expect(plan.report.alreadyThere.residents).toBe(1);
	});
});

describe('a home the planner cannot settle', () => {
	it('refuses a ref the document does not have', () => {
		expect(refused(doc({ people: [person('tim', { home: { with: 'anna' } })] }))).toEqual([
			{ code: 'unknownRef', path: 'people[0].home.with', ref: 'anna' }
		]);
	});

	it('refuses living with oneself', () => {
		expect(refused(doc({ people: [person('tim', { home: { with: 'tim' } })] }))).toEqual([
			{ code: 'homeSelf', path: 'people[0].home.with', ref: 'tim' }
		]);
	});

	it('refuses naming someone who lives with somebody else in turn: one holds the address', () => {
		const problems = refused(
			doc({
				people: [
					person('anna', { fields: [address('Lindenweg 4')] }),
					person('tim', { home: { with: 'anna' } }),
					person('mia', { home: { with: 'tim' } })
				]
			})
		);
		expect(problems).toEqual([{ code: 'homeChain', path: 'people[2].home.with', ref: 'tim' }]);
	});

	it('refuses someone with no address to share', () => {
		const problems = refused(
			doc({ people: [person('anna'), person('tim', { home: { with: 'anna' } })] })
		);
		expect(problems).toEqual([{ code: 'homeNoAddress', path: 'people[1].home.with', ref: 'anna' }]);
	});

	it('refuses someone with more than one address: the API cannot tell which is meant', () => {
		const twoAddresses = refused(
			doc({
				people: [
					person('anna', { fields: [address('Lindenweg 4'), address('Bahnhofplatz 1')] }),
					person('tim', { home: { with: 'anna' } })
				]
			})
		);
		const twoHomes = refused(
			doc({ people: [existing('anna', ANNA.id), person('tim', { home: { with: 'anna' } })] }),
			household({
				homesOf: [[ANNA.id, [LINDENWEG, { id: 'h-2', label: null, value: 'Seeweg 2' }]]]
			})
		);
		const expected = [{ code: 'homeAmbiguous' as const, path: 'people[1].home.with', ref: 'anna' }];
		expect(twoAddresses).toEqual(expected);
		expect(twoHomes).toEqual(expected);
	});
});
