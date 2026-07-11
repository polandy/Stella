import { createHash, randomBytes } from 'node:crypto';

/*
 * PKCE (RFC 7636) and the one-time login nonce/state values. `deriveCodeChallenge` is
 * pure; the generators are the random adapter pieces.
 */

/** Mint a PKCE code verifier (43 chars, URL-safe). */
export function generateCodeVerifier(): string {
	return randomBytes(32).toString('base64url');
}

/** Derive the S256 code challenge from a verifier — pure and deterministic. */
export function deriveCodeChallenge(verifier: string): string {
	return createHash('sha256').update(verifier).digest('base64url');
}

/** Random `state` value binding the callback to this request. */
export function generateState(): string {
	return randomBytes(16).toString('hex');
}

/** Random `nonce` value binding the ID token to this request. */
export function generateNonce(): string {
	return randomBytes(16).toString('hex');
}
