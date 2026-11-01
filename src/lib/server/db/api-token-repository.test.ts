import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import {
	authenticateApiToken,
	issueApiToken,
	listApiTokens,
	revokeApiToken,
	type ApiTokenDeps
} from '../auth/api-tokens';
import {
	authenticateCalendarLink,
	calendarLinkOf,
	issueCalendarLink,
	revokeCalendarLink
} from '../auth/calendar-link';
import { createDrizzleApiTokenRepository } from './api-token-repository';
import * as schema from './schema';

/*
 * Integration spec for the ApiTokenRepository adapter, driven through the token use-cases:
 * the round trip from minting to signing in, the newest-first list, and that a token goes
 * with its member — and that an API token and a calendar link never open each other's door.
 */

const DAY = 24 * 60 * 60 * 1000;
let db: BunSQLiteDatabase<typeof schema>;
let now: number;
let deps: ApiTokenDeps;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: 'h', name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: 'user-1', householdId: 'h', email: 'u1@x.test', name: 'One' },
			{ id: 'user-2', householdId: 'h', email: 'u2@x.test', name: 'Two' }
		])
		.run();
	now = 1_700_000_000_000;
	let seq = 0;
	deps = {
		tokens: createDrizzleApiTokenRepository(db),
		clock: { now: () => now },
		ids: { next: () => `tok-${++seq}` }
	};
});

describe('the API token adapter', () => {
	it('signs a minted token in and records when', async () => {
		const { token } = await issueApiToken(deps, 'user-1', { name: 'script', lifetimeDays: 30 });
		now += DAY;
		expect(await authenticateApiToken(deps, token)).toBe('user-1');
		expect((await listApiTokens(deps, 'user-1'))[0].lastUsedAt).toBe(now);
	});

	it('lists a member’s tokens newest first, and nobody else’s', async () => {
		await issueApiToken(deps, 'user-1', { name: 'older', lifetimeDays: 30 });
		now += 1;
		await issueApiToken(deps, 'user-1', { name: 'newer', lifetimeDays: 30 });
		await issueApiToken(deps, 'user-2', { name: 'theirs', lifetimeDays: 30 });
		expect((await listApiTokens(deps, 'user-1')).map((t) => t.name)).toEqual(['newer', 'older']);
	});

	it('withdraws only the member’s own token', async () => {
		const { id, token } = await issueApiToken(deps, 'user-1', { name: 'script', lifetimeDays: 30 });
		expect(await revokeApiToken(deps, 'user-2', id)).toBe(false);
		expect(await authenticateApiToken(deps, token)).toBe('user-1');
		expect(await revokeApiToken(deps, 'user-1', id)).toBe(true);
		expect(await authenticateApiToken(deps, token)).toBeNull();
	});

	it('goes with its member', async () => {
		const { token } = await issueApiToken(deps, 'user-2', { name: 'script', lifetimeDays: 30 });
		expect(await authenticateApiToken(deps, token)).toBe('user-2');
		db.delete(schema.user).run();
		expect(db.select().from(schema.apiToken).all()).toEqual([]);
		expect(await authenticateApiToken(deps, token)).toBeNull();
	});
});

describe('the calendar link', () => {
	it('opens its member’s feed, lasts until revoked, and records when it was fetched', async () => {
		const token = await issueCalendarLink(deps, 'user-1');
		expect(await calendarLinkOf(deps, 'user-1')).toEqual({ createdAt: now, lastUsedAt: null });
		now += 3650 * DAY;
		expect(await authenticateCalendarLink(deps, token)).toBe('user-1');
		expect(await calendarLinkOf(deps, 'user-1')).toEqual({
			createdAt: now - 3650 * DAY,
			lastUsedAt: now
		});
	});

	it('is one per member: a new link replaces the old one', async () => {
		const old = await issueCalendarLink(deps, 'user-1');
		const theirs = await issueCalendarLink(deps, 'user-2');
		now += 1;
		const fresh = await issueCalendarLink(deps, 'user-1');
		expect(await authenticateCalendarLink(deps, old)).toBeNull();
		expect(await authenticateCalendarLink(deps, fresh)).toBe('user-1');
		expect(await authenticateCalendarLink(deps, theirs)).toBe('user-2');
		expect((await calendarLinkOf(deps, 'user-1'))?.createdAt).toBe(now);
	});

	it('stops working the moment it is revoked', async () => {
		const token = await issueCalendarLink(deps, 'user-1');
		expect(await revokeCalendarLink(deps, 'user-1')).toBe(true);
		expect(await authenticateCalendarLink(deps, token)).toBeNull();
		expect(await calendarLinkOf(deps, 'user-1')).toBeNull();
		expect(await revokeCalendarLink(deps, 'user-1')).toBe(false);
	});

	it('never signs in to the API, and an API token never opens the feed', async () => {
		const link = await issueCalendarLink(deps, 'user-1');
		const { token } = await issueApiToken(deps, 'user-1', { name: 'script', lifetimeDays: 30 });
		expect(await authenticateApiToken(deps, link)).toBeNull();
		expect(await authenticateCalendarLink(deps, token)).toBeNull();
	});

	it('is neither listed nor revoked among the API tokens, nor they among it', async () => {
		await issueCalendarLink(deps, 'user-1');
		const { id, token } = await issueApiToken(deps, 'user-1', { name: 'script', lifetimeDays: 30 });
		expect((await listApiTokens(deps, 'user-1')).map((t) => t.name)).toEqual(['script']);
		expect(await revokeCalendarLink(deps, 'user-1')).toBe(true);
		expect(await authenticateApiToken(deps, token)).toBe('user-1');
		await issueCalendarLink(deps, 'user-1');
		expect(await revokeApiToken(deps, 'user-1', id)).toBe(true);
		expect(await calendarLinkOf(deps, 'user-1')).not.toBeNull();
	});

	it('goes with its member', async () => {
		const token = await issueCalendarLink(deps, 'user-2');
		db.delete(schema.user).run();
		expect(await authenticateCalendarLink(deps, token)).toBeNull();
	});
});
