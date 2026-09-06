import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { NewActivityEntry } from '../domain/activity/activity';
import type { NewContact } from '../domain/contacts/contacts';
import * as schema from './schema';
import { createDrizzleContactRepository } from './contact-repository';

/*
 * Integration spec for the Drizzle ContactRepository adapter: persistence plus
 * visibility-scoped reads via the central query-scoping (docs/03 §3.7, docs/08 §8.3).
 */

const H1 = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H1 };
const viewerU2: Viewer = { id: U2, householdId: H1 };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleContactRepository>;

const NOW = 1_700_000_000_000;
function contactInput(over: Partial<NewContact>): NewContact {
	return {
		id: 'c-x',
		householdId: H1,
		createdBy: U1,
		visibility: 'shared',
		displayName: 'X',
		firstName: null,
		lastName: null,
		nickname: null,
		description: null,
		birthDate: null,
		birthDatePrecision: 'full',
		howWeMet: null,
		metDate: null,
		metPlace: null,
		createdAt: NOW,
		updatedAt: NOW,
		...over
	};
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H1, name: 'H' }).run();
	db.insert(schema.user).values([
		{ id: U1, householdId: H1, email: 'u1@x.test', name: 'One' },
		{ id: U2, householdId: H1, email: 'u2@x.test', name: 'Two' }
	]).run();
	repo = createDrizzleContactRepository(db);
});

describe('createDrizzleContactRepository', () => {
	it('inserts and reads a contact back by id', async () => {
		await repo.insert(contactInput({ id: 'c-1', displayName: 'Hans Müller', firstName: 'Hans', lastName: 'Müller' }));
		const found = await repo.findByIdVisibleTo(viewerU1, 'c-1');
		expect(found).toMatchObject({ id: 'c-1', displayName: 'Hans Müller', firstName: 'Hans', createdBy: U1 });
	});

	it('round-trips the birth date and its precision', async () => {
		await repo.insert(
			contactInput({ id: 'c-born', birthDate: '--03-11', birthDatePrecision: 'month_day' })
		);
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-born')).toMatchObject({
			birthDate: '--03-11',
			birthDatePrecision: 'month_day'
		});
	});

	it('reads the deceased flag back as a boolean, not SQLite 0/1', async () => {
		await repo.insert(contactInput({ id: 'c-alive' }));
		db.update(schema.contact)
			.set({ isDeceased: 1 })
			.where(eq(schema.contact.id, 'c-alive'))
			.run();
		const gone = await repo.findByIdVisibleTo(viewerU1, 'c-alive');
		expect(gone?.isDeceased).toBe(true);

		await repo.insert(contactInput({ id: 'c-living' }));
		// The positive control: without it, `toBe(true)` would pass against any truthy mapping.
		expect((await repo.findByIdVisibleTo(viewerU1, 'c-living'))?.isDeceased).toBe(false);
	});

	it('hides another member private contact but shows it to its owner', async () => {
		await repo.insert(contactInput({ id: 'c-priv', visibility: 'private', createdBy: U1, displayName: 'Secret' }));
		expect(await repo.findByIdVisibleTo(viewerU2, 'c-priv')).toBeNull();
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-priv')).not.toBeNull();
	});

	it('lists only visible contacts, ordered by display name', async () => {
		await repo.insert(contactInput({ id: 'c-shared', visibility: 'shared', displayName: 'Bea' }));
		await repo.insert(contactInput({ id: 'c-priv', visibility: 'private', createdBy: U1, displayName: 'Ada' }));

		const listForU2 = await repo.listVisibleTo(viewerU2);
		expect(listForU2.map((c) => c.id)).toEqual(['c-shared']);

		const listForU1 = await repo.listVisibleTo(viewerU1);
		expect(listForU1.map((c) => c.displayName)).toEqual(['Ada', 'Bea']); // sorted
	});

	it('carries the nickname in the list summary, which is what the directory finds people by', async () => {
		await repo.insert(contactInput({ id: 'c-nick', displayName: 'Leonie', nickname: 'Leni' }));

		expect((await repo.listVisibleTo(viewerU1)).find((c) => c.id === 'c-nick')?.nickname).toBe('Leni');
	});
});

