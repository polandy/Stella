import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { registerFirstAdmin, type AuthUser } from '../auth/accounts';
import { hashPassword, verifyPassword } from '../auth/password';
import type { Clock } from '../clock';
import { createDrizzleAccountRepository } from '../db/account-repository';
import { createDrizzleContactRepository } from '../db/contact-repository';
import * as schema from '../db/schema';
import { createContact } from '../domain/contacts/contacts';
import { listMentionedIn } from '../domain/mentions/mentioned-in';
import { createNote, listNotesForContact, setNoteMentions } from '../domain/notes/notes';
import type { IdGenerator } from '../id';
import { createServices } from './app-services';
import type { AuthConfig } from './auth';
import { createNoteServices, type NoteWiring } from './notes';

/*
 * The notes group of the composition root (docs/08 §8.3), built over a real in-memory SQLite:
 * what the edge gets from `locals.services.notes` must work end to end — a note written through
 * the group shows on its person, and a person it names finds it under "Mentioned in".
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 8, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let wiring: NoteWiring;
let admin: AuthUser;

beforeEach(async () => {
	counter = 0;
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	admin = await registerFirstAdmin(
		{ accounts: createDrizzleAccountRepository(db), ids, hashPassword, verifyPassword },
		{
			householdName: 'Pollari',
			email: 'andy@example.test',
			name: 'Andy',
			password: 'correct horse battery',
			locale: 'en'
		}
	);
	wiring = { db, clock, ids };
});

const viewerOf = (user: AuthUser) => ({ id: user.id, householdId: user.householdId });
const authorOf = (user: AuthUser) => ({
	userId: user.id,
	householdId: user.householdId,
	defaultVisibility: 'shared' as const
});

async function addPerson(firstName: string) {
	return createContact(
		{ contacts: createDrizzleContactRepository(db), ids, clock },
		{ ...authorOf(admin), locale: 'en' },
		{ firstName, lastName: 'Pollari' }
	);
}

describe('createNoteServices', () => {
	it('hands the note use-cases the one note repository the edge reads', () => {
		const notes = createNoteServices(wiring);
		expect(notes.noteDeps.notes).toBe(notes.notes);
	});

	it('hands the "Mentioned in" read the one mention repository the edge reads', () => {
		const notes = createNoteServices(wiring);
		expect(notes.mentionedInDeps.mentions).toBe(notes.mentionedIn);
	});

	it('wires the injected clock and ids', () => {
		const notes = createNoteServices(wiring);
		expect(notes.noteDeps.clock).toBe(clock);
		expect(notes.noteDeps.ids).toBe(ids);
	});

	it('shows a written note on its person and under "Mentioned in" on whom it names', async () => {
		const notes = createNoteServices(wiring);
		const anna = await addPerson('Anna');
		const ben = await addPerson('Ben');
		const noteId = await createNote(notes.noteDeps, authorOf(admin), {
			contactId: anna,
			body: 'Met Ben at the lake'
		});
		await setNoteMentions(notes.noteDeps, noteId, [ben]);

		const onAnna = await listNotesForContact(notes.noteDeps, viewerOf(admin), anna);
		expect(onAnna.map((note) => note.id)).toEqual([noteId]);
		const onBen = await listMentionedIn(notes.mentionedInDeps, viewerOf(admin), ben);
		expect(onBen.map((mention) => [mention.kind, mention.entryId])).toEqual([['note', noteId]]);
	});
});

describe('createServices', () => {
	it('groups the notes context under `notes`', () => {
		const config: AuthConfig = {
			url: 'https://stella.example.test',
			auth: { local: true, oidc: false },
			oidc: {
				issuer: '',
				clientId: '',
				clientSecret: '',
				redirectUri: '',
				scopes: 'openid',
				providerName: 'authelia',
				allowedGroups: [],
				adminGroups: [],
				allowedEmails: [],
				jitProvision: false,
				linkByEmail: false,
				syncRoles: false,
				syncProfile: false,
				rpLogout: false
			}
		};
		const services = createServices({
			// Nothing here touches a file: the media store is lazy on disk.
			config: { ...config, mediaDir: '/nonexistent/stella-media' },
			db,
			sqlite,
			clock,
			ids
		});
		expect(services.notes.noteDeps.notes).toBe(services.notes.notes);
		expect(services.notes.noteDeps.clock).toBe(clock);
	});
});
