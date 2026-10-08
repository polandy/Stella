import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { toFtsQuery } from '../domain/search/query';
import * as schema from './schema';
import { ensureSearchIndex } from './search-index';
import { createDrizzleSearchRepository } from './search-repository';

/*
 * Integration spec for FTS search: matching via the triggers-maintained index plus the
 * central visibility scoping (private contacts/notes must not leak, docs/02 §2.9, §3.7).
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleSearchRepository>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	ensureSearchIndex(sqlite); // create FTS + triggers before inserts

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
				id: 'c-hans',
				householdId: H,
				createdBy: U1,
				visibility: 'shared',
				displayName: 'Hans Müller'
			},
			{
				id: 'c-secret',
				householdId: H,
				createdBy: U1,
				visibility: 'private',
				displayName: 'Secretina'
			}
		])
		.run();
	db.insert(schema.note)
		.values([
			{
				id: 'n-shared',
				contactId: 'c-hans',
				createdBy: U1,
				visibility: 'shared',
				body: 'Met at the lake'
			},
			{
				id: 'n-priv',
				contactId: 'c-hans',
				createdBy: U1,
				visibility: 'private',
				body: 'secret lake meeting'
			}
		])
		.run();

	repo = createDrizzleSearchRepository(db);
});

describe('searchContacts', () => {
	it('matches contacts by a prefix query', async () => {
		const hits = await repo.searchContacts(viewerU1, toFtsQuery('hans'), 20);
		expect(hits.map((h) => h.id)).toEqual(['c-hans']);
	});

	it('does not leak a private contact to other members', async () => {
		expect(await repo.searchContacts(viewerU2, toFtsQuery('secretina'), 20)).toHaveLength(0);
		expect(await repo.searchContacts(viewerU1, toFtsQuery('secretina'), 20)).toHaveLength(1);
	});

	it("carries a found person's photo, so the result shows their face", async () => {
		db.update(schema.contact)
			.set({ avatarPhotoId: 'photo-hans' })
			.where(eq(schema.contact.id, 'c-hans'))
			.run();

		const [hans] = await repo.searchContacts(viewerU1, toFtsQuery('hans'), 20);
		expect(hans.avatarPhotoId).toBe('photo-hans');
		const [secretina] = await repo.searchContacts(viewerU1, toFtsQuery('secretina'), 20);
		expect(secretina.avatarPhotoId).toBeNull();
	});

	it('matches the job title and the company, and carries them for the row (docs/02 §2.2)', async () => {
		db.update(schema.contact)
			.set({ jobTitle: 'Schreiner', company: 'Holzbau Keller' })
			.where(eq(schema.contact.id, 'c-hans'))
			.run();

		const byTitle = await repo.searchContacts(viewerU1, toFtsQuery('schrein'), 20);
		const byCompany = await repo.searchContacts(viewerU1, toFtsQuery('holzbau'), 20);

		expect(byTitle.map((h) => h.id)).toEqual(['c-hans']);
		expect(byCompany).toMatchObject([
			{ id: 'c-hans', jobTitle: 'Schreiner', company: 'Holzbau Keller' }
		]);
	});

	it('stops finding a contact once they are archived', async () => {
		db.update(schema.contact)
			.set({ archivedAt: 1_700_000_000_000 })
			.where(eq(schema.contact.id, 'c-hans'))
			.run();

		expect(await repo.searchContacts(viewerU1, toFtsQuery('hans'), 20)).toHaveLength(0);
		// positive control: the same query found them a moment ago, and still finds the rest.
		expect(await repo.searchContacts(viewerU1, toFtsQuery('secretina'), 20)).toHaveLength(1);
	});
});

describe('searchNotes', () => {
	it('matches note bodies and returns the contact context', async () => {
		const hits = await repo.searchNotes(viewerU1, toFtsQuery('lake'), 20);
		expect(hits.map((h) => h.noteId).sort()).toEqual(['n-priv', 'n-shared']);
		expect(hits.find((h) => h.noteId === 'n-shared')?.contactName).toBe('Hans Müller');
	});

	it('hides a private note from other members', async () => {
		const hits = await repo.searchNotes(viewerU2, toFtsQuery('lake'), 20);
		expect(hits.map((h) => h.noteId)).toEqual(['n-shared']);
	});
});

/*
 * A mention is stored as `@{contact:<id>}` (docs/02 §2.20.1), so the raw body is the wrong
 * thing to index: the person's name is gone from it and the word "contact" is in every note
 * that names anyone. The index carries the mentioned names instead of the token.
 */
