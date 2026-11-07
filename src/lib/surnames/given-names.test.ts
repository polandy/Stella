import { describe, expect, it } from 'bun:test';
import type { StoredName } from '../people/display-name';
import { give, namesGiven, release, withGivenNames, type Given } from './given-names';

/*
 * A last name held for its undo window is already the person's name on screen (docs/02
 * §2.2.4.4): every list and search reads it at once, not only once the batch is sent and the
 * page has reloaded.
 */

const none: Given = {};

type Person = StoredName & { id: string };

const lea: Person = {
	id: 'lea',
	displayName: 'Lea',
	firstName: 'Lea',
	lastName: null,
	nickname: null
};
const tom: Person = {
	id: 'tom',
	displayName: 'Thomas „Tom“ Keller',
	firstName: 'Thomas',
	lastName: 'Keller',
	nickname: 'Tom'
};
const opa: Person = {
	id: 'opa',
	displayName: 'Opa Kurt',
	firstName: 'Kurt',
	lastName: null,
	nickname: null
};

describe('namesGiven', () => {
	it('gives each person of a held batch its name, a later batch winning', () => {
		let given = give(none, 'b1', ['lea', 'tom'], 'Brunner');
		given = give(given, 'b2', ['tom'], 'Widmer');
		expect(namesGiven(given)).toEqual(
			new Map([
				['lea', 'Brunner'],
				['tom', 'Widmer']
			])
		);
	});

	it('forgets a released batch — taken back, failed, or reloaded', () => {
		const given = release(give(none, 'b1', ['lea'], 'Brunner'), 'b1');
		expect(namesGiven(given).size).toBe(0);
		expect(release(given, 'unknown')).toBe(given);
	});
});

describe('withGivenNames', () => {
	it('shows the given name in the parts and the shown name, as the server will write it', () => {
		const names = namesGiven(give(none, 'b1', ['lea', 'tom'], 'Brunner'));
		const [shownLea, shownTom, shownOpa] = withGivenNames([lea, tom, opa], names, 'de');
		expect(shownLea).toEqual({ ...lea, lastName: 'Brunner', displayName: 'Lea Brunner' });
		expect(shownTom).toEqual({
			...tom,
			lastName: 'Brunner',
			displayName: 'Thomas „Tom“ Brunner'
		});
		expect(shownOpa).toBe(opa);
	});

	it('keeps a name a member chose, as the server does', () => {
		const names = namesGiven(give(none, 'b1', ['opa'], 'Brunner'));
		expect(withGivenNames([opa], names, 'de')[0]).toEqual({
			...opa,
			lastName: 'Brunner',
			displayName: 'Opa Kurt'
		});
	});

	it('hands back the very list when nothing is held, so a reload is still told apart', () => {
		const people = [lea, tom];
		expect(withGivenNames(people, namesGiven(none), 'de')).toBe(people);
	});
});
