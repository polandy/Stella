import { describe, expect, it } from 'bun:test';
import type { ApiContactField, ApiExistingPerson } from './document';
import type { KnownField } from './plan';
import { context, doc, NOW, planned, SOURCE } from './plan.fixture';

/*
 * Completing someone already in Stella (docs/02 §2.16.1): a class list names a child the
 * household has, with an address it lacks. The document may hand that person fields; the
 * planner adds what is missing and never touches what is there.
 */

const CARL = { id: 'c-carl', displayName: 'Carl Muster', birthDate: null };

const address = (value: string, label: string | null = null): ApiContactField => ({
	kind: 'address',
	value,
	label
});

const carl = (fields: ApiContactField[]): ApiExistingPerson => ({
	ref: 'carl',
	existingId: CARL.id,
	fields
});

/** The household, with Carl visible and holding `fields`. */
const withCarl = (fields: KnownField[] = []) =>
	context({ people: new Map([[CARL.id, CARL]]), fieldsOf: new Map([[CARL.id, fields]]) });

const known = (over: Partial<KnownField> & Pick<KnownField, 'id'>): KnownField => ({
	kind: 'address',
	value: 'Somewhere 1, 3000 Bern',
	sortOrder: 0,
	...over
});

describe('fields for someone already in Stella', () => {
	it('adds a field they lack, after the ones they have, under a stable id', () => {
		const plan = planned(
			doc({ people: [carl([address('Lentulusstrasse 23, 3007 Bern')])] }),
			withCarl([known({ id: 'f-phone', kind: 'phone', value: '+41 79', sortOrder: 3 })])
		);
		expect(plan.contacts).toEqual([]);
		expect(plan.fields).toEqual([
			{
				id: `api~${SOURCE}~p~carl~f~0`,
				contactId: CARL.id,
				kind: 'address',
				label: null,
				value: 'Lentulusstrasse 23, 3007 Bern',
				meta: null,
				sortOrder: 4,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
		expect(plan.report.people).toEqual([
			{ ref: 'carl', id: CARL.id, displayName: 'Carl Muster', status: 'existing', fieldsAdded: 1 }
		]);
		expect(plan.report.alreadyThere.fields).toBe(0);
	});

	it('leaves out a field they already have, ignoring case and spacing', () => {
		const plan = planned(
			doc({ people: [carl([address('lentulusstrasse  23, 3007 BERN')])] }),
			withCarl([known({ id: 'f-home', value: 'Lentulusstrasse 23, 3007 Bern' })])
		);
		expect(plan.fields).toEqual([]);
		expect(plan.report.people[0].fieldsAdded).toBe(0);
		expect(plan.report.alreadyThere.fields).toBe(1);
	});

	it('adds a second value of the same kind: a person can have two addresses', () => {
		const plan = planned(
			doc({ people: [carl([address('Lentulusstrasse 23, 3007 Bern')])] }),
			withCarl([known({ id: 'f-old', value: 'Holligenstrasse 94, 3008 Bern' })])
		);
		expect(plan.fields.map((f) => f.value)).toEqual(['Lentulusstrasse 23, 3007 Bern']);
	});

	it('does not count the same value twice within one entry', () => {
		const plan = planned(
			doc({ people: [carl([address('Werdtweg 5'), address('werdtweg 5')])] }),
			withCarl()
		);
		expect(plan.fields.map((f) => f.id)).toEqual([`api~${SOURCE}~p~carl~f~0`]);
		expect(plan.report.alreadyThere.fields).toBe(1);
	});

	it('changes nothing when the same document is sent again, even after the value was edited', () => {
		// The address this document added was corrected by hand since; it is still the one sent.
		const plan = planned(
			doc({ people: [carl([address('Werdtweg 5')])] }),
			withCarl([known({ id: `api~${SOURCE}~p~carl~f~0`, value: 'Werdtweg 5a' })])
		);
		expect(plan.fields).toEqual([]);
		expect(plan.report.alreadyThere.fields).toBe(1);
	});

	it('starts at the top when the person has no fields yet', () => {
		const plan = planned(doc({ people: [carl([address('Werdtweg 5')])] }), withCarl());
		expect(plan.fields[0].sortOrder).toBe(0);
	});
});
