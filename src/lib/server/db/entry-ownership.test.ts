import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { createDrizzleEntryOwnership } from './entry-ownership';
import * as schema from './schema';

/*
 * Whether a journal entry is still there and still its author's — what a photo sent after its
 * moment checks before landing (docs/concepts/offline-capture.md §4.2).
 */

describe('entry ownership', () => {
	it('answers yes for the author’s own entry, and no for anyone else’s or a deleted one', async () => {
		const db = drizzle(new Database(':memory:'), { schema });
		migrate(db, { migrationsFolder: './drizzle' });
		db.insert(schema.household).values({ id: 'h', name: 'H' }).run();
		db.insert(schema.user)
			.values([
				{ id: 'u1', householdId: 'h', email: 'a@x.test', name: 'A' },
				{ id: 'u2', householdId: 'h', email: 'b@x.test', name: 'B' }
			])
			.run();
		db.insert(schema.contact).values({ id: 'c', householdId: 'h', createdBy: 'u1', displayName: 'C' }).run();
		db.insert(schema.journalEntry)
			.values({ id: 'e1', contactId: 'c', createdBy: 'u1', entryDate: '2026-09-27', body: 'x' })
			.run();
		const entries = createDrizzleEntryOwnership(db);

		expect(await entries.ownsEntry('u1', 'e1')).toBe(true);
		expect(await entries.ownsEntry('u2', 'e1')).toBe(false);
		expect(await entries.ownsEntry('u1', 'gone')).toBe(false);
	});
});
