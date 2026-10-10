import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { createDrizzleNoteRepository } from '../../db/note-repository';
import * as schema from '../../db/schema';
import { ensureSearchIndex } from '../../db/search-index';
import type { ContactSummary } from '../contacts/contacts';
import { AmbiguousMentionError } from '../mentions/resolve-for-audience';
import { fixedClock } from '../testing';
import { editNote, type EditNoteDeps } from './edit-note';
import { EmptyNoteError } from './notes';

/*
 * Editing a note (docs/02 §2.5, docs/03 §3.7): its author alone, title and body. Wired to the
 * real Drizzle adapter on an in-memory database, because what an edit rebuilds — mentions and
 * the search row — lives there.
 */

const H = 'household-1';
const AUTHOR = 'user-nina';
const ADMIN = 'user-andy';
const MEMBER = 'user-mia';

const nina = { userId: AUTHOR, householdId: H };
const NOW = 1_760_000_000_000;

type PersonSeed = { id: string; name: string; visibility?: 'shared' | 'private'; owner?: string };
const PEOPLE: PersonSeed[] = [
	{ id: 'c-kurt', name: 'Kurt' },
	{ id: 'c-anna', name: 'Anna' },
	{ id: 'c-bob', name: 'Bob' },
	{ id: 'c-secret', name: 'Hidden', visibility: 'private', owner: AUTHOR },
	{ id: 'c-thomas-1', name: 'Thomas' },
	{ id: 'c-thomas-2', name: 'Thomas' }
];

const summary = (p: PersonSeed): ContactSummary => ({
	id: p.id,
	displayName: p.name,
	firstName: null,
	lastName: null,
	nickname: null,
	formerName: null,
	jobTitle: null,
	company: null,
	description: null,
	metPlace: null,
	metDate: null,
	visibility: p.visibility ?? 'shared',
	avatarPhotoId: null,
	birthDate: null
});

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let deps: EditNoteDeps;

function addNote(id: string, over: Partial<typeof schema.note.$inferInsert> = {}) {
	db.insert(schema.note)
		.values({
			id,
			contactId: 'c-kurt',
			createdBy: AUTHOR,
			visibility: 'shared',
			title: 'Old title',
			body: 'oldword',
			isPinned: 1,
			createdAt: 5,
			updatedAt: 5,
			...over
		})
		.run();
}
const rowOf = (id: string) => db.select().from(schema.note).where(eq(schema.note.id, id)).get();
const mentioned = (id: string) => createDrizzleNoteRepository(db).listMentionedContactIds(id);
const found = (word: string) =>
	(
		sqlite.query('SELECT note_id FROM note_fts WHERE note_fts MATCH ?').all(word) as {
			note_id: string;
		}[]
	).map((r) => r.note_id);

beforeEach(() => {
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	ensureSearchIndex(sqlite);
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: AUTHOR, householdId: H, email: 'nina@x.test', name: 'Nina' },
			{ id: ADMIN, householdId: H, email: 'andy@x.test', name: 'Andy', role: 'admin' },
			{ id: MEMBER, householdId: H, email: 'mia@x.test', name: 'Mia' }
		])
		.run();
	db.insert(schema.contact)
		.values(
			PEOPLE.map((p) => ({
				id: p.id,
				householdId: H,
				createdBy: p.owner ?? ADMIN,
				visibility: p.visibility ?? 'shared',
				displayName: p.name
			}))
		)
		.run();
	deps = {
		notes: createDrizzleNoteRepository(db),
		clock: fixedClock(NOW),
		directory: { listVisibleTo: async () => PEOPLE.map(summary) }
	};
});

