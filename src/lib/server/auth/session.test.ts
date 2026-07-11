import { describe, expect, it } from 'bun:test';
import type { Clock } from '../clock';
import { SESSION_DURATION_MS } from './session-policy';
import { hashSessionToken } from './tokens';
import {
	createSession,
	invalidateSession,
	validateSessionToken,
	type SessionRecord,
	type SessionRepository
} from './session';

/*
 * Session service — orchestrates token hashing, the expiry policy, and persistence via a
 * SessionRepository port. Tested test-first with an in-memory fake repo and a controllable
 * clock (no DB, deterministic). See docs/08 §8.3.
 */

const DAY = 1000 * 60 * 60 * 24;
const NOW = 1_700_000_000_000;
const USER_ID = 'user-1';

function fakeRepo() {
	const store = new Map<string, SessionRecord>();
	const repo: SessionRepository = {
		create: async (s) => {
			store.set(s.id, { ...s });
		},
		findById: async (id) => {
			const s = store.get(id);
			return s ? { ...s } : null;
		},
		updateExpiry: async (id, expiresAt) => {
			const s = store.get(id);
			if (s) store.set(id, { ...s, expiresAt });
		},
		delete: async (id) => {
			store.delete(id);
		}
	};
	return { repo, store };
}

function mutableClock(start: number): Clock & { set(value: number): void } {
	let current = start;
	return { now: () => current, set: (value) => (current = value) };
}

function deps(overrides: Partial<Parameters<typeof createSession>[0]> = {}) {
	const { repo, store } = fakeRepo();
	const clock = mutableClock(NOW);
	return {
		store,
		clock,
		base: {
			sessions: repo,
			clock,
			generateToken: () => 'fixed-token',
			...overrides
		}
	};
}

describe('createSession', () => {
	it('stores a session keyed by the hash of the token and returns the raw token', async () => {
		const d = deps();
		const { token, session } = await createSession(d.base, USER_ID);

		expect(token).toBe('fixed-token');
		expect(session.id).toBe(hashSessionToken('fixed-token'));
		expect(session.id).not.toBe(token); // the DB never holds the raw token
		expect(session.userId).toBe(USER_ID);
		expect(session.expiresAt).toBe(NOW + SESSION_DURATION_MS);
		expect(d.store.get(session.id)?.userId).toBe(USER_ID);
	});
});

describe('validateSessionToken', () => {
	it('returns the session for a valid, fresh token without extending it', async () => {
		const d = deps();
		const { token, session } = await createSession(d.base, USER_ID);

		const result = await validateSessionToken(d.base, token);

		expect(result).not.toBeNull();
		expect(result?.userId).toBe(USER_ID);
		expect(d.store.get(session.id)?.expiresAt).toBe(session.expiresAt); // unchanged
	});

	it('returns null for an unknown token', async () => {
		const d = deps();
		expect(await validateSessionToken(d.base, 'nope')).toBeNull();
	});

	it('deletes and rejects an expired session', async () => {
		const d = deps();
		const { token, session } = await createSession(d.base, USER_ID);

		d.clock.set(session.expiresAt + 1);
		const result = await validateSessionToken(d.base, token);

		expect(result).toBeNull();
		expect(d.store.has(session.id)).toBe(false);
	});

	it('slides the expiry forward once past the halfway point', async () => {
		const d = deps();
		const { token, session } = await createSession(d.base, USER_ID);

		const later = session.expiresAt - 10 * DAY; // within the second half
		d.clock.set(later);
		const result = await validateSessionToken(d.base, token);

		expect(result?.expiresAt).toBe(later + SESSION_DURATION_MS);
		expect(d.store.get(session.id)?.expiresAt).toBe(later + SESSION_DURATION_MS);
	});
});

describe('invalidateSession', () => {
	it('removes the session for the given token', async () => {
		const d = deps();
		const { token, session } = await createSession(d.base, USER_ID);

		await invalidateSession(d.base, token);

		expect(d.store.has(session.id)).toBe(false);
	});
});
