import { describe, expect, it } from 'bun:test';
import { deriveCodeChallenge, generateCodeVerifier } from './pkce';

/*
 * PKCE (RFC 7636). `deriveCodeChallenge` is pure (SHA-256 → base64url) and checked against
 * the RFC test vector; `generateCodeVerifier` is the random adapter piece.
 */

describe('deriveCodeChallenge', () => {
	it('matches the RFC 7636 test vector', () => {
		expect(deriveCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
			'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
		);
	});
});

describe('generateCodeVerifier', () => {
	it('is a URL-safe, high-entropy string', () => {
		expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it('differs each call', () => {
		expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
	});
});