describe('editNote: title and body', () => {
	it('rewrites title and body, and touches nothing else', async () => {
		addNote('n', { visibility: 'private' });

		expect(await editNote(deps, nina, { id: 'n', title: '  New title ', body: ' newword ' })).toBe(
			true
		);

		expect(rowOf('n')).toMatchObject({
			title: 'New title',
			body: 'newword',
			updatedAt: NOW,
			createdAt: 5,
			isPinned: 1,
			visibility: 'private',
			createdBy: AUTHOR,
			contactId: 'c-kurt'
		});
	});

	it('turns a blank title into none', async () => {
		addNote('n');
		await editNote(deps, nina, { id: 'n', title: '   ', body: 'text' });
		expect(rowOf('n')!.title).toBeNull();
		await editNote(deps, nina, { id: 'n', body: 'text' });
		expect(rowOf('n')!.title).toBeNull();
	});

	it('refuses an empty body, changing nothing', async () => {
		addNote('n');
		for (const body of ['', '  \n ']) {
			await expect(editNote(deps, nina, { id: 'n', body })).rejects.toBeInstanceOf(EmptyNoteError);
		}
		expect(rowOf('n')).toMatchObject({ title: 'Old title', body: 'oldword', updatedAt: 5 });
	});
});

describe('editNote: who may', () => {
	it("refuses another member, and an admin, on the author's shared note", async () => {
		addNote('n');
		addNote('control');
		const admin = { userId: ADMIN, householdId: H };
		const member = { userId: MEMBER, householdId: H };

		expect(await editNote(deps, admin, { id: 'n', body: 'rewritten' })).toBe(false);
		expect(await editNote(deps, member, { id: 'n', body: 'rewritten' })).toBe(false);
		expect(await editNote(deps, nina, { id: 'control', body: 'rewritten' })).toBe(true);

		expect(rowOf('n')).toMatchObject({ body: 'oldword', updatedAt: 5 });
	});

	it('answers a gone note like a refusal', async () => {
		expect(await editNote(deps, nina, { id: 'never', body: 'text' })).toBe(false);
	});
});

describe('editNote: mentions', () => {
	it('rebuilds them: A before, B after', async () => {
		addNote('n', { body: 'with @{contact:c-anna}' });
		db.insert(schema.noteMention).values({ noteId: 'n', contactId: 'c-anna' }).run();

		await editNote(deps, nina, { id: 'n', body: 'with @{contact:c-bob}' });

		expect(await mentioned('n')).toEqual(['c-bob']);
	});

	it('adds no link for the note’s own subject', async () => {
		addNote('n');
		await editNote(deps, nina, { id: 'n', body: '@{contact:c-kurt} and @{contact:c-anna}' });
		expect(await mentioned('n')).toEqual(['c-anna']);
	});

	it('does not link a private contact from a shared note, but does from a private one', async () => {
		addNote('shared');
		addNote('private', { visibility: 'private' });

		await editNote(deps, nina, { id: 'shared', body: 'with @{contact:c-secret}' });
		await editNote(deps, nina, { id: 'private', body: 'with @{contact:c-secret}' });

		expect(await mentioned('shared')).toEqual([]);
		expect(await mentioned('private')).toEqual(['c-secret']);
	});

	it('asks about an ambiguous handle, writing nothing', async () => {
		addNote('n', { body: 'with @{contact:c-anna}' });
		db.insert(schema.noteMention).values({ noteId: 'n', contactId: 'c-anna' }).run();

		await expect(editNote(deps, nina, { id: 'n', body: 'with @Thomas' })).rejects.toBeInstanceOf(
			AmbiguousMentionError
		);

		expect(rowOf('n')).toMatchObject({ body: 'with @{contact:c-anna}', updatedAt: 5 });
		expect(await mentioned('n')).toEqual(['c-anna']);
	});
});

describe('editNote: search and activity', () => {
	it('finds the new words and no longer the old', async () => {
		addNote('n', { body: 'oldword' });
		expect(found('oldword')).toEqual(['n']);

		await editNote(deps, nina, { id: 'n', body: 'newword' });

		expect(found('newword')).toEqual(['n']);
		expect(found('oldword')).toEqual([]);
	});

	it('finds a note by the display name of a newly mentioned person', async () => {
		addNote('n', { body: 'plain' });
		expect(found('Anna')).toEqual([]);

		await editNote(deps, nina, { id: 'n', body: 'now with @{contact:c-anna}' });

		expect(found('Anna')).toEqual(['n']);
	});

	it('writes no activity entry (docs/02 §2.11)', async () => {
		addNote('n');
		await editNote(deps, nina, { id: 'n', title: 'T', body: 'edited' });
		expect(db.select().from(schema.activityLog).all()).toEqual([]);
	});
});
