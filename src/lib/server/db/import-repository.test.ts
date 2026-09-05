import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { count, eq } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { MonicaExport } from '../domain/import/monica/monica-export';
import { planMonicaImport, type ImportPlan } from '../domain/import/monica/plan';
import { createDrizzleImportRepository } from './import-repository';
import * as schema from './schema';
import { seedRelationshipTypes } from './seed';

/*
 * Integration spec for the import adapter (docs/02 §2.16): a plan lands in one transaction,
 * re-applying the same plan writes nothing new, a tag that already exists by name is reused
 * rather than duplicated, and a plan that cannot be written leaves no partial rows behind.
 */

const H = 'household-1';
const U1 = 'user-1';
const NOW = 1_700_000_000_000;

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleImportRepository>;

function fixture(): MonicaExport {
	const contact = (id: number, first: string, extra: Partial<MonicaExport['contacts'][0]> = {}) => ({
		id, firstName: first, middleName: null, lastName: 'Test', nickname: null, genderId: null, description: null,
		isPartial: false, isDead: false, deceasedSpecialDateId: null, birthdaySpecialDateId: null,
		firstMetSpecialDateId: null, firstMetThroughContactId: null, firstMetWhere: null, firstMetAdditionalInfo: null,
		job: null, company: null, avatarSource: 'default', avatarPhotoId: null, deletedAt: null, createdAt: null, ...extra
	});
	return {
		contacts: [contact(1, 'Ada', { job: 'Engineer', birthdaySpecialDateId: 5 }), contact(2, 'Bo'), contact(3, 'Cy')],
		genders: [],
		specialDates: [{ id: 5, contactId: 1, isAgeBased: true, isYearUnknown: false, date: '2016-01-01' }],
		relationshipTypes: [
			{ id: 8, name: 'parent', nameReverse: 'child' },
			{ id: 9, name: 'child', nameReverse: 'parent' },
			{ id: 15, name: 'cousin', nameReverse: 'cousin' }
		],
		relationships: [
			{ id: 1, typeId: 8, contactIs: 1, ofContact: 2, createdAt: null },
			{ id: 2, typeId: 9, contactIs: 2, ofContact: 1, createdAt: null },
			{ id: 3, typeId: 15, contactIs: 2, ofContact: 3, createdAt: null },
			{ id: 4, typeId: 15, contactIs: 3, ofContact: 2, createdAt: null }
		],
		contactFieldTypes: [{ id: 1, name: 'Email', type: 'email', protocol: 'mailto:' }],
		contactFields: [{ id: 1, contactId: 1, typeId: 1, data: 'ada@x.test', createdAt: null }],
		addresses: [],
		notes: [{ id: 1, contactId: 1, body: 'hello', isFavorited: true, createdAt: null }],
		activities: [{ id: 1, summary: 'Lunch', description: null, happenedAt: '2024-01-02', typeKey: null, contactIds: [1, 2], createdAt: null }],
		tags: [{ id: 1, name: 'Tennis', contactIds: [1, 2] }],
		photos: [],
		gifts: [],
		lifeEvents: [],
		pets: [],
		journalEntries: [],
		userCount: 1,
		derivedReminderCount: 0
	};
}

const plan = (): ImportPlan =>
	planMonicaImport(fixture(), { householdId: H, userId: U1, visibility: 'shared', now: NOW });

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user).values({ id: U1, householdId: H, email: 'u1@x.test', name: 'One' }).run();
	repo = createDrizzleImportRepository(db);
});

const rows = (table: SQLiteTable) => db.select({ n: count() }).from(table).get()!.n;

describe('import repository', () => {
	it('writes the whole plan and reports what it inserted', async () => {
		const outcome = await repo.applyPlan(plan());
		expect(outcome.inserted).toEqual({
			contacts: 3, relationships: 2, relationshipTypes: 1, contactFields: 1, notes: 1, interactions: 1, tags: 1, photos: 0
		});
		const ada = db.select().from(schema.contact).where(eq(schema.contact.id, 'monica:contact:1')).get()!;
		expect(ada).toMatchObject({ displayName: 'Ada Test', jobTitle: 'Engineer', birthDate: '2016', birthDatePrecision: 'age' });
		expect(rows(schema.interactionParticipant)).toBe(1);
		expect(rows(schema.contactTag)).toBe(2);
		expect(db.select().from(schema.relationshipType).where(eq(schema.relationshipType.id, 'monica:reltype:cousin')).get()).toMatchObject({
			householdId: H, forwardLabel: 'Cousin of', symmetric: 1
		});
	});

	it('applying the same plan again inserts nothing new', async () => {
		await repo.applyPlan(plan());
		const again = await repo.applyPlan(plan());
		expect(again.inserted).toEqual({
			contacts: 0, relationships: 0, relationshipTypes: 0, contactFields: 0, notes: 0, interactions: 0, tags: 0, photos: 0
		});
		expect(rows(schema.contact)).toBe(3);
		expect(rows(schema.interactionParticipant)).toBe(1);
	});

	it('reuses a tag that already exists under the same name instead of duplicating it', async () => {
		db.insert(schema.tag).values({ id: 'existing-tennis', householdId: H, name: 'Tennis', color: 'peach' }).run();
		const outcome = await repo.applyPlan(plan());
		expect(outcome.inserted.tags).toBe(0);
		expect(rows(schema.tag)).toBe(1);
		const links = db.select().from(schema.contactTag).all();
		expect(links.every((l) => l.tagId === 'existing-tennis')).toBe(true);
		expect(links).toHaveLength(2);
	});

	it('leaves nothing behind when the plan cannot be written', async () => {
		const broken = plan();
		broken.relationships.push({ ...broken.relationships[0]!, id: 'monica:relationship:999', toContactId: 'monica:contact:404' });
		await expect(repo.applyPlan(broken)).rejects.toThrow();
		expect(rows(schema.contact)).toBe(0);
		expect(rows(schema.relationshipType)).toBe(12); // only the built-ins
	});
});