describe('listNameCandidatesVisibleTo (docs/02 §2.2.1)', () => {
	const linked = (id: string, from: string, to: string) =>
		db.insert(schema.relationship).values({ id, householdId: H1, fromContactId: from, toContactId: to, typeId: 't-friend', createdBy: U1 }).run();

	beforeEach(async () => {
		db.insert(schema.relationshipType)
			.values({ id: 't-friend', householdId: H1, key: 'friend', forwardLabel: 'Friend', reverseLabel: 'Friend', category: 'social', symmetric: 1 })
			.run();
		await repo.insert(contactInput({ id: 'c-hans', displayName: 'Hans Roth', firstName: 'Hans', lastName: 'Roth' }));
		await repo.insert(contactInput({ id: 'c-lena', displayName: 'Lena Roth', firstName: 'Lena', lastName: 'Roth' }));
		await repo.insert(contactInput({ id: 'c-secret', displayName: 'Secret Roth', lastName: 'Roth', visibility: 'private', createdBy: U2 }));
		linked('r-1', 'c-hans', 'c-lena');
		linked('r-2', 'c-hans', 'c-secret');
	});

	it('lists only the people the viewer may see, with how many visible relationships each has', async () => {
		const forU1 = await repo.listNameCandidatesVisibleTo(viewerU1);
		expect(forU1.map((c) => [c.id, c.relationshipCount])).toEqual([
			['c-hans', 1], // the link to U2's private person does not count for U1
			['c-lena', 1]
		]);
		// Positive control: the owner of the private person sees them, and the link counts.
		const forU2 = await repo.listNameCandidatesVisibleTo(viewerU2);
		expect(forU2.map((c) => [c.id, c.relationshipCount])).toEqual([
			['c-hans', 2],
			['c-lena', 1],
			['c-secret', 1]
		]);
	});
});

describe('editing the hero in place', () => {
	beforeEach(async () => {
		await repo.insert(contactInput({ id: 'c-shared', displayName: 'Bea', description: 'was this' }));
		await repo.insert(contactInput({ id: 'c-priv', visibility: 'private', displayName: 'Private' }));
	});

	it('renames a contact and rewords the description, leaving the rest alone', async () => {
		await repo.updateProfile('c-shared', {
			displayName: 'Renamed Person',
			description: 'Now says this',
			updatedAt: 999
		});

		const after = await repo.findByIdVisibleTo(viewerU1, 'c-shared');
		expect(after?.displayName).toBe('Renamed Person');
		expect(after?.description).toBe('Now says this');
		expect(after?.visibility).toBe('shared');
		expect(after?.updatedAt).toBe(999);
	});

	it('clears a description when it is written as null', async () => {
		await repo.updateProfile('c-shared', { displayName: 'Still Named', description: null, updatedAt: 1 });

		expect((await repo.findByIdVisibleTo(viewerU1, 'c-shared'))?.description).toBeNull();
	});

	it('touches only the contact it names', async () => {
		const before = await repo.findByIdVisibleTo(viewerU1, 'c-priv');

		await repo.updateProfile('c-shared', { displayName: 'Only me', description: null, updatedAt: 2 });

		expect(await repo.findByIdVisibleTo(viewerU1, 'c-priv')).toEqual(before!);
	});
});

