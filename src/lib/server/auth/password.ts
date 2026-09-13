/*
 * Local password hashing adapter. Uses Bun's built-in Argon2id (docs/04 §4.2) so there is
 * no native dependency to compile. Kept behind intention-revealing names so call sites read
 * clearly and the algorithm can change in one place.
 */

/** How every hash this module writes begins — the algorithm is readable from the hash. */
export const ARGON2ID_PREFIX = '$argon2id$';

/** Hash a plaintext password for storage (Argon2id, random salt). */
export async function hashPassword(password: string): Promise<string> {
	return Bun.password.hash(password, { algorithm: 'argon2id' });
}

/**
 * Hash a plaintext password synchronously. Only for startup work that cannot await — the
 * demo seed writes its user rows inside a synchronous transaction; everything serving a
 * request uses {@link hashPassword}.
 */
export function hashPasswordSync(password: string): string {
	return Bun.password.hashSync(password, { algorithm: 'argon2id' });
}

/** Verify a plaintext password against a stored hash. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
	return Bun.password.verify(password, hash);
}
