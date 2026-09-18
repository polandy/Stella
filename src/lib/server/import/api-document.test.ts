import { describe, expect, it } from 'bun:test';
import { readApiImportDocument } from './api-document';

/*
 * The import API's front door (docs/02 §2.16.1): an untrusted JSON body in, either a typed
 * document or every shape problem at its path. What the document *means* is the planner's
 * business; here it is only whether it is well-formed.
 */

const person = { ref: 'anna', firstName: 'Anna', lastName: 'Muster' };

function read(body: unknown) {
	const result = readApiImportDocument(body);
	if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.problems)}`);
	return result.document;
}

function problems(body: unknown) {
	const result = readApiImportDocument(body);
	if (result.ok) throw new Error('expected the body to be refused');
	return result.problems.map((p) => p.path);
}

describe('readApiImportDocument', () => {
	it('fills in everything a caller may leave out', () => {
		expect(read({ source: 'kg', people: [person] })).toEqual({
			source: 'kg',
			visibility: null,
			people: [
				{
					ref: 'anna',
					displayName: null,
					firstName: 'Anna',
					lastName: 'Muster',
					nickname: null,
					description: null,
					birthDate: null,
					fields: []
				}
			],
			relationships: [],
			circles: []
		});
	});

	it('reads a whole document', () => {
		const document = read({
			source: 'kindergarten-2023',
			visibility: 'private',
			people: [
				{
					...person,
					birthDate: '2019-06-23',
					fields: [{ kind: 'phone', value: '+41 79 000 00 00' }]
				},
				{ ref: 'carl', existingId: '01HX' }
			],
			relationships: [{ from: 'anna', to: 'carl', type: 'parent_child' }],
			circles: [
				{
					ref: 'kg',
					name: 'Kindergarten',
					kind: 'class',
					startDate: '2023-08-01',
					members: [{ person: 'carl', role: 'Child' }]
				},
				{ ref: 'old', existingId: '01HY', members: [] }
			]
		});
		expect(document.people[0]).toMatchObject({
			fields: [{ kind: 'phone', value: '+41 79 000 00 00', label: null }]
		});
		expect(document.people[1]).toEqual({ ref: 'carl', existingId: '01HX' });
		expect(document.circles[0]).toEqual({
			ref: 'kg',
			name: 'Kindergarten',
			kind: 'class',
			description: null,
			startDate: '2023-08-01',
			endDate: null,
			parent: null,
			members: [{ person: 'carl', role: 'Child', startDate: null, endDate: null }]
		});
		expect(document.circles[1]).toEqual({ ref: 'old', existingId: '01HY', members: [] });
	});

	it('refuses what is not a document at all', () => {
		expect(problems(null)).toEqual(['']);
		expect(problems([])).toEqual(['']);
	});

	it('names every malformed value at its path', () => {
		expect(
			problems({
				source: 'has spaces',
				people: [
					{ ref: 'anna', firstName: 'Anna', birthDate: '23.06.2019' },
					{ ref: 'bert' },
					{ ref: 'carl', firstName: 'Carl', fields: [{ kind: 'fax', value: '1' }] }
				],
				relationships: [{ from: 'anna', to: 'bert' }],
				circles: [
					{ ref: 'kg', name: 'KG', kind: 'kindergarten', startDate: '2023-02-30', members: [] }
				]
			})
		).toEqual([
			'source',
			'people[0].birthDate',
			'people[1]',
			'people[2].fields[0].kind',
			'relationships[0].type',
			'circles[0].kind',
			'circles[0].startDate'
		]);
	});

	it('refuses a field it does not know, so a misspelt one is not silently dropped', () => {
		expect(problems({ source: 'kg', people: [{ ...person, birthday: '2019-06-23' }] })).toEqual([
			'people[0].birthday'
		]);
	});

	it('refuses a person who is both new and already there', () => {
		expect(problems({ source: 'kg', people: [{ ...person, existingId: '01HX' }] })).toEqual([
			'people[0].firstName'
		]);
	});

	it('refuses a document larger than one import is meant to be', () => {
		const people = Array.from({ length: 5001 }, (_, i) => ({ ref: `p${i}`, firstName: 'P' }));
		expect(problems({ source: 'kg', people })).toEqual(['people']);
	});
});
