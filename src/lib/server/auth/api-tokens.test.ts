import { beforeEach, describe, expect, it } from 'bun:test';
import {
	authenticateApiToken,
	bearerTokenOf,
	EmptyApiTokenNameError,
	issueApiToken,
	listApiTokens,
	revokeApiToken,
	type ApiTokenDeps,
	type ApiTokenRecord,
	type ApiTokenRepository
} from './api-tokens';
import { hashSessionToken } from './tokens';

/*
 * API tokens (docs/02 §2.16.1): a member mints one for a script, it is shown once and stored
 * only as a hash, it lapses on the day it was given, and it can be withdrawn at any time. The
 * repository is an in-memory fake, so every outcome is read back from what it holds.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

let rows: ApiTokenRecord[];
let touched: { id: string; at: number }[];
let lookups: number;
let now: number;
let deps: ApiTokenDeps;

beforeEach(() => {
	rows = [];
	touched = [];
	lookups = 0;
	now = NOW;
	let seq = 0;
	const tokens: ApiTokenRepository = {
		async insert(record) {
			rows.push(record);
		},
		async findByHash(hash) {
			lookups++;
			return rows.find((r) => r.tokenHash === hash) ?? null;
		},
		async listForUser(userId) {
			return rows.filter((r) => r.userId === userId);
		},
		async deleteForUser(userId, id) {
			const before = rows.length;
			rows = rows.filter((r) => !(r.userId === userId && r.id === id));
			return rows.length < before;
		},
		async touch(id, at) {
			touched.push({ id, at });
		}
	};
	deps = {
		tokens,
		clock: { now: () => now },
		ids: { next: () => `tok-${++seq}` },
		generateSecret: () => 'secret1'
	};
});

describe('issueApiToken', () => {
	it('hands back the token once and keeps only its hash', async () => {
		const { token } = await issueApiToken(deps, 'user-1', {
			name: ' import script ',
			lifetimeDays: 90
		});
		expect(token).toBe('stella_secret1');
		expect(rows).toEqual([
			{
				id: 'tok-1',
				userId: 'user-1',
				name: 'import script',
				tokenHash: hashSessionToken(token),
				createdAt: NOW,
				expiresAt: NOW + 90 * DAY,
				lastUsedAt: null
			}
		]);
	});

	it('refuses a token without a name, so the list can say what each one is for', async () => {
		await expect(
			issueApiToken(deps, 'user-1', { name: '  ', lifetimeDays: 30 })
		).rejects.toBeInstanceOf(EmptyApiTokenNameError);
		expect(rows).toEqual([]);
	});
});

describe('authenticateApiToken', () => {
	it('resolves a live token to its member and notes when it was used', async () => {
		const { token } = await issueApiToken(deps, 'user-1', { name: 'script', lifetimeDays: 30 });
		now = NOW + DAY;
		expect(await authenticateApiToken(deps, token)).toBe('user-1');
		expect(touched).toEqual([{ id: 'tok-1', at: NOW + DAY }]);
	});

	it('refuses a token past its day, and one it never issued', async () => {
		const { token } = await issueApiToken(deps, 'user-1', { name: 'script', lifetimeDays: 30 });
		now = NOW + 30 * DAY;
		expect(await authenticateApiToken(deps, token)).toBeNull();
		expect(await authenticateApiToken(deps, 'stella_forged')).toBeNull();
		expect(touched).toEqual([]);
	});

	it('does not look up anything that is not shaped like a Stella token', async () => {
		const { token } = await issueApiToken(deps, 'user-1', { name: 'script', lifetimeDays: 30 });
		expect(await authenticateApiToken(deps, token.slice('stella_'.length))).toBeNull();
		expect(await authenticateApiToken(deps, 'a-session-cookie-value')).toBeNull();
		expect(lookups).toBe(0);
	});
});

describe('listing and revoking', () => {
	it('lists a member’s own tokens without their hashes', async () => {
		await issueApiToken(deps, 'user-1', { name: 'mine', lifetimeDays: 30 });
		await issueApiToken(deps, 'user-2', { name: 'theirs', lifetimeDays: 30 });
		expect(await listApiTokens(deps, 'user-1')).toEqual([
			{ id: 'tok-1', name: 'mine', createdAt: NOW, expiresAt: NOW + 30 * DAY, lastUsedAt: null }
		]);
	});

	it('withdraws a token so it no longer signs anything in, and only its owner can', async () => {
		const { token } = await issueApiToken(deps, 'user-1', { name: 'script', lifetimeDays: 30 });
		expect(await revokeApiToken(deps, 'user-2', 'tok-1')).toBe(false);
		expect(await authenticateApiToken(deps, token)).toBe('user-1');
		expect(await revokeApiToken(deps, 'user-1', 'tok-1')).toBe(true);
		expect(await authenticateApiToken(deps, token)).toBeNull();
	});
});

describe('bearerTokenOf', () => {
	it('reads the token out of an Authorization header', () => {
		expect(bearerTokenOf('Bearer stella_abc')).toBe('stella_abc');
		expect(bearerTokenOf('bearer   stella_abc ')).toBe('stella_abc');
	});

	it('finds none in a missing header or another scheme', () => {
		expect(bearerTokenOf(null)).toBeNull();
		expect(bearerTokenOf('Basic dXNlcjpwYXNz')).toBeNull();
		expect(bearerTokenOf('Bearer ')).toBeNull();
	});
});
