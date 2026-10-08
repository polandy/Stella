import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { AccountDeps, AccountRepository } from '../auth/accounts';
import type { ApiTokenDeps } from '../auth/api-tokens';
import type { AuthorizationRequestDeps, CompleteLoginDeps } from '../auth/oidc/login';
import { SIGNED_OUT_PATH, type RpLogoutDeps } from '../auth/oidc/logout';
import { createOidcProvider } from '../auth/oidc/provider';
import { hashPassword, verifyPassword } from '../auth/password';
import type { SessionDeps } from '../auth/session';
import type { Clock } from '../clock';
import type { Config } from '../config';
import { createDrizzleAccountRepository } from '../db/account-repository';
import { createDrizzleApiImportRepository } from '../db/api-import-repository';
import { createDrizzleApiTokenRepository } from '../db/api-token-repository';
import { createDrizzleIdentityStore } from '../db/identity-store';
import type * as schema from '../db/schema';
import { createDrizzleSessionRepository } from '../db/session-repository';
import type { ApiImportDeps } from '../domain/import/api/api-import';
import { activityWording } from '../i18n/activity-wording';
import type { IdGenerator } from '../id';

/*
 * The `auth` bounded context of the composition root (docs/08 §8.3): who is asking and how
 * they prove it — accounts, sessions, API tokens and the import they authorise, and the OIDC
 * sign-in. Built once per process by `createServices`; the edge reads it off
 * `locals.services.auth`.
 *
 * A repository an edge reads directly sits under its plural noun (`accounts`); everything
 * else is a use-case's `deps`, named after its type (`sessionDeps` is a `SessionDeps`).
 */
export interface AuthServices {
	/** The edge's own reads: is anyone set up yet, and who is this user id. */
	accounts: AccountRepository;
	accountDeps: AccountDeps;
	sessionDeps: SessionDeps;
	apiTokenDeps: ApiTokenDeps;
	apiImportDeps: ApiImportDeps;
	authorizationRequestDeps: AuthorizationRequestDeps;
	completeLoginDeps: CompleteLoginDeps;
	/** RP-initiated logout; the redirect target must be registered at the provider. */
	rpLogoutDeps: RpLogoutDeps;
}

/** The part of the configuration the auth context reads. */
export type AuthConfig = Pick<Config, 'url' | 'auth' | 'oidc'>;

export interface AuthWiring {
	config: AuthConfig;
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
}

export function createAuthServices({ config, db, clock, ids }: AuthWiring): AuthServices {
	const { oidc } = config;
	const accounts = createDrizzleAccountRepository(db);
	// One provider for sign-in, its callback and sign-out: it caches the discovery document.
	const provider = createOidcProvider({
		issuer: oidc.issuer,
		clientId: oidc.clientId,
		clientSecret: oidc.clientSecret,
		redirectUri: oidc.redirectUri
	});

	return {
		accounts,
		accountDeps: { accounts, ids, hashPassword, verifyPassword },
		sessionDeps: { sessions: createDrizzleSessionRepository(db), clock },
		apiTokenDeps: { tokens: createDrizzleApiTokenRepository(db), clock, ids },
		apiImportDeps: { imports: createDrizzleApiImportRepository(db, activityWording), clock, ids },
		authorizationRequestDeps: {
			provider,
			config: { clientId: oidc.clientId, redirectUri: oidc.redirectUri, scopes: oidc.scopes }
		},
		completeLoginDeps: {
			provider,
			identities: createDrizzleIdentityStore(db, ids, oidc.providerName),
			policy: {
				allowedGroups: oidc.allowedGroups,
				adminGroups: oidc.adminGroups,
				allowedEmails: oidc.allowedEmails,
				jitProvision: oidc.jitProvision,
				linkByEmail: oidc.linkByEmail,
				syncRoles: oidc.syncRoles,
				syncProfile: oidc.syncProfile
			},
			clock
		},
		rpLogoutDeps: {
			provider,
			enabled: config.auth.oidc && oidc.rpLogout,
			clientId: oidc.clientId,
			postLogoutRedirectUri: `${config.url}${SIGNED_OUT_PATH}`
		}
	};
}
