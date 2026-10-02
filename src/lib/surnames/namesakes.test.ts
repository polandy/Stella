import { describe, expect, it } from 'bun:test';
import { namesakesAfterNaming } from './namesakes';

/*
 * *The household might already have them* (docs/concepts/surnames.md §5): after a last name is
 * given, someone who now shares first and last name with another person the viewer can see is
 * pointed at the merge. Nothing merges on its own.
 */

const p = (id: string, displayName: string, firstName: string | null, lastName: string | null) => ({
	id,
	displayName,
	firstName,
	lastName
});

describe('namesakesAfterNaming', () => {
	const people = [
		p('lea', 'Lea', 'Lea', null),
		p('lea2', 'Lea Brünner', 'Léa', 'Brünner'),
		p('max', 'Max', null, null),
		p('anna', 'Anna Brunner', 'Anna', 'Brunner')
	];

	it('names the person already carrying the same first and last name, ignoring case and accents', () => {
		expect(namesakesAfterNaming(people, ['lea', 'max'], 'Brunner')).toEqual([
			{ id: 'lea', name: 'Lea Brunner', otherId: 'lea2', otherName: 'Lea Brünner' }
		]);
	});

	it('reads the first word of the shown name for someone with no first name', () => {
		const imported = [p('imp', 'Anna', null, null), ...people];
		expect(namesakesAfterNaming(imported, ['imp'], 'Brunner')).toEqual([
			{ id: 'imp', name: 'Anna Brunner', otherId: 'anna', otherName: 'Anna Brunner' }
		]);
	});

	it('says nothing when nobody shares the new name', () => {
		expect(namesakesAfterNaming(people, ['max'], 'Brunner')).toEqual([]);
	});
});
