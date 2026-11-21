import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { createDrizzlePrivateEntryReads } from './private-entry-reads';
import * as schema from './schema';

/* Whether the member has any private note, moment or touchpoint of their own. */

function setup() {
	const db = drizzle(new Database(':memory:'), { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: 'h', name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: 'u1', householdId: 'h', email: 'a@x.test', name: 'A' },
			{ id: 'u2', householdId: 'h', email: 'b@x.test', name: 'B' }
		])
		.run();
	db.insert(schema.contact)
		.values({ id: 'c', householdId: 'h', createdBy: 'u1', displayName: 'C' })
		.run();
	return db;
}

describe('private entry reads', () => {
	it('is false with nothing, or with shared entries only', async () => {
		const db = setup();
		db.insert(schema.note)
			.values({ id: 'n', contactId: 'c', createdBy: 'u1', body: 'x', visibility: 'shared' })
			.run();
		expect(await createDrizzlePrivateEntryReads(db).hasPrivateEntry('u1')).toBe(false);
	});

	it('is true for the author’s own private note, moment or touchpoint, and only for them', async () => {
		const reads = (db: ReturnType<typeof setup>) => createDrizzlePrivateEntryReads(db);

		const noteDb = setup();
		noteDb
			.insert(schema.note)
			.values({ id: 'n', contactId: 'c', createdBy: 'u1', body: 'x', visibility: 'private' })
			.run();
		expect(await reads(noteDb).hasPrivateEntry('u1')).toBe(true);
		expect(await reads(noteDb).hasPrivateEntry('u2')).toBe(false);

		const momentDb = setup();
		momentDb
			.insert(schema.journalEntry)
			.values({
				id: 'e',
				contactId: 'c',
				subjectKey: 'c',
				createdBy: 'u1',
				entryDate: '2026-09-27',
				body: 'x',
				visibility: 'private'
			})
			.run();
		expect(await reads(momentDb).hasPrivateEntry('u1')).toBe(true);

		const touchDb = setup();
		touchDb
			.insert(schema.interaction)
			.values({
				id: 'i',
				contactId: 'c',
				createdBy: 'u1',
				kind: 'call',
				happenedAt: '2026-09-27',
				visibility: 'private'
			})
			.run();
		expect(await reads(touchDb).hasPrivateEntry('u1')).toBe(true);
	});
});
