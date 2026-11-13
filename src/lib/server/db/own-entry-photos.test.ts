import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { createDrizzleOwnEntries } from './own-entry-photos';
import * as schema from './schema';

/* An entry's photos as its author edits them (docs/02 §2.20). */

describe('own entry photos', () => {
	it('finds the author’s own entry, and deletes a photo only off their own entry', async () => {
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
		const entry = { contactId: 'c', subjectKey: 'c', entryDate: '2026-09-27', body: 'x' };
		db.insert(schema.journalEntry)
			.values([
				{ ...entry, id: 'e1', createdBy: 'u1', visibility: 'private' },
				{ ...entry, id: 'e2', createdBy: 'u2' }
			])
			.run();
		const photo = {
			householdId: 'h',
			contactId: 'c',
			mime: 'image/jpeg',
			width: 1,
			height: 1,
			sizeBytes: 1
		};
		db.insert(schema.photo)
			.values([
				{
					...photo,
					id: 'p1',
					journalEntryId: 'e1',
					createdBy: 'u1',
					filePath: 'a',
					thumbPath: 'at'
				},
				{
					...photo,
					id: 'p2',
					journalEntryId: 'e2',
					createdBy: 'u2',
					filePath: 'b',
					thumbPath: 'bt'
				},
				{ ...photo, id: 'p3', createdBy: 'u1', filePath: 'g', thumbPath: 'gt' }
			])
			.run();
		const entries = createDrizzleOwnEntries(db);

		expect(await entries.findOwnEntry('u1', 'e1')).toEqual({
			contactId: 'c',
			visibility: 'private'
		});
		expect(await entries.findOwnEntry('u1', 'e2')).toBeNull();

		// Another author's entry, another entry's photo and a gallery photo all stay.
		expect(await entries.deleteOwnEntryPhoto('u1', 'e2', 'p2')).toBeNull();
		expect(await entries.deleteOwnEntryPhoto('u1', 'e1', 'p2')).toBeNull();
		expect(await entries.deleteOwnEntryPhoto('u1', 'e1', 'p3')).toBeNull();
		expect(await entries.deleteOwnEntryPhoto('u1', 'e1', 'p1')).toEqual({
			filePath: 'a',
			thumbPath: 'at'
		});
		const left = db.select({ id: schema.photo.id }).from(schema.photo).all();
		expect(left.map((r) => r.id).sort()).toEqual(['p2', 'p3']);
	});
});
