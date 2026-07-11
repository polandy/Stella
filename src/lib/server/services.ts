import type { AccountDeps, AccountRepository } from './auth/accounts';
import type {
	AuthorizationRequestDeps,
	CompleteLoginDeps,
	IdentityStore,
	OidcProvider
} from './auth/oidc/login';
import { createOidcProvider } from './auth/oidc/provider';
import type { OidcPolicy } from './auth/oidc/types';
import { hashPassword, verifyPassword } from './auth/password';
import type { SessionDeps, SessionRepository } from './auth/session';
import { systemClock } from './clock';
import { getConfig } from './config';
import { getDb } from './db';
import { createDrizzleAccountRepository } from './db/account-repository';
import { createDrizzleContactRepository } from './db/contact-repository';
import { createDrizzleIdentityStore } from './db/identity-store';
import { createDrizzleRelationshipRepository } from './db/relationship-repository';
import { createDrizzleSessionRepository } from './db/session-repository';
import type { ContactDeps, ContactRepository } from './domain/contacts/contacts';
import type { RelationshipDeps, RelationshipRepository } from './domain/relationships/relationships';
import { ulidGenerator } from './id';

/*
 * Composition root — the single place that wires concrete adapters (Drizzle repositories,
 * system clock, ULID generator, Bun password hashing) into the domain use-cases' `deps`
 * (docs/08 §8.3). Everything is lazy so importing this module has no side effects and the
 * build's route analysis never touches the Bun-only database (see db/index.ts).
 */

let accountRepository: AccountRepository | null = null;
let sessionRepository: SessionRepository | null = null;

export function getAccounts(): AccountRepository {
	return (accountRepository ??= createDrizzleAccountRepository(getDb()));
}

export function getSessions(): SessionRepository {
	return (sessionRepository ??= createDrizzleSessionRepository(getDb()));
}

export function getSessionDeps(): SessionDeps {
	return { sessions: getSessions(), clock: systemClock };
}

export function getAccountDeps(): AccountDeps {
	return { accounts: getAccounts(), ids: ulidGenerator, hashPassword, verifyPassword };
}

let oidcProvider: OidcProvider | null = null;
let identityStore: IdentityStore | null = null;

export function getOidcProvider(): OidcProvider {
	const oidc = getConfig().oidc;
	return (oidcProvider ??= createOidcProvider({
		issuer: oidc.issuer,
		clientId: oidc.clientId,
		clientSecret: oidc.clientSecret,
		redirectUri: oidc.redirectUri
	}));
}

export function getIdentities(): IdentityStore {
	return (identityStore ??= createDrizzleIdentityStore(
		getDb(),
		ulidGenerator,
		getConfig().oidc.providerName
	));
}

export function getOidcPolicy(): OidcPolicy {
	const oidc = getConfig().oidc;
	return {
		allowedGroups: oidc.allowedGroups,
		adminGroups: oidc.adminGroups,
		allowedEmails: oidc.allowedEmails,
		jitProvision: oidc.jitProvision,
		linkByEmail: oidc.linkByEmail,
		syncRoles: oidc.syncRoles,
		syncProfile: oidc.syncProfile
	};
}

export function getAuthorizationRequestDeps(): AuthorizationRequestDeps {
	const oidc = getConfig().oidc;
	return {
		provider: getOidcProvider(),
		config: { clientId: oidc.clientId, redirectUri: oidc.redirectUri, scopes: oidc.scopes }
	};
}

export function getCompleteLoginDeps(): CompleteLoginDeps {
	return {
		provider: getOidcProvider(),
		identities: getIdentities(),
		policy: getOidcPolicy(),
		clock: systemClock
	};
}

let contactRepository: ContactRepository | null = null;

export function getContacts(): ContactRepository {
	return (contactRepository ??= createDrizzleContactRepository(getDb()));
}

export function getContactDeps(): ContactDeps {
	return { contacts: getContacts(), ids: ulidGenerator, clock: systemClock };
}

let relationshipRepository: RelationshipRepository | null = null;

export function getRelationships(): RelationshipRepository {
	return (relationshipRepository ??= createDrizzleRelationshipRepository(getDb()));
}

export function getRelationshipDeps(): RelationshipDeps {
	return { relationships: getRelationships(), ids: ulidGenerator, clock: systemClock };
}
