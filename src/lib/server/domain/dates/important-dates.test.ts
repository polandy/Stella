import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import {
	addImportantDate,
	InvalidImportantDateError,
	overridesDerivedBirthday,
	removeImportantDate,
	type ImportantDateRepository,
	type NewImportantDate
} from './important-dates';

/*
 * Important dates (docs/02 §2.13). The use-cases are thin orchestration, so the tests cover
 * what they actually decide: normalisation, the defaults, and every way an input is refused.
 */

const NOW = 1_700_000_000_000;
const clock: Clock = { now: () => NOW };
const ids: IdGenerator = { next: () => 'date-1' };

function fakeRepo() {
	let inserted: NewImportantDate | null = null;
	const removed: { contactId: string; dateId: string }[] = [];
	const repo: ImportantDateRepository = {
		insert: async (d) => {
			inserted = d;
		},
		listForContactVisibleTo: async () => [],
		remove: async (contactId, dateId) => {
			removed.push({ contactId, dateId });
		},
		listSourcesVisibleTo: async () => []
	};
	return {
		repo,
		removed,
		get inserted() {
			return inserted;
		}
	};
}

const deps = (repo: ImportantDateRepository) => ({ dates: repo, ids, clock });

describe('addImportantDate', () => {
	it('stores an anniversary, recurring and reminding by default', async () => {
		const f = fakeRepo();
		const id = await addImportantDate(deps(f.repo), {
			contactId: 'c1',
			kind: 'anniversary',
			date: '2009-06-13'
		});
		expect(id).toBe('date-1');
		expect(f.inserted).toMatchObject({
			id: 'date-1',
			contactId: 'c1',
			kind: 'anniversary',
			label: null,
			date: '2009-06-13',
			recursYearly: true,
			remind: true,
			createdAt: NOW,
			updatedAt: NOW
		});
	});

	it('accepts a date whose year is unknown', async () => {
		const f = fakeRepo();
		await addImportantDate(deps(f.repo), { contactId: 'c1', kind: 'birthday', date: '--05-20' });
		expect(f.inserted?.date).toBe('--05-20');
	});

	it('trims the label of a custom date', async () => {
		const f = fakeRepo();
		await addImportantDate(deps(f.repo), {
			contactId: 'c1',
			kind: 'custom',
			label: '  Umzug  ',
			date: '2026-04-01'
		});
		expect(f.inserted?.label).toBe('Umzug');
	});

	it('keeps a muted, one-off date as asked', async () => {
		const f = fakeRepo();
		await addImportantDate(deps(f.repo), {
			contactId: 'c1',
			kind: 'custom',
			label: 'Umzug',
			date: '2026-04-01',
			recursYearly: false,
			remind: false
		});
		expect(f.inserted).toMatchObject({ recursYearly: false, remind: false });
	});

	it('refuses a custom date without a name, storing nothing', async () => {
		const f = fakeRepo();
		await expect(
			addImportantDate(deps(f.repo), { contactId: 'c1', kind: 'custom', date: '2026-04-01' })
		).rejects.toBeInstanceOf(InvalidImportantDateError);
		expect(f.inserted).toBeNull();
	});

	it('refuses a malformed date, storing nothing', async () => {
		const f = fakeRepo();
		for (const date of ['13.06.2009', '2009-6-3', 'tomorrow', '', '--0520']) {
			await expect(
				addImportantDate(deps(f.repo), { contactId: 'c1', kind: 'anniversary', date })
			).rejects.toBeInstanceOf(InvalidImportantDateError);
		}
		expect(f.inserted).toBeNull();
	});

	it('refuses an unknown kind, storing nothing', async () => {
		const f = fakeRepo();
		await expect(
			addImportantDate(deps(f.repo), {
				contactId: 'c1',
				kind: 'wedding' as never,
				date: '2009-06-13'
			})
		).rejects.toBeInstanceOf(InvalidImportantDateError);
		expect(f.inserted).toBeNull();
	});
});

describe('removeImportantDate', () => {
	it('scopes the delete to the contact it belongs to', async () => {
		const f = fakeRepo();
		await removeImportantDate(deps(f.repo), 'c1', 'date-1');
		expect(f.removed).toEqual([{ contactId: 'c1', dateId: 'date-1' }]);
	});
});

describe('calendar validity', () => {
	it('refuses a day that does not exist, storing nothing', async () => {
		const f = fakeRepo();
		for (const date of ['--02-30', '--99-99', '2026-13-01', '2026-04-31', '2026-02-30']) {
			await expect(
				addImportantDate(deps(f.repo), { contactId: 'c1', kind: 'anniversary', date })
			).rejects.toBeInstanceOf(InvalidImportantDateError);
		}
		expect(f.inserted).toBeNull();
	});

	it('keeps 29 February, which a year-less date must still allow', async () => {
		const f = fakeRepo();
		await addImportantDate(deps(f.repo), { contactId: 'c1', kind: 'anniversary', date: '--02-29' });
		expect(f.inserted?.date).toBe('--02-29');
		await addImportantDate(deps(f.repo), {
			contactId: 'c1',
			kind: 'anniversary',
			date: '2016-02-29'
		});
		expect(f.inserted?.date).toBe('2016-02-29');
	});

	it('refuses 29 February in a common year', async () => {
		const f = fakeRepo();
		await expect(
			addImportantDate(deps(f.repo), { contactId: 'c1', kind: 'anniversary', date: '2026-02-29' })
		).rejects.toBeInstanceOf(InvalidImportantDateError);
	});
});

describe('overridesDerivedBirthday', () => {
	it('is true once an explicit birthday exists', () => {
		expect(overridesDerivedBirthday([{ kind: 'birthday' }])).toBe(true);
	});

	it('is false for other kinds, so the derived birthday still shows', () => {
		expect(overridesDerivedBirthday([{ kind: 'anniversary' }, { kind: 'custom' }])).toBe(false);
		expect(overridesDerivedBirthday([])).toBe(false);
	});
});
