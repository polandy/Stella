import { beforeEach, describe, expect, it } from 'bun:test';
import { createDrizzleJournalRepository } from '../../db/journal-repository';
import * as schema from '../../db/schema';
import { fixedClock, sequentialIds } from '../testing';
import {
	admin,
	ADMIN,
	author,
	AUTHOR,
	foreignAdmin,
	H,
	member,
	MEMBER,
	removalDb,
	type RemovalDb
} from '../testing/removal-db';
import { removeJournalEntry } from './journal';

/*
 * Removing a journal entry (docs/02 §2.20, docs/03 §3.7): its author always, an admin on a
 * shared one. Wired to the real adapter, because the photos inside it, its mentions and the
 * activity entry in the same transaction live there.
 */

const NOW = 1_760_000_000_000;

let t: RemovalDb;
let files: string[];
let deps: Parameters<typeof removeJournalEntry>[0];

function addEntry(id: string, over: Partial<typeof schema.journalEntry.$inferInsert> = {}) {
	t.db
		.insert(schema.journalEntry)
		.values({
			id,
			contactId: 'c-kurt',
			createdBy: AUTHOR,
			visibility: 'shared',
			entryDate: '2026-10-08',
			body: id,
			...over
		})
		.run();
}

const entryIds = () =>
	t.db
		.select({ id: schema.journalEntry.id })
		.from(schema.journalEntry)
		.all()
		.map((r) => r.id);
const activity = () => t.db.select().from(schema.activityLog).all();

beforeEach(() => {
	t = removalDb();
	files = [];
	deps = {
		journal: createDrizzleJournalRepository(t.db),
		media: { delete: async (path) => void files.push(path) },
		ids: sequentialIds('activity'),
		clock: fixedClock(NOW)
	};
});

describe('removeJournalEntry: who may', () => {
	it('lets the author remove their own entry, shared or private, and logs nothing', async () => {
		addEntry('j-shared');
		addEntry('j-private', { visibility: 'private', entryDate: '2026-10-07' });

		expect(await removeJournalEntry(deps, author, 'j-shared')).toBe(true);
		expect(await removeJournalEntry(deps, author, 'j-private')).toBe(true);

		expect(entryIds()).toEqual([]);
		expect(activity()).toEqual([]);
	});

	it("lets an admin remove another member's shared entry", async () => {
		addEntry('j-shared');
		expect(await removeJournalEntry(deps, admin, 'j-shared')).toBe(true);
		expect(entryIds()).toEqual([]);
	});

	it("refuses an admin on another member's private entry, and keeps it", async () => {
		addEntry('j-private', { visibility: 'private' });
		addEntry('j-control', { entryDate: '2026-10-07' });

		expect(await removeJournalEntry(deps, admin, 'j-private')).toBe(false);
		expect(await removeJournalEntry(deps, admin, 'j-control')).toBe(true);
		expect(entryIds()).toEqual(['j-private']);
	});

	it("refuses a member on someone else's shared entry", async () => {
		addEntry('j-ninas');
		addEntry('j-mias', { createdBy: MEMBER });

		expect(await removeJournalEntry(deps, member, 'j-ninas')).toBe(false);
		expect(await removeJournalEntry(deps, member, 'j-mias')).toBe(true);
		expect(entryIds()).toEqual(['j-ninas']);
	});

	it('refuses an admin of another household', async () => {
		addEntry('j-shared');
		expect(await removeJournalEntry(deps, foreignAdmin, 'j-shared')).toBe(false);
		expect(await removeJournalEntry(deps, admin, 'j-shared')).toBe(true);
	});

	it('answers an entry that is gone like one the remover may not touch, unlinking nothing', async () => {
		expect(await removeJournalEntry(deps, admin, 'j-never')).toBe(false);
		expect(files).toEqual([]);
		expect(activity()).toEqual([]);
	});
});

describe('removeJournalEntry: what goes with it', () => {
	it('takes the photos inside it, and unlinks their files', async () => {
		addEntry('j-photos');
		t.db
			.insert(schema.photo)
			.values({
				id: 'p-1',
				householdId: H,
				journalEntryId: 'j-photos',
				createdBy: AUTHOR,
				filePath: 'a.jpg',
				thumbPath: 'a-t.jpg',
				mime: 'image/jpeg'
			})
			.run();

		await removeJournalEntry(deps, admin, 'j-photos');

		expect(t.db.select().from(schema.photo).all()).toEqual([]);
		expect(files).toEqual(['a.jpg', 'a-t.jpg']);
	});

	it('takes its mentions along', async () => {
		addEntry('j-mentions');
		t.db
			.insert(schema.journalMention)
			.values({ journalEntryId: 'j-mentions', contactId: 'c-lea' })
			.run();

		await removeJournalEntry(deps, author, 'j-mentions');

		expect(t.db.select().from(schema.journalMention).all()).toEqual([]);
	});

	it("logs an admin's removal once, shared, naming kind, person and both members — never the text", async () => {
		addEntry('j-shared', { title: 'Secret plans', body: 'The surprise party' });

		await removeJournalEntry(deps, admin, 'j-shared');

		const [entry, ...more] = activity();
		expect(more).toEqual([]);
		expect(entry).toMatchObject({
			householdId: H,
			actorId: ADMIN,
			action: 'delete',
			entityType: 'journal_entry',
			entityId: 'j-shared',
			contactId: 'c-kurt',
			visibility: 'shared',
			createdAt: NOW
		});
		expect(JSON.parse(entry!.summary)).toEqual({
			person: 'Kurt',
			authorId: AUTHOR,
			authorName: 'Nina'
		});
		expect(entry!.summary).not.toContain('Secret plans');
		expect(entry!.summary).not.toContain('surprise');
	});

	it('keeps the entry as private as the person when the person is private', async () => {
		addEntry('j-on-secret', { contactId: 'c-secret' });
		await removeJournalEntry(deps, admin, 'j-on-secret');
		expect(activity().map((a) => a.visibility)).toEqual(['private']);
	});

	it('writes the entry in the same transaction as the delete', async () => {
		addEntry('j-shared');
		t.sqlite.exec(
			"CREATE TRIGGER no_log BEFORE INSERT ON activity_log BEGIN SELECT RAISE(ABORT, 'no log'); END"
		);

		await expect(removeJournalEntry(deps, admin, 'j-shared')).rejects.toThrow('no log');
		expect(entryIds()).toEqual(['j-shared']);
		expect(files).toEqual([]);
	});
});
