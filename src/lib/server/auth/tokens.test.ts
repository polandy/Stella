import { describe, expect, it } from 'bun:test';
import { generateSessionToken, hashSessionToken } from './tokens';

/*
 * Session tokens: the raw token goes in the cookie; only its SHA-256 hash is stored, so a
 * database leak cannot be replayed as a valid session. `hashSessionToken` is pure and
 * deterministic; `generateSessionToken` is the (random) adapter piece.
 */

describe('hashSessionToken', () => {
	it('matches the known SHA-256 hex vector', () => {
		// SHA-256("hello")
		expect(hashSessionToken('hello')).toBe(
			'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
		);
	});

	it('is deterministic for the same input', () => {
		expect(hashSessionToken('a-token')).toBe(hashSessionToken('a-token'));
	});

	it('differs for different inputs', () => {
		expect(hashSessionToken('token-a')).not.toBe(hashSessionToken('token-b'));
	});
});

describe('generateSessionToken', () => {
	it('produces a long, high-entropy hex string', () => {
		expect(generateSessionToken()).toMatch(/^[0-9a-f]{48}$/);
	});

	it('produces a different token each call', () => {
		expect(generateSessionToken()).not.toBe(generateSessionToken());
	});
});
