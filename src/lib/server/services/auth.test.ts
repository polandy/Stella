import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { registerFirstAdmin } from '../auth/accounts';
import { createSession, validateSessionToken } from '../auth/session';
import { SIGNED_OUT_PATH } from '../auth/oidc/logout';
import type { Clock } from '../clock';
import * as schema from '../db/schema';
import type { IdGenerator } from '../id';
import { createAuthServices, type AuthConfig } from './auth';
import { createServices } from './app-services';

/*
 * The auth group of the composition root (docs/08 §8.3), built over a real in-memory SQLite:
 * what the edge gets from `locals.services.auth` must work end to end, and each repository
 * must exist once, so the raw `accounts` an edge reads is the one the use-cases write.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 7, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };

const config: AuthConfig = {
	url: 'https://stella.example.test',
	auth: { local: true, oidc: true },
	oidc: {
		issuer: 'https://auth.example.test',
		clientId: 'stella',
		clientSecret: 'secret',
		redirectUri: 'https://stella.example.test/login/sso/callback',
		scopes: 'openid profile email groups',
		providerName: 'authelia',
		allowedGroups: ['family'],
		adminGroups: ['admins'],
		allowedEmails: [],
		jitProvision: true,
		linkByEmail: false,
		syncRoles: true,
		syncProfile: false,
		rpLogout: true
	}
};

let db: BunSQLiteDatabase<typeof schema>;

beforeEach(() => {
	counter = 0;
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
});

describe('createAuthServices', () => {
	it('wires accounts and sessions to the same database, one repository each', async () => {
		const auth = createAuthServices({ config, db, clock, ids });
		expect(auth.accountDeps.accounts).toBe(auth.accounts);

		expect(await auth.accounts.countUsers()).toBe(0);
		const admin = await registerFirstAdmin(auth.accountDeps, {
			householdName: 'Pollari',
			email: 'andy@example.test',
			name: 'Andy',
			password: 'correct horse battery',
			locale: 'en'
		});
		expect(await auth.accounts.countUsers()).toBe(1);

		const { token } = await createSession(auth.sessionDeps, admin.id);
		expect((await validateSessionToken(auth.sessionDeps, token))?.userId).toBe(admin.id);
	});

	it('hands the injected clock and ids to the token, import and OIDC use-cases', () => {
		const auth = createAuthServices({ config, db, clock, ids });
		expect(auth.apiTokenDeps.clock).toBe(clock);
		expect(auth.apiTokenDeps.ids).toBe(ids);
		expect(auth.apiImportDeps.clock).toBe(clock);
		expect(auth.apiImportDeps.ids).toBe(ids);
		expect(auth.completeLoginDeps.clock).toBe(clock);
	});

	it('reads the OIDC settings off the config', () => {
		const auth = createAuthServices({ config, db, clock, ids });
		expect(auth.authorizationRequestDeps.config).toEqual({
			clientId: 'stella',
			redirectUri: 'https://stella.example.test/login/sso/callback',
			scopes: 'openid profile email groups'
		});
		expect(auth.completeLoginDeps.policy).toEqual({
			allowedGroups: ['family'],
			adminGroups: ['admins'],
			allowedEmails: [],
			jitProvision: true,
			linkByEmail: false,
			syncRoles: true,
			syncProfile: false
		});
		expect(auth.rpLogoutDeps).toMatchObject({
			enabled: true,
			clientId: 'stella',
			postLogoutRedirectUri: `https://stella.example.test${SIGNED_OUT_PATH}`
		});
	});

	it('shares one OIDC provider between sign-in, its callback and sign-out', () => {
		const auth = createAuthServices({ config, db, clock, ids });
		expect(auth.authorizationRequestDeps.provider).toBe(auth.completeLoginDeps.provider);
		expect(auth.rpLogoutDeps.provider).toBe(auth.completeLoginDeps.provider);
	});

	it('keeps RP logout off while SSO itself is off', () => {
		const auth = createAuthServices({
			config: { ...config, auth: { local: true, oidc: false } },
			db,
			clock,
			ids
		});
		expect(auth.rpLogoutDeps.enabled).toBe(false);
	});
});

describe('createServices', () => {
	it('groups the auth context under `auth`', async () => {
		const services = createServices({
			// Nothing here touches a file: the media store is lazy on disk.
			config: { ...config, mediaDir: '/nonexistent/stella-media' },
			db,
			clock,
			ids
		});
		expect(await services.auth.accounts.countUsers()).toBe(0);
	});
});