describe('archiving', () => {
	beforeEach(async () => {
		await repo.insert(contactInput({ id: 'c-old', displayName: 'Old Neighbour' }));
		await repo.insert(contactInput({ id: 'c-here', displayName: 'Still Here' }));
	});

	it('stamps and clears archived_at, and reads it back', async () => {
		expect((await repo.findByIdVisibleTo(viewerU1, 'c-old'))?.archivedAt).toBeNull();

		await repo.setArchived('c-old', 1_700_000_000_000);
		expect((await repo.findByIdVisibleTo(viewerU1, 'c-old'))?.archivedAt).toBe(1_700_000_000_000);

		await repo.setArchived('c-old', null);
		expect((await repo.findByIdVisibleTo(viewerU1, 'c-old'))?.archivedAt).toBeNull();
	});

	it('leaves every other contact where they were', async () => {
		const before = await repo.findByIdVisibleTo(viewerU1, 'c-here');

		await repo.setArchived('c-old', 1_700_000_000_000);

		expect(await repo.findByIdVisibleTo(viewerU1, 'c-here')).toEqual(before!);
	});

	// An archived contact still opens: the page is where they are brought back from.
	it('still finds an archived contact by id', async () => {
		await repo.setArchived('c-old', 1_700_000_000_000);

		expect((await repo.findByIdVisibleTo(viewerU1, 'c-old'))?.displayName).toBe('Old Neighbour');
	});

	it('lists the archived ones, which no other list shows', async () => {
		await repo.setArchived('c-old', 1_700_000_000_000);

		const archived = (await repo.listArchivedVisibleTo(viewerU1)).map((c) => c.id);
		expect(archived).toEqual(['c-old']);
		// positive control: it is the same visibility scope, so a private contact of another
		// member stays out of it even once archived.
		await repo.insert(contactInput({ id: 'c-theirs', visibility: 'private', createdBy: U2, displayName: 'Theirs' }));
		await repo.setArchived('c-theirs', 1_700_000_000_000);
		expect((await repo.listArchivedVisibleTo(viewerU1)).map((c) => c.id)).toEqual(['c-old']);
		expect((await repo.listArchivedVisibleTo(viewerU2)).map((c) => c.id).sort()).toEqual([
			'c-old',
			'c-theirs'
		]);
	});

	it('still names an archived contact, so a mention already written keeps their name', async () => {
		await repo.setArchived('c-old', 1_700_000_000_000);

		const names = await repo.listNamesVisibleTo(viewerU1);
		expect(names.find((c) => c.id === 'c-old')?.displayName).toBe('Old Neighbour');
		// It is still the visibility scope: another member's private contact stays out of it.
		await repo.insert(contactInput({ id: 'c-theirs', visibility: 'private', createdBy: U2, displayName: 'Theirs' }));
		expect((await repo.listNamesVisibleTo(viewerU1)).some((c) => c.id === 'c-theirs')).toBe(false);
		expect((await repo.listNamesVisibleTo(viewerU2)).some((c) => c.id === 'c-theirs')).toBe(true);
	});

	it('takes an archived contact out of the directory and the name suggestions', async () => {
		await repo.setArchived('c-old', 1_700_000_000_000);

		const listed = (await repo.listVisibleTo(viewerU1)).map((c) => c.id);
		expect(listed).not.toContain('c-old');
		// positive control: everyone still in the household is listed.
		expect(listed).toContain('c-here');

		const candidates = (await repo.listNameCandidatesVisibleTo(viewerU1)).map((c) => c.id);
		expect(candidates).not.toContain('c-old');
		expect(candidates).toContain('c-here');
	});
});

/*
 * Deleting a person for good (docs/02 §2.2): the row goes with everything hanging off it,
 * the bytes to unlink come back, and the log entry is written in the same transaction.
 */
