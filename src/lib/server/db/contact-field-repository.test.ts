import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { NewContactField } from '../domain/contact-fields/contact-fields';
import * as schema from './schema';
import { createDrizzleContactFieldRepository } from './contact-field-repository';

/*
 * Integration spec for the Drizzle ContactFieldRepository: fields inherit the contact's
 * visibility (docs/02 §2.3), ordering, and scoped removal.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleContactFieldRepository>;

function field(over: Partial<NewContactField>): NewContactField {
	return {
		id: 'f',
		contactId: 'c-shared',
		kind: 'phone',
		label: null,
		value: '123',
		meta: null,
		sortOrder: 0,
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
	db.insert(schema.user).values([
		{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
		{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
	]).run();
	db.insert(schema.contact).values([
		{ id: 'c-shared', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Shared' },
		{ id: 'c-priv', householdId: H, createdBy: U1, visibility: 'private', displayName: 'Private' }
	]).run();
	repo = createDrizzleContactFieldRepository(db);
});

describe('createDrizzleContactFieldRepository', () => {
	it('inserts and lists fields in order', async () => {
		await repo.insert(field({ id: 'f-b', value: 'second', sortOrder: 1 }));
		await repo.insert(field({ id: 'f-a', value: 'first', sortOrder: 0 }));
		const list = await repo.listForContactVisibleTo(viewerU1, 'c-shared');
		expect(list.map((f) => f.id)).toEqual(['f-a', 'f-b']);
	});

	it('hides fields of a private contact from non-owners', async () => {
		await repo.insert(field({ id: 'f-priv', contactId: 'c-priv' }));
		expect(await repo.listForContactVisibleTo(viewerU2, 'c-priv')).toHaveLength(0);
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-priv')).toHaveLength(1);
	});

	it('removes a field scoped to its contact', async () => {
		await repo.insert(field({ id: 'f-1' }));
		await repo.remove('c-shared', 'f-1');
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-shared')).toHaveLength(0);
	});

	it('does not remove a field when the contact id does not match', async () => {
		await repo.insert(field({ id: 'f-1', contactId: 'c-shared' }));
		await repo.remove('c-priv', 'f-1'); // wrong contact
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-shared')).toHaveLength(1);
	});
});
