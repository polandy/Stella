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
import { lastContactedOn, logInteraction } from '../domain/interactions/interactions';
import { listJournalForContact } from '../domain/journal/journal';
import type { MediaStore } from '../domain/media/avatars';
import { captureMoment } from '../domain/moments/moments';
import { listStoryPage } from '../domain/story/story';
import type { IdGenerator } from '../id';
import { createServices } from './app-services';
import type { AuthConfig } from './auth';
import { createStoryServices, type StoryWiring } from './story';

/*
 * The story group of the composition root (docs/08 §8.3), built over a real in-memory SQLite:
 * what the edge gets from `locals.services.story` must work end to end, and the journal and
 * interaction repositories must each exist once, so what capturing a moment or logging a
 * touchpoint writes, the story timeline reads.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 8, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };
const media: MediaStore = {
	put: async (key) => key,
	read: async () => null,
	delete: async () => {}
};

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let wiring: StoryWiring;
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
	wiring = { db, clock, ids, contacts: createDrizzleContactRepository(db), media };
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

describe('createStoryServices', () => {
	it('hands every journal use-case the one journal repository the edge reads', () => {
		const story = createStoryServices(wiring);
		expect(story.journalDeps.journal).toBe(story.journal);
		expect(story.captureMomentDeps.journal).toBe(story.journal);
		expect<unknown>(story.storyDeps.journal).toBe(story.journal);
	});

	it('hands every interaction use-case the one interaction repository the edge reads', () => {
		const story = createStoryServices(wiring);
		expect(story.interactionDeps.interactions).toBe(story.interactions);
		expect<unknown>(story.storyDeps.interactions).toBe(story.interactions);
	});

	it('wires the collaborators other contexts own, and the injected clock and ids', () => {
		const story = createStoryServices(wiring);
		expect(story.journalDeps.media).toBe(media);
		expect(story.captureMomentDeps.contacts).toBe(wiring.contacts);
		for (const deps of [story.journalDeps, story.interactionDeps, story.captureMomentDeps]) {
			expect(deps.clock).toBe(clock);
			expect(deps.ids).toBe(ids);
		}
	});

	it('shows a captured moment and a logged touchpoint on the one story timeline', async () => {
		const story = createStoryServices(wiring);
		const anna = await addPerson('Anna');
		const moment = await captureMoment(
			story.captureMomentDeps,
			{ ...authorOf(admin), locale: 'en' },
			{
				body: 'Coffee by the lake',
				entryDate: '2026-10-07',
				visibility: 'shared',
				newPeople: [],
				anchorId: anna
			}
		);
		const interactionId = await logInteraction(story.interactionDeps, authorOf(admin), {
			contactId: anna,
			kind: 'call',
			happenedAt: '2026-10-08'
		});

		const page = await listStoryPage(story.storyDeps, viewerOf(admin), anna, { limit: 10 });
		expect(
			page.items.map((item) => (item.kind === 'journal' ? item.entry.id : item.interaction.id))
		).toEqual([interactionId, moment.entryId]);
		const journal = await listJournalForContact(story.journalDeps, viewerOf(admin), anna);
		expect(journal.map((entry) => entry.id)).toEqual([moment.entryId]);
		expect(await lastContactedOn(story.interactionDeps, viewerOf(admin), anna)).toBe('2026-10-08');
	});
});

describe('createServices', () => {
	it("groups the story context under `story`, over people's contacts and media's store", () => {
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
		expect<unknown>(services.story.captureMomentDeps.contacts).toBe(services.people.contacts);
		expect<unknown>(services.story.journalDeps.media).toBe(services.media.store);
	});
});
