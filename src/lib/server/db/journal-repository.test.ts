import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import {
	saveJournalEntry,
	listJournalForContact,
	listJournalPage,
	type JournalAuthor
} from '../domain/journal/journal';
import { createDrizzleJournalRepository } from './journal-repository';
import { systemClock } from '../clock';
import * as schema from './schema';

/*
 * Integration spec for the journal Drizzle adapter: it must apply the same child-record
 * scoping as notes (§3.7) — a private entry, or any entry on a private contact, is only
 * returned to those allowed to see it — and the domain upsert must reuse the per-day slot.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const author1: JournalAuthor = { userId: U1, householdId: H, defaultVisibility: 'shared' };
const author2: JournalAuthor = { userId: U2, householdId: H, defaultVisibility: 'shared' };
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let ids: { next: () => string };

function deps() {
	return { journal: createDrizzleJournalRepository(db), ids, clock: systemClock };
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
		.values({ id: 'kid', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Kid' })
		.run();

	let n = 0;
	ids = { next: () => `j-${++n}` };
});

describe('journal repository + upsert', () => {
	it('re-saving the same day/visibility slot edits the existing row', async () => {
		const first = await saveJournalEntry(deps(), author1, {
			contactId: 'kid',
			entryDate: '2026-07-11',
			body: 'first steps'
		});
		const second = await saveJournalEntry(deps(), author1, {
			contactId: 'kid',
			entryDate: '2026-07-11',
			body: 'first steps, in the garden',
			title: 'Big day'
		});
		expect(second).toBe(first);

		const list = await listJournalForContact(deps(), viewerU1, 'kid');
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ body: 'first steps, in the garden', title: 'Big day' });
	});

	it('orders newest entry-date first', async () => {
		await saveJournalEntry(deps(), author1, { contactId: 'kid', entryDate: '2026-07-01', body: 'a' });
		await saveJournalEntry(deps(), author1, { contactId: 'kid', entryDate: '2026-07-11', body: 'b' });
		const list = await listJournalForContact(deps(), viewerU1, 'kid');
		expect(list.map((e) => e.entryDate)).toEqual(['2026-07-11', '2026-07-01']);
	});

	it('hides a private entry from other members but shows it to its author', async () => {
		await saveJournalEntry(deps(), author1, {
			contactId: 'kid',
			entryDate: '2026-07-11',
			body: 'shared moment',
			visibility: 'shared'
		});
		await saveJournalEntry(deps(), author1, {
			contactId: 'kid',
			entryDate: '2026-07-11',
			body: 'private thought',
			visibility: 'private'
		});

		const asAuthor = await listJournalForContact(deps(), viewerU1, 'kid');
		expect(asAuthor).toHaveLength(2);

		const asOther = await listJournalForContact(deps(), viewerU2, 'kid');
		expect(asOther.map((e) => e.body)).toEqual(['shared moment']);
	});

	it('lets each member keep their own entry for the same day', async () => {
		await saveJournalEntry(deps(), author1, { contactId: 'kid', entryDate: '2026-07-11', body: 'from u1' });
		await saveJournalEntry(deps(), author2, { contactId: 'kid', entryDate: '2026-07-11', body: 'from u2' });
		const list = await listJournalForContact(deps(), viewerU1, 'kid');
		expect(list).toHaveLength(2);
	});

	it('hides the whole journal when the parent contact is private to someone else', async () => {
		db.insert(schema.contact)
			.values({ id: 'secret', householdId: H, createdBy: U1, visibility: 'private', displayName: 'Secret' })
			.run();
		await saveJournalEntry(deps(), author1, { contactId: 'secret', entryDate: '2026-07-11', body: 'hidden' });

		expect(await listJournalForContact(deps(), viewerU2, 'secret')).toHaveLength(0);
		expect(await listJournalForContact(deps(), viewerU1, 'secret')).toHaveLength(1);
	});

	it('paginates newest-first via keyset cursor without gaps or repeats', async () => {
		for (const d of ['2026-06-20', '2026-06-27', '2026-07-04', '2026-07-11', '2026-07-18']) {
			await saveJournalEntry(deps(), author1, { contactId: 'kid', entryDate: d, body: `entry ${d}` });
		}

		const page1 = await listJournalPage(deps(), viewerU1, 'kid', { limit: 2 });
		expect(page1.entries.map((e) => e.entryDate)).toEqual(['2026-07-18', '2026-07-11']);
		expect(page1.nextCursor).not.toBeNull();

		const page2 = await listJournalPage(deps(), viewerU1, 'kid', { limit: 2, before: page1.nextCursor! });
		expect(page2.entries.map((e) => e.entryDate)).toEqual(['2026-07-04', '2026-06-27']);

		const page3 = await listJournalPage(deps(), viewerU1, 'kid', { limit: 2, before: page2.nextCursor! });
		expect(page3.entries.map((e) => e.entryDate)).toEqual(['2026-06-20']);
		expect(page3.nextCursor).toBeNull(); // reached the beginning
	});

	it('pagination applies the same visibility scoping', async () => {
		await saveJournalEntry(deps(), author1, {
			contactId: 'kid',
			entryDate: '2026-07-11',
			body: 'private thought',
			visibility: 'private'
		});
		await saveJournalEntry(deps(), author1, {
			contactId: 'kid',
			entryDate: '2026-07-04',
			body: 'shared moment',
			visibility: 'shared'
		});

		const asOther = await listJournalPage(deps(), viewerU2, 'kid', { limit: 10 });
		expect(asOther.entries.map((e) => e.body)).toEqual(['shared moment']);
	});

	it('replaceMentions stores links and overwrites them wholesale', async () => {
		db.insert(schema.contact)
			.values([
				{ id: 'ada', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Ada' },
				{ id: 'bo', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Bo' }
			])
			.run();
		const repo = createDrizzleJournalRepository(db);
		const id = await saveJournalEntry(deps(), author1, { contactId: 'kid', entryDate: '2026-07-11', body: 'x' });

		await repo.replaceMentions(id, ['ada', 'bo']);
		expect((await repo.listMentionedContactIds(id)).sort()).toEqual(['ada', 'bo']);

		await repo.replaceMentions(id, ['ada']); // wholesale replace, not append
		expect(await repo.listMentionedContactIds(id)).toEqual(['ada']);

		await repo.replaceMentions(id, []); // clear
		expect(await repo.listMentionedContactIds(id)).toEqual([]);
	});

	it('deleting an entry cascades its mention links away', async () => {
		db.insert(schema.contact)
			.values({ id: 'ada', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Ada' })
			.run();
		const repo = createDrizzleJournalRepository(db);
		const id = await saveJournalEntry(deps(), author1, { contactId: 'kid', entryDate: '2026-07-11', body: 'x' });
		await repo.replaceMentions(id, ['ada']);

		await repo.deleteOwn({ authorId: U1, id });
		expect(await repo.listMentionedContactIds(id)).toEqual([]);
	});

	it('deleteOwn removes only the author’s own entry', async () => {
		const repo = createDrizzleJournalRepository(db);
		const id = await saveJournalEntry(deps(), author1, { contactId: 'kid', entryDate: '2026-07-11', body: 'mine' });
		expect(await repo.deleteOwn({ authorId: U2, id })).toBe(false); // not U2's
		expect(await repo.deleteOwn({ authorId: U1, id })).toBe(true);
		expect(await listJournalForContact(deps(), viewerU1, 'kid')).toHaveLength(0);
	});
});