describe('deleting a contact', () => {
	const audit = (over: Partial<NewActivityEntry> = {}): NewActivityEntry => ({
		id: 'log-1',
		householdId: H1,
		actorId: U1,
		action: 'delete',
		entityType: 'contact',
		entityId: 'c-gone',
		contactId: null,
		visibility: 'shared',
		summary: 'removed Gone Person',
		createdAt: 1_700_000_000_000,
		...over
	});

	beforeEach(async () => {
		await repo.insert(contactInput({ id: 'c-gone', displayName: 'Gone Person' }));
		await repo.insert(contactInput({ id: 'c-stays', displayName: 'Stays Here' }));
		db.insert(schema.note)
			.values({ id: 'n-1', contactId: 'c-gone', createdBy: U1, visibility: 'shared', body: 'a note' })
			.run();
		db.insert(schema.journalEntry)
			.values({ id: 'j-1', contactId: 'c-gone', createdBy: U1, visibility: 'shared', entryDate: '2025-01-01', body: 'an entry' })
			.run();
		db.insert(schema.photo)
			.values([
				{ id: 'p-gallery', householdId: H1, contactId: 'c-gone', createdBy: U1, filePath: 'g.jpg', thumbPath: 'g-t.jpg', mime: 'image/jpeg' },
				{ id: 'p-journal', householdId: H1, journalEntryId: 'j-1', createdBy: U1, filePath: 'j.jpg', thumbPath: 'j-t.jpg', mime: 'image/jpeg' },
				{ id: 'p-other', householdId: H1, contactId: 'c-stays', createdBy: U1, filePath: 'o.jpg', thumbPath: 'o-t.jpg', mime: 'image/jpeg' }
			])
			.run();
	});

	it('takes everything that hung off them, and nobody else', async () => {
		expect(await repo.deleteVisibleTo(viewerU1, 'c-gone', audit())).not.toBeNull();

		expect(await repo.findByIdVisibleTo(viewerU1, 'c-gone')).toBeNull();
		expect(db.select().from(schema.note).all()).toHaveLength(0);
		expect(db.select().from(schema.journalEntry).all()).toHaveLength(0);
		// positive control: the other person and their photo are untouched.
		expect((await repo.findByIdVisibleTo(viewerU1, 'c-stays'))?.displayName).toBe('Stays Here');
		expect(db.select().from(schema.photo).all().map((p) => p.id)).toEqual(['p-other']);
	});

	it('hands back the bytes of their gallery *and* their journal photos', async () => {
		// The journal entry cascades with the contact, so its photo would leave orphaned
		// bytes behind if only the gallery were collected.
		const files = await repo.deleteVisibleTo(viewerU1, 'c-gone', audit());

		expect(files?.map((f) => f.filePath).sort()).toEqual(['g.jpg', 'j.jpg']);
		expect(files?.map((f) => f.thumbPath).sort()).toEqual(['g-t.jpg', 'j-t.jpg']);
	});

	it('writes the log entry that outlives the row', async () => {
		await repo.deleteVisibleTo(viewerU1, 'c-gone', audit());

		const logged = db.select().from(schema.activityLog).all();
		expect(logged).toHaveLength(1);
		expect(logged[0]).toMatchObject({
			action: 'delete',
			entityType: 'contact',
			entityId: 'c-gone',
			summary: 'removed Gone Person',
			visibility: 'shared'
		});
	});

	it('deletes nothing, and logs nothing, for a contact the viewer may not see', async () => {
		await repo.insert(contactInput({ id: 'c-theirs', visibility: 'private', createdBy: U2, displayName: 'Theirs' }));

		expect(await repo.deleteVisibleTo(viewerU1, 'c-theirs', audit({ entityId: 'c-theirs' }))).toBeNull();
		expect((await repo.findByIdVisibleTo(viewerU2, 'c-theirs'))?.displayName).toBe('Theirs');
		expect(db.select().from(schema.activityLog).all()).toHaveLength(0);

		// positive control: their owner can delete them, and that does write a log row.
		expect(await repo.deleteVisibleTo(viewerU2, 'c-theirs', audit({ entityId: 'c-theirs' }))).not.toBeNull();
		expect(db.select().from(schema.activityLog).all()).toHaveLength(1);
	});
});
