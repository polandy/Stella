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

	it('does not guess a first name from a multi-word shown name with no parts', () => {
		// The write itself (withNameParts) only takes the first word of the shown name as the
		// first name when it is a single word — a chosen name like "Opa Hans" keeps no first
		// name, so this must not invent "Opa" and claim a namesake that will not exist.
		const opaHans = p('opa', 'Opa Hans', null, null);
		const opaBrunner = p('other', 'Opa Brunner', 'Opa', 'Brunner');
		expect(namesakesAfterNaming([opaHans, opaBrunner], ['opa'], 'Brunner')).toEqual([]);
	});

	it('never matches two people who both end up with no first name', () => {
		// Both keep a blank first name after the write (§6); an empty string is not a shared
		// first name, so two such people given the same last name are not a namesake pair.
		const opaHans = p('opa', 'Opa Hans', null, null);
		const tanteGabi = p('tante', 'Tante Gabi', null, null);
		expect(namesakesAfterNaming([opaHans, tanteGabi], ['opa'], 'Brunner')).toEqual([]);
	});

	it('never matches on a blank first name against someone already carrying the surname', () => {
		const opaHans = p('opa', 'Opa Hans', null, null);
		const onkelFritz = p('onkel', 'Onkel Fritz', null, 'Brunner');
		expect(namesakesAfterNaming([opaHans, onkelFritz], ['opa'], 'Brunner')).toEqual([]);
	});
});
