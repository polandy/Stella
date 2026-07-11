import { createHash, randomBytes } from 'node:crypto';

/*
 * Session token helpers.
 * - `generateSessionToken` mints the high-entropy secret placed in the cookie.
 * - `hashSessionToken` derives the value stored in the database (SHA-256 hex).
 * Storing only the hash means a database leak cannot be replayed as a live session.
 */

/** Number of random bytes in a session token (24 bytes → 48 hex chars). */
const TOKEN_BYTES = 24;

/** Mint a new random session token (the raw secret; never stored as-is). */
export function generateSessionToken(): string {
	return randomBytes(TOKEN_BYTES).toString('hex');
}

/** Derive the stored session id from a token — pure and deterministic. */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}
