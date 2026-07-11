import type { IdGenerator } from '../id';

/*
 * Account use-cases: first-run admin registration and local authentication (docs/02 §2.1).
 * Pure orchestration over the AccountRepository port; password hashing and id generation
 * are injected so the logic is deterministic and fast to test (docs/08 §8.3).
 */

export type Role = 'admin' | 'member';

/** The identity fields safe to carry around the app (never includes the password hash). */
export interface AuthUser {
	id: string;
	householdId: string;
	email: string;
	name: string;
	role: Role;
}

export interface StoredCredentials {
	user: AuthUser;
	passwordHash: string | null;
}

export interface NewAdmin {
	household: { id: string; name: string };
	user: AuthUser & { roleLocked: number; passwordHash: string };
}

/** Persistence port for accounts; implemented by a Drizzle adapter at the edge. */
export interface AccountRepository {
	countUsers(): Promise<number>;
	findCredentialsByEmail(email: string): Promise<StoredCredentials | null>;
	findById(id: string): Promise<AuthUser | null>;
	/** Atomically create the household and its first admin. */
	insertHouseholdWithAdmin(data: NewAdmin): Promise<void>;
}

export interface AccountDeps {
	accounts: AccountRepository;
	ids: IdGenerator;
	hashPassword: (password: string) => Promise<string>;
	verifyPassword: (hash: string, password: string) => Promise<boolean>;
}

export interface FirstAdminInput {
	householdName: string;
	name: string;
	email: string;
	password: string;
}

/**
 * Create the household and its first, admin user. Only allowed while no users exist (the
 * one-time first-run setup). The admin is `roleLocked` so IdP group-sync can never demote
 * this break-glass account (docs/02 §2.1.2).
 */
export async function registerFirstAdmin(
	deps: AccountDeps,
	input: FirstAdminInput
): Promise<AuthUser> {
	if ((await deps.accounts.countUsers()) > 0) {
		throw new Error('Setup has already been completed: a user already exists.');
	}

	const household = { id: deps.ids.next(), name: input.householdName };
	const user: AuthUser = {
		id: deps.ids.next(),
		householdId: household.id,
		email: input.email,
		name: input.name,
		role: 'admin'
	};
	const passwordHash = await deps.hashPassword(input.password);

	await deps.accounts.insertHouseholdWithAdmin({
		household,
		user: { ...user, roleLocked: 1, passwordHash }
	});

	return user;
}

export interface LoginInput {
	email: string;
	password: string;
}

/**
 * Verify local credentials. Returns the user on success, otherwise `null` — for a wrong
 * password, an unknown email, or an SSO-only account without a local password.
 */
export async function authenticateLocal(
	deps: AccountDeps,
	input: LoginInput
): Promise<AuthUser | null> {
	const credentials = await deps.accounts.findCredentialsByEmail(input.email);
	if (!credentials || credentials.passwordHash === null) {
		return null;
	}
	const ok = await deps.verifyPassword(credentials.passwordHash, input.password);
	return ok ? credentials.user : null;
}
