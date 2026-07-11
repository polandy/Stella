import { describe, expect, it } from 'bun:test';
import type { IdGenerator } from '../id';
import {
	authenticateLocal,
	registerFirstAdmin,
	type AccountRepository,
	type AuthUser,
	type NewAdmin,
	type StoredCredentials
} from './accounts';

/*
 * Account use-cases: first-run admin registration and local authentication. Pure logic
 * over an AccountRepository port, with password hashing and id generation injected so the
 * tests are fast and deterministic (docs/08 §8.3).
 */

function fakeRepo(seed: { user: AuthUser; passwordHash: string | null }[] = []) {
	const users = [...seed];
	let inserted: NewAdmin | null = null;
	const repo: AccountRepository = {
		countUsers: async () => users.length,
		findCredentialsByEmail: async (email): Promise<StoredCredentials | null> => {
			const found = users.find((u) => u.user.email === email);
			return found ? { user: found.user, passwordHash: found.passwordHash } : null;
		},
		findById: async (id) => users.find((u) => u.user.id === id)?.user ?? null,
		insertHouseholdWithAdmin: async (data) => {
			inserted = data;
			users.push({ user: data.user, passwordHash: data.user.passwordHash });
		}
	};
	return { repo, get inserted() { return inserted; } };
}

function sequentialIds(...values: string[]): IdGenerator {
	let i = 0;
	return { next: () => values[i++] ?? `id-${i}` };
}

const deps = (repo: AccountRepository) => ({
	accounts: repo,
	ids: sequentialIds('household-id', 'user-id'),
	hashPassword: async (pw: string) => `hashed:${pw}`,
	verifyPassword: async (hash: string, pw: string) => hash === `hashed:${pw}`
});

describe('registerFirstAdmin', () => {
	it('creates the household and a locked admin when no users exist', async () => {
		const f = fakeRepo();
		const admin = await registerFirstAdmin(deps(f.repo), {
			householdName: 'Pollari',
			name: 'Andy',
			email: 'andy@example.test',
			password: 'a-good-passphrase'
		});

		expect(admin).toEqual({
			id: 'user-id',
			householdId: 'household-id',
			email: 'andy@example.test',
			name: 'Andy',
			role: 'admin'
		});
		expect(f.inserted?.household).toEqual({ id: 'household-id', name: 'Pollari' });
		expect(f.inserted?.user.passwordHash).toBe('hashed:a-good-passphrase');
		expect(f.inserted?.user.role).toBe('admin');
		expect(f.inserted?.user.roleLocked).toBe(1); // break-glass admin
	});

	it('refuses to run once any user exists', async () => {
		const existing: AuthUser = {
			id: 'u0',
			householdId: 'h0',
			email: 'x@example.test',
			name: 'X',
			role: 'admin'
		};
		const f = fakeRepo([{ user: existing, passwordHash: 'hashed:x' }]);
		await expect(
			registerFirstAdmin(deps(f.repo), {
				householdName: 'H',
				name: 'N',
				email: 'n@example.test',
				password: 'pw'
			})
		).rejects.toThrow();
	});
});

describe('authenticateLocal', () => {
	const user: AuthUser = {
		id: 'u1',
		householdId: 'h1',
		email: 'andy@example.test',
		name: 'Andy',
		role: 'admin'
	};

	it('returns the user for correct credentials', async () => {
		const f = fakeRepo([{ user, passwordHash: 'hashed:right' }]);
		expect(await authenticateLocal(deps(f.repo), { email: user.email, password: 'right' })).toEqual(
			user
		);
	});

	it('returns null for a wrong password', async () => {
		const f = fakeRepo([{ user, passwordHash: 'hashed:right' }]);
		expect(
			await authenticateLocal(deps(f.repo), { email: user.email, password: 'wrong' })
		).toBeNull();
	});

	it('returns null for an unknown email', async () => {
		const f = fakeRepo([{ user, passwordHash: 'hashed:right' }]);
		expect(await authenticateLocal(deps(f.repo), { email: 'nobody@x.test', password: 'x' })).toBeNull();
	});

	it('returns null for an SSO-only user with no password', async () => {
		const f = fakeRepo([{ user, passwordHash: null }]);
		expect(
			await authenticateLocal(deps(f.repo), { email: user.email, password: 'anything' })
		).toBeNull();
	});
});
