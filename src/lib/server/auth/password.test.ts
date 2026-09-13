import { describe, expect, it } from 'bun:test';
import { ARGON2ID_PREFIX, hashPassword, hashPasswordSync, verifyPassword } from './password';

/*
 * Local password hashing (Argon2id via Bun.password — no extra dependency, docs/04 §4.2).
 * A thin adapter, verified by round-trip: a hash verifies against the right password and
 * rejects the wrong one, and hashing is salted (two hashes of the same password differ).
 */

describe('password hashing', () => {
	it('produces an Argon2id hash that is not the plaintext', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(hash).not.toBe('correct horse battery staple');
		expect(hash.startsWith(ARGON2ID_PREFIX)).toBe(true);
	});

	it('verifies the correct password and rejects a wrong one', async () => {
		const hash = await hashPassword('s3cret-passphrase');
		expect(await verifyPassword(hash, 's3cret-passphrase')).toBe(true);
		expect(await verifyPassword(hash, 'wrong-passphrase')).toBe(false);
	});

	it('hashes the same way synchronously, for the startup paths that cannot await', async () => {
		const hash = hashPasswordSync('seeded-passphrase');
		expect(hash.startsWith(ARGON2ID_PREFIX)).toBe(true);
		expect(await verifyPassword(hash, 'seeded-passphrase')).toBe(true);
		expect(await verifyPassword(hash, 'wrong-passphrase')).toBe(false);
	});

	it('is salted — the same password hashes differently each time', async () => {
		const a = await hashPassword('same-input');
		const b = await hashPassword('same-input');
		expect(a).not.toBe(b);
	});
});
