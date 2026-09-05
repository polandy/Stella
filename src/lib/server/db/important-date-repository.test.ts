import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { NewImportantDate } from '../domain/dates/important-dates';
import * as schema from './schema';
import { createDrizzleImportantDateRepository } from './important-date-repository';

/*
 * Integration spec for the Drizzle ImportantDateRepository: dates inherit the contact's
 * visibility (docs/02 §2.13), the flags survive the round-trip through SQLite's 0/1
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
