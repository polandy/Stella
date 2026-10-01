import { isLocale, type Locale } from '../../i18n/locales';
import type { Visibility } from '../access/visibility';
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
	/** The language this user reads Stella in, or null while they have not picked one. */
	locale: Locale | null;
	/** The contact this user *is*, or null while they have not said (docs/02 §2.1.3). */
	selfContactId: string | null;
	/** What a record this user adds starts as, unless they pick otherwise (docs/02 §2.17). */
	defaultVisibility: Visibility;
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
	/** Persist the user's interface language. */
	updateLocale(userId: string, locale: Locale): Promise<void>;
	/** Persist which contact the user is, or clear it with `null` (docs/02 §2.1.3). */
	updateSelfContact(userId: string, contactId: string | null): Promise<void>;
	/** Persist what the user's new records start as (docs/02 §2.17). */
	updateDefaultVisibility(userId: string, visibility: Visibility): Promise<void>;
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
	/** The language the setup form was filled in, kept as the admin's preference. */
	locale: Locale;
}

/** Thrown when a language outside `LOCALES` is offered for a profile. */
export class UnsupportedLocaleError extends Error {
	constructor(readonly requested: string) {
		super(`Unsupported locale: ${requested}`);
		this.name = 'UnsupportedLocaleError';
	}
}

/**
 * Change the language a user reads Stella in (docs/02 §2.19). An unsupported language is
 * refused rather than stored: a value nothing can translate would leave the interface
 * silently English on every later request.
 */
export async function changeLocale(
	deps: Pick<AccountDeps, 'accounts'>,
	userId: string,
	locale: string
): Promise<Locale> {
	if (!isLocale(locale)) throw new UnsupportedLocaleError(locale);
	await deps.accounts.updateLocale(userId, locale);
	return locale;
}

/** Thrown when something other than `shared` or `private` is offered as a default. */
export class UnsupportedVisibilityError extends Error {
	constructor(readonly requested: string) {
		super(`Unsupported visibility: ${requested}`);
		this.name = 'UnsupportedVisibilityError';
	}
}

const isVisibility = (value: string): value is Visibility => value === 'shared' || value === 'private';

/**
 * Change what a user's new records start as (docs/02 §2.17): every form opens on it and a
 * record added without a choice — quick-add, the import API — takes it. Refused rather than
 * stored when it is neither visibility, since the access layer knows no third one.
 */
export async function changeDefaultVisibility(
	deps: Pick<AccountDeps, 'accounts'>,
	userId: string,
	visibility: string
): Promise<Visibility> {
	if (!isVisibility(visibility)) throw new UnsupportedVisibilityError(visibility);
	await deps.accounts.updateDefaultVisibility(userId, visibility);
	return visibility;
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
		role: 'admin',
		locale: input.locale,
		selfContactId: null,
		defaultVisibility: 'shared'
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
