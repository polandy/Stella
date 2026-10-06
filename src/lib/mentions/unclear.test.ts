import { describe, expect, it } from 'bun:test';
import type { PersonContext } from '../people/context';
import { unclearHandles } from './unclear';

/*
 * While a text is written, a typed `@Thomas` several people answer to is asked about there and
 * then (docs/02 §2.2.3), naming each Thomas with the line the pickers show — the same question
 * the server would refuse the text with.
 */

const audience = [
	{ id: 'thomas-hut', displayName: 'Thomas', firstName: 'Thomas', description: 'Mountain guide' },
	{ id: 'thomas-bare', displayName: 'Thomas', firstName: 'Thomas' },
	{ id: 'thomas-lone', displayName: 'Thomas', firstName: 'Thomas' },
	{ id: 'sandra', displayName: 'Sandra Brunner', firstName: 'Sandra', lastName: 'Brunner' }
];

const contexts = new Map<string, PersonContext>([
	['thomas-bare', { ties: [], circle: { name: 'Turnverein', role: 'Coach' } }]
]);

describe('unclearHandles', () => {
	it('asks about a typed handle several people answer to, naming each with their line', () => {
		expect(unclearHandles('with @Thomas and @SandraBrunner', audience, contexts)).toEqual([
			{
				handle: 'Thomas',
				people: [
					{ person: audience[0], line: { kind: 'description', text: 'Mountain guide' } },
					{ person: audience[1], line: { kind: 'circle', name: 'Turnverein', role: 'Coach' } },
					{ person: audience[2], line: { kind: 'nothing' } }
				]
			}
		]);
	});

	it('asks nothing about a picked namesake, a unique name or a name nobody has', () => {
		expect(
			unclearHandles('with @{contact:thomas-hut}, @SandraBrunner and @Nobody', audience, contexts)
		).toEqual([]);
	});

	it('asks nothing once only one of them is someone the text may name', () => {
		expect(unclearHandles('with @Thomas', [audience[0], audience[3]], contexts)).toEqual([]);
	});
});
