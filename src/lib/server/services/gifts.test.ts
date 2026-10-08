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
import { addGift, listGiftsForContact, markGiftGiven } from '../domain/gifts/gifts';
import { listStoryPage } from '../domain/story/story';
import type { IdGenerator } from '../id';
import { createServices } from './app-services';
import type { AuthConfig } from './auth';
import { createGiftServices, type GiftWiring } from './gifts';

/*
 * The gifts group of the composition root (docs/08 §8.3), built over a real in-memory SQLite:
 * what the edge gets from `locals.services.gifts` must work end to end — a gift noted through
 * the group shows on its person, and once given it is in their story, read from the same row.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 8, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let wiring: GiftWiring;
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
	wiring = { db, clock, ids, contacts: createDrizzleContactRepository(db) };
});

const viewerOf = (user: AuthUser) => ({ id: user.id, householdId: user.householdId });
const actorOf = (user: AuthUser) => ({ userId: user.id, householdId: user.householdId });

async function addPerson(firstName: string) {
	return createContact(
		{ contacts: createDrizzleContactRepository(db), ids, clock },
		{ ...actorOf(admin), defaultVisibility: 'shared', locale: 'en' },
		{ firstName, lastName: 'Pollari' }
	);
}

const SERVICES_CONFIG: AuthConfig = {
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

describe('createGiftServices', () => {
	it('hands the gift use-cases the one gift repository the edge reads', () => {
		const gifts = createGiftServices(wiring);
		expect(gifts.giftDeps.gifts).toBe(gifts.gifts);
		expect(gifts.giftDeps.contacts).toBe(wiring.contacts);
	});

	it('wires the injected clock and ids', () => {
		const gifts = createGiftServices(wiring);
		expect(gifts.giftDeps.clock).toBe(clock);
		expect(gifts.giftDeps.ids).toBe(ids);
	});

	it('shows a noted idea on its person', async () => {
		const gifts = createGiftServices(wiring);
		const hilde = await addPerson('Hilde');
		const { giftId } = await addGift(gifts.giftDeps, actorOf(admin), {
			contactId: hilde,
			state: 'idea',
			title: 'Teapot',
			note: null,
			url: null,
			givenOn: null,
			occasion: null,
			visibility: 'shared'
		});
		const listed = await listGiftsForContact(gifts.giftDeps, viewerOf(admin), hilde);
		expect(listed.map((gift) => gift.id)).toEqual([giftId]);
	});
});

describe('createServices', () => {
	function services() {
		return createServices({
			// Nothing here touches a file: the media store is lazy on disk.
			config: {
				...SERVICES_CONFIG,
				immich: null,
				sessionSecret: 'a-session-secret',
				updateCheck: false,
				updateFeedUrl: '',
				mediaDir: '/nonexistent/stella-media'
			},
			db,
			sqlite,
			clock,
			ids,
			version: '1.0.0'
		});
	}

	it('groups the gifts context under `gifts`, over the people context’s contacts', () => {
		const all = services();
		expect(all.gifts.giftDeps.gifts).toBe(all.gifts.gifts);
		expect(all.gifts.giftDeps.contacts).toBe(all.people.contacts);
	});

	it('reads a given gift into the story from the gifts context’s repository', async () => {
		const all = services();
		expect(all.story.storyDeps.gifts).toBe(all.gifts.gifts);

		const hilde = await addPerson('Hilde');
		const { giftId } = await addGift(all.gifts.giftDeps, actorOf(admin), {
			contactId: hilde,
			state: 'idea',
			title: 'Teapot',
			note: null,
			url: null,
			givenOn: null,
			occasion: null,
			visibility: 'shared'
		});
		await markGiftGiven(all.gifts.giftDeps, actorOf(admin), {
			contactId: hilde,
			giftId,
			givenOn: '2026-10-08',
			occasion: 'birthday'
		});
		const page = await listStoryPage(all.story.storyDeps, viewerOf(admin), hilde, { limit: 5 });
		expect(page.items.map((item) => item.kind)).toEqual(['gift']);
	});
});
