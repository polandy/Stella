import { describe, expect, it } from 'bun:test';
import { similarPeople, MAX_SIMILAR } from './similar-names';

const contact = (
	id: string,
	firstName: string | null,
	lastName: string | null,
	nickname: string | null = null,
	displayName = [firstName, lastName].filter(Boolean).join(' ')
) => ({ id, displayName, firstName, lastName, nickname });

const manfred = contact('c-manfred', 'Manfred', 'Pollari');
const jonas = contact('c-jonas', 'Jonas', 'Bauer');
const lenaKB = contact('c-lena-kb', 'Lena', 'Köhler-Brandt');
const lenaM = contact('c-lena-m', 'Lena', 'Müller');
const maxWeber = contact('c-max', 'Max', 'Weber');
const gerda = contact('c-gerda', 'Gerda', 'Pollari', 'Oma', 'Oma Gerda');
const fritz = contact('c-fritz', 'Fritz', 'Huber', 'Opa');

const ids = (immichName: string, people = [manfred, jonas, lenaKB, lenaM, maxWeber, gerda, fritz]) =>
	similarPeople(immichName, people);

describe('similarPeople', () => {
	it('finds someone whose first name the Immich name carries, past a kin word', () => {
		expect(ids('Opa Manfred')).toEqual(['c-manfred']);
	});

	it('finds someone whose first name matches when Immich has only an initial for the rest', () => {
		expect(ids('Jonas B.')).toEqual(['c-jonas']);
	});

	it('finds half of a double last name, and ranks the closer name first', () => {
		expect(ids('Lena Köhler')).toEqual(['c-lena-kb', 'c-lena-m']);
	});

	it('finds a person by their first name when Stella shows them by a nickname', () => {
		expect(ids('Gerda Pollari')).toEqual(['c-gerda']);
	});

	it('does not count a shared last name alone: a brother is not the same person', () => {
		expect(ids('Tom Weber')).toEqual([]);
	});

	it('never matches on the kin word itself', () => {
		expect(ids('Opa Heinz')).toEqual([]);
	});

	it('folds case, accents and the German transliteration', () => {
		expect(ids('JUERGEN', [contact('c-j', 'Jürgen', 'Abt')])).toEqual(['c-j']);
	});

	it('reads the shown name of someone who has no first name', () => {
		expect(ids('Sandra Keller', [contact('c-s', null, null, null, 'Sandra')])).toEqual(['c-s']);
	});

	it('finds nobody for a name nobody in Stella shares', () => {
		expect(ids('Sandra')).toEqual([]);
	});

	it('offers a handful at most, the closest first, in a fixed order', () => {
		const thomases = Array.from({ length: MAX_SIMILAR + 2 }, (_, at) => contact(`c-${at}`, 'Thomas', `Name${at}`));
		const exact = contact('c-exact', 'Thomas', 'Widmer');
		const found = ids('Thomas Widmer', [...thomases, exact]);
		expect(found).toHaveLength(MAX_SIMILAR);
		expect(found[0]).toBe('c-exact');
		expect(found.slice(1)).toEqual(['c-0', 'c-1', 'c-2', 'c-3']);
	});
});
