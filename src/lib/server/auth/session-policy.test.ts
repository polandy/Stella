import { describe, expect, it } from 'bun:test';
import { SESSION_DURATION_MS, newExpiry, validateExpiry } from './session-policy';

/*
 * Pure session expiry policy (sliding expiration). No I/O, no clock dependency —
 * `now` is passed in, so behavior is fully deterministic. See docs/08 §8.3.
 */

const DAY = 1000 * 60 * 60 * 24;
const NOW = 1_700_000_000_000; // fixed reference instant

describe('newExpiry', () => {
	it('is `now` plus the session duration', () => {
		expect(newExpiry(NOW)).toBe(NOW + SESSION_DURATION_MS);
	});
});

describe('validateExpiry', () => {
	it('reports a fresh session as active without changing its expiry', () => {
		const session = { expiresAt: NOW + SESSION_DURATION_MS };
		expect(validateExpiry(session, NOW)).toEqual({
			status: 'active',
			expiresAt: session.expiresAt
		});
	});

	it('asks to refresh once the session is past the halfway point', () => {
		// 10 days before expiry — within the second half of a 30-day window.
		const session = { expiresAt: NOW + 10 * DAY };
		expect(validateExpiry(session, NOW)).toEqual({
			status: 'refresh',
			expiresAt: NOW + SESSION_DURATION_MS
		});
	});

	it('treats a session exactly at its expiry as expired', () => {
		const session = { expiresAt: NOW };
		expect(validateExpiry(session, NOW)).toEqual({ status: 'expired' });
	});

	it('treats a session past its expiry as expired', () => {
		const session = { expiresAt: NOW - 1 };
		expect(validateExpiry(session, NOW)).toEqual({ status: 'expired' });
	});
});
