import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Command } from '../../commands/commands';
import { registerFirstAdmin, type AuthUser } from '../auth/accounts';
import { hashPassword, verifyPassword } from '../auth/password';
import type { Clock } from '../clock';
import { createDrizzleAccountRepository } from '../db/account-repository';
import * as schema from '../db/schema';
import { dispatchCommand, type CommandActor } from '../domain/commands/dispatch';
import { listContacts } from '../domain/contacts/directory';
import type { IdGenerator } from '../id';
import { createServices, type AppServices } from './app-services';
import type { AuthConfig } from './auth';
import { createOfflineServices } from './offline';

/*
 * The offline group of the composition root (docs/08 §8.3, docs/04 §4.11.2), built over a real
 * in-memory SQLite: what the edge gets from `locals.services.offline` must apply a command end
 * to end, and once — a resend answers with what the first run did, not a second person.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 8, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };

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

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let services: AppServices;
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
	services = createServices({
		// Nothing here touches a file or the network: the media store is lazy on disk.
		config: {
			...config,
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
});

const actorOf = (user: AuthUser): CommandActor => ({
	userId: user.id,
	householdId: user.householdId,
	locale: 'en'
});

const addAnna: Command = {
	id: 'cmd-anna',
	type: 'contact.add',
	payload: {
		firstName: 'Anna',
		lastName: 'Pollari',
		nickname: '',
		description: '',
		howWeMet: '',
		metPlace: '',
		birthDate: '',
		gender: null,
		visibility: 'shared',
		isSelf: false
	},
	issuedAt: clock.now()
};

describe('createOfflineServices', () => {
	it('hands the dispatcher the one receipt book the group holds, and the injected clock', () => {
		const offline = createOfflineServices({ db, clock, contexts: services });
		expect(offline.commandDeps.receipts).toBe(offline.receipts);
		expect(offline.commandDeps.clock).toBe(clock);
	});

	it('knows no entry the member did not write', async () => {
		const offline = createOfflineServices({ db, clock, contexts: services });
		expect(await offline.entries.ownsEntry(admin.id, 'no-such-entry')).toBe(false);
	});
});

describe('createServices', () => {
	it('groups the offline context under `offline`', () => {
		expect(services.offline.commandDeps.receipts).toBe(services.offline.receipts);
		expect(services.offline.commandDeps.clock).toBe(clock);
	});

	it('applies a command once: the resend answers with the person the first run added', async () => {
		const { commandDeps } = services.offline;
		const first = await dispatchCommand(commandDeps, actorOf(admin), addAnna);
		const again = await dispatchCommand(commandDeps, actorOf(admin), addAnna);

		if (first.status !== 'applied' || again.status !== 'applied') {
			throw new Error('both runs should answer applied');
		}
		expect(first.repeated).toBe(false);
		expect(again.repeated).toBe(true);
		expect(again.result).toEqual(first.result);
		const people = await listContacts(services.people.contactDirectoryDeps, {
			id: admin.id,
			householdId: admin.householdId
		});
		expect(people.map((person) => person.firstName)).toEqual(['Anna']);
	});
});
