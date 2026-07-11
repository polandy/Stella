/*
 * Local password hashing adapter. Uses Bun's built-in Argon2id (docs/04 §4.2) so there is
 * no native dependency to compile. Kept behind intention-revealing names so call sites read
 * clearly and the algorithm can change in one place.
 */

/** Hash a plaintext password for storage (Argon2id, random salt). */
export async function hashPassword(password: string): Promise<string> {
	return Bun.password.hash(password, { algorithm: 'argon2id' });
}

/** Verify a plaintext password against a stored hash. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
	return Bun.password.verify(password, hash);
}
