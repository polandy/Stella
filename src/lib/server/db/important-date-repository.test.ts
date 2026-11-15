import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { createTranslator } from '../../i18n/translate';
import { calendarFeed } from '../domain/dates/calendar-feed';
import type { NewImportantDate } from '../domain/dates/important-dates';
import * as schema from './schema';
import { createDrizzleImportantDateRepository } from './important-date-repository';

/*
 * Integration spec for the Drizzle ImportantDateRepository: dates inherit the contact's
 * visibility (docs/dev/02 §2.13), the flags survive the round-trip through SQLite's 0/1
 * integers, and the upcoming sources include birthdays derived from `contact.birth_date`.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleImportantDateRepository>;

function date(over: Partial<NewImportantDate>): NewImportantDate {
	return {
		id: 'd',
		contactId: 'c-shared',
		kind: 'anniversary',
		label: null,
		date: '2009-06-13',
		recursYearly: true,
		remind: true,
		createdAt: 0,
		updatedAt: 0,
		...over
	};
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{
				id: 'c-shared',
				householdId: H,
				createdBy: U1,
				visibility: 'shared',
				displayName: 'Shared',
				birthDate: '1985-07-02'
			},
			{
				id: 'c-priv',
				householdId: H,
				createdBy: U1,
				visibility: 'private',
				displayName: 'Private',
				birthDate: '1990-01-15'
			},
			{
				id: 'c-gone',
				householdId: H,
				createdBy: U1,
				visibility: 'shared',
				displayName: 'Gone',
				birthDate: '1930-02-04',
				isDeceased: 1
			}
		])
		.run();
	repo = createDrizzleImportantDateRepository(db);
});

describe('createDrizzleImportantDateRepository', () => {
	it('round-trips a date with its flags intact', async () => {
		await repo.insert(
			date({ id: 'd1', kind: 'custom', label: 'Umzug', recursYearly: false, remind: false })
		);
		const [row] = await repo.listForContactVisibleTo(viewerU1, 'c-shared');
		expect(row).toMatchObject({
			id: 'd1',
			kind: 'custom',
			label: 'Umzug',
			recursYearly: false,
			remind: false
		});
	});

	it('hides the dates of a private contact from everyone but its owner', async () => {
		await repo.insert(date({ id: 'd-priv', contactId: 'c-priv' }));
		expect(await repo.listForContactVisibleTo(viewerU2, 'c-priv')).toHaveLength(0);
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-priv')).toHaveLength(1);
	});

	it('removes a date only from the contact it belongs to', async () => {
		await repo.insert(date({ id: 'd1' }));
		await repo.remove('c-priv', 'd1'); // wrong contact
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-shared')).toHaveLength(1);
		await repo.remove('c-shared', 'd1');
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-shared')).toHaveLength(0);
	});

	it('derives a birthday source from the contact birth date', async () => {
		const sources = await repo.listSourcesVisibleTo(viewerU1);
		const shared = sources.find((s) => s.contactId === 'c-shared' && s.derived);
		expect(shared).toMatchObject({
			kind: 'birthday',
			date: '1985-07-02',
			contactName: 'Shared',
			recursYearly: true,
			remind: true,
			isDeceased: false
		});
	});

	it('does not derive a birthday from an estimated birth year', async () => {
		db.insert(schema.contact)
			.values({
				id: 'c-estimated',
				householdId: H,
				createdBy: U1,
				visibility: 'shared',
				displayName: 'Roughly',
				birthDate: '2016',
				birthDatePrecision: 'age'
			})
			.run();
		const sources = await repo.listSourcesVisibleTo(viewerU1);
		expect(sources.some((s) => s.contactId === 'c-estimated')).toBe(false);
		// positive control: the fully dated contact is still there
		expect(sources.some((s) => s.contactId === 'c-shared' && s.derived)).toBe(true);
	});

	it('lists the estimated birth years apart, scoped like every other read', async () => {
		db.insert(schema.contact)
			.values([
				{
					id: 'c-estimated',
					householdId: H,
					createdBy: U1,
					visibility: 'shared',
					displayName: 'Roughly',
					birthDate: '1992',
					birthDatePrecision: 'age'
				},
				{
					id: 'c-estimated-priv',
					householdId: H,
					createdBy: U1,
					visibility: 'private',
					displayName: 'Secret',
					birthDate: '1980',
					birthDatePrecision: 'year',
					isDeceased: 1
				}
			])
			.run();
		expect(await repo.listBirthEstimatesVisibleTo(viewerU1)).toEqual(
			expect.arrayContaining([
				{ contactId: 'c-estimated', year: '1992', isDeceased: false },
				{ contactId: 'c-estimated-priv', year: '1980', isDeceased: true }
			])
		);
		// A birth date that names a day is no estimate, and the private one stays its owner's.
		expect(await repo.listBirthEstimatesVisibleTo(viewerU2)).toEqual([
			{ contactId: 'c-estimated', year: '1992', isDeceased: false }
		]);
	});

	it('reports a deceased person so the domain can leave them out', async () => {
		const sources = await repo.listSourcesVisibleTo(viewerU1);
		expect(sources.find((s) => s.contactId === 'c-gone')).toMatchObject({ isDeceased: true });
	});

	it('never leaks a private contact into another member sources', async () => {
		await repo.insert(date({ id: 'd-priv', contactId: 'c-priv', kind: 'custom', label: 'X' }));
		const mine = await repo.listSourcesVisibleTo(viewerU1);
		const theirs = await repo.listSourcesVisibleTo(viewerU2);
		expect(mine.some((s) => s.contactId === 'c-priv')).toBe(true);
		expect(theirs.some((s) => s.contactId === 'c-priv')).toBe(false);
		// The other member still sees the shared people, so this is not an empty-result false pass.
		expect(theirs.some((s) => s.contactId === 'c-shared')).toBe(true);
	});

	it('drops both the birthday and the entered dates of an archived contact', async () => {
		// Two queries feed this list, and archiving has to take the contact out of both.
		await repo.insert(date({ id: 'd1', kind: 'anniversary', date: '2009-06-13' }));
		expect(
			(await repo.listSourcesVisibleTo(viewerU1)).filter((s) => s.contactId === 'c-shared')
		).toHaveLength(2);

		db.update(schema.contact)
			.set({ archivedAt: 1_700_000_000_000 })
			.where(eq(schema.contact.id, 'c-shared'))
			.run();

		const after = await repo.listSourcesVisibleTo(viewerU1);
		expect(after.some((s) => s.contactId === 'c-shared')).toBe(false);
		// positive control: everyone else is still on the list.
		expect(after.some((s) => s.contactId === 'c-priv')).toBe(true);
	});

	it('returns explicit rows alongside the derived birthdays', async () => {
		await repo.insert(date({ id: 'd1', kind: 'anniversary', date: '2009-06-13' }));
		const sources = await repo.listSourcesVisibleTo(viewerU1);
		const forShared = sources.filter((s) => s.contactId === 'c-shared');
		expect(forShared.map((s) => `${s.kind}:${s.derived}`).sort()).toEqual([
			'anniversary:false',
			'birthday:true'
		]);
	});
});

describe('estimated birth years', () => {
	const birthOf = (id: string) =>
		db
			.select({ birthDate: schema.contact.birthDate, precision: schema.contact.birthDatePrecision })
			.from(schema.contact)
			.where(eq(schema.contact.id, id))
			.get();
	const estimate = (id: string, year: string) =>
		db
			.update(schema.contact)
			.set({ birthDate: year, birthDatePrecision: 'age' })
			.where(eq(schema.contact.id, id))
			.run();

	it('keeps, replaces and clears an estimate where no day is on record', async () => {
		estimate('c-shared', '1990');
		expect(await repo.setBirthYear(viewerU1, 'c-shared', '1992', 5)).toBe(true);
		expect(birthOf('c-shared')).toEqual({ birthDate: '1992', precision: 'age' });
		expect(await repo.setBirthYear(viewerU1, 'c-shared', null, 6)).toBe(true);
		expect(birthOf('c-shared')).toEqual({ birthDate: null, precision: 'full' });
	});

	it('never writes over a day, nor on a person the viewer does not see', async () => {
		expect(await repo.setBirthYear(viewerU1, 'c-shared', '1992', 5)).toBe(false);
		expect(birthOf('c-shared')).toEqual({ birthDate: '1985-07-02', precision: 'full' });
		estimate('c-priv', '1990');
		expect(await repo.setBirthYear(viewerU2, 'c-priv', '1992', 5)).toBe(false);
		expect(birthOf('c-priv')).toEqual({ birthDate: '1990', precision: 'age' });
	});

	it('lets a birthday with its year clear the estimate in the same write, and only then', async () => {
		estimate('c-shared', '1990');
		await repo.insert(date({ id: 'd1', kind: 'birthday', date: '--03-14' }));
		expect(birthOf('c-shared')).toEqual({ birthDate: '1990', precision: 'age' });
		await repo.insert(date({ id: 'd2', kind: 'birthday', date: '1992-03-14' }), {
			replacesBirthYear: true
		});
		expect(birthOf('c-shared')).toEqual({ birthDate: null, precision: 'full' });
	});

	it('leaves a profile day alone when a birthday row replaces a birth year', async () => {
		await repo.insert(date({ id: 'd1', kind: 'birthday', date: '1992-03-14' }), {
			replacesBirthYear: true
		});
		expect(birthOf('c-shared')).toEqual({ birthDate: '1985-07-02', precision: 'full' });
	});
});

describe('the calendar feed over SQLite', () => {
	const feedOf = (viewer: Viewer) =>
		calendarFeed(
			{
				dates: repo,
				todos: { listOpenVisibleTo: async () => [] },
				clock: { now: () => Date.UTC(2026, 10, 1) }
			},
			{ viewer, translate: createTranslator('en'), origin: 'https://stella.example' }
		);

	it('carries a private person only in its owner’s feed, and never the deceased', async () => {
		const mine = await feedOf(viewerU1);
		const theirs = await feedOf(viewerU2);
		expect(mine).toContain("SUMMARY:Private's birthday");
		expect(theirs).not.toContain('Private');
		expect(theirs).toContain("SUMMARY:Shared's birthday");
		expect(mine).not.toContain('Gone');
	});
});