describe('searching a note that mentions someone', () => {
	beforeEach(() => {
		db.insert(schema.note)
			.values({
				id: 'n-mention',
				contactId: 'c-hans',
				createdBy: U1,
				visibility: 'shared',
				body: 'walked home with @{contact:c-secret}'
			})
			.run();
		db.insert(schema.noteMention).values({ noteId: 'n-mention', contactId: 'c-secret' }).run();
	});

	it('finds it by the name of the person it mentions', async () => {
		const hits = await repo.searchNotes(viewerU1, toFtsQuery('secretina'), 20);
		expect(hits.map((h) => h.noteId)).toEqual(['n-mention']);
	});

	it('does not turn the token into the searchable word "contact"', async () => {
		expect(await repo.searchNotes(viewerU1, toFtsQuery('contact'), 20)).toHaveLength(0);
		// positive control: the rest of that same body is indexed and findable.
		expect(
			(await repo.searchNotes(viewerU1, toFtsQuery('walked'), 20)).map((h) => h.noteId)
		).toEqual(['n-mention']);
	});

	it('forgets the name once the note stops mentioning them', async () => {
		db.delete(schema.noteMention).where(eq(schema.noteMention.noteId, 'n-mention')).run();
		expect(await repo.searchNotes(viewerU1, toFtsQuery('secretina'), 20)).toHaveLength(0);
		expect(await repo.searchNotes(viewerU1, toFtsQuery('walked'), 20)).toHaveLength(1);
	});

	it('follows a rename of the mentioned person', async () => {
		db.update(schema.contact)
			.set({ displayName: 'Cordelia' })
			.where(eq(schema.contact.id, 'c-secret'))
			.run();
		expect(
			(await repo.searchNotes(viewerU1, toFtsQuery('cordelia'), 20)).map((h) => h.noteId)
		).toEqual(['n-mention']);
		expect(await repo.searchNotes(viewerU1, toFtsQuery('secretina'), 20)).toHaveLength(0);
	});
});

/*
 * Gifts are found by their title and their note — not by the link, which is a shop's address,
 * nor by the occasion, which is a preset key in one language (docs/02 §2.9, §2.25.5).
 */
describe('searchGifts', () => {
	beforeEach(() => {
		db.insert(schema.gift)
			.values([
				{
					id: 'g-book',
					contactId: 'c-hans',
					createdBy: U1,
					visibility: 'shared',
					state: 'given',
					title: 'Fotobuch Sommer',
					note: 'mit den Bildern vom Zeltlager',
					url: 'https://shop.example/teekanne',
					givenOn: '2025-12-24',
					occasion: 'christmas'
				},
				{
					id: 'g-private',
					contactId: 'c-hans',
					createdBy: U1,
					visibility: 'private',
					state: 'idea',
					title: 'Fotobuch Winter'
				},
				{
					id: 'g-on-secret',
					contactId: 'c-secret',
					createdBy: U1,
					visibility: 'shared',
					state: 'received',
					title: 'Fotobuch Hochzeit',
					givenOn: '2024-06-01'
				}
			])
			.run();
	});

	it('matches the title and returns the person it is for and its state', async () => {
		const hits = await repo.searchGifts(viewerU1, toFtsQuery('fotobuch'), 20);
		expect(hits.map((h) => h.giftId).sort()).toEqual(['g-book', 'g-on-secret', 'g-private']);
		expect(hits.find((h) => h.giftId === 'g-book')).toMatchObject({
			title: 'Fotobuch Sommer',
			state: 'given',
			givenOn: '2025-12-24',
			contactId: 'c-hans',
			contactName: 'Hans Müller'
		});
	});

	it('matches the note', async () => {
		const hits = await repo.searchGifts(viewerU1, toFtsQuery('zeltlager'), 20);
		expect(hits.map((h) => h.giftId)).toEqual(['g-book']);
	});

	it('does not match the link or the occasion', async () => {
		expect(await repo.searchGifts(viewerU1, toFtsQuery('teekanne'), 20)).toHaveLength(0);
		expect(await repo.searchGifts(viewerU1, toFtsQuery('christmas'), 20)).toHaveLength(0);
	});

	it('finds a private gift only for its author, and none on a person the viewer cannot see', async () => {
		const hits = await repo.searchGifts(viewerU2, toFtsQuery('fotobuch'), 20);
		expect(hits.map((h) => h.giftId)).toEqual(['g-book']);
	});

	it('follows an edit and a removal', async () => {
		db.update(schema.gift)
			.set({ title: 'Kalender', note: null })
			.where(eq(schema.gift.id, 'g-book'))
			.run();
		expect(
			(await repo.searchGifts(viewerU1, toFtsQuery('kalender'), 20)).map((h) => h.giftId)
		).toEqual(['g-book']);
		expect(await repo.searchGifts(viewerU1, toFtsQuery('zeltlager'), 20)).toHaveLength(0);

		db.delete(schema.gift).where(eq(schema.gift.id, 'g-book')).run();
		expect(await repo.searchGifts(viewerU1, toFtsQuery('kalender'), 20)).toHaveLength(0);
	});

	it('goes with the person it is for', async () => {
		db.delete(schema.contact).where(eq(schema.contact.id, 'c-secret')).run();
		const rows = await repo.searchGifts(viewerU1, toFtsQuery('hochzeit'), 20);
		expect(rows).toHaveLength(0);
	});
});
