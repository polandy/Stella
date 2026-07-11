import type { Clock } from '../../clock';
import type { Role } from '../accounts';
import { isAuthorized } from './authorization';
import { buildAuthorizationUrl } from './authorize-url';
import { deriveCodeChallenge, generateCodeVerifier, generateNonce, generateState } from './pkce';
import { planLogin } from './login-planner';
import type { OidcClaims, OidcPolicy, ProfilePatch } from './types';

/*
 * OIDC relying-party orchestration (docs/04 §4.4). Composes the pure pieces (authorization,
 * planner, PKCE) with two ports — the provider (token exchange + ID-token verification) and
 * the identity store — so the whole flow is unit-testable with fakes.
 */

/** Provider port: everything that requires talking to the IdP over HTTP. */
export interface OidcProvider {
	authorizationEndpoint(): Promise<string>;
	/** Exchange the code and return the verified ID-token claims (iss/aud/exp/nonce checked). */
	exchangeCode(params: {
		code: string;
		codeVerifier: string;
		expectedNonce: string;
	}): Promise<OidcClaims>;
}

/** Identity-store port: maps OIDC identities to Stella users and provisions/links them. */
export interface IdentityStore {
	findUserIdByIssuerSubject(issuer: string, subject: string): Promise<string | null>;
	findUserIdByEmail(email: string): Promise<string | null>;
	/** Create a user (bootstrapping the household if none exists) and its federated identity. */
	provision(data: {
		issuer: string;
		subject: string;
		email: string;
		name: string;
		role: Role;
	}): Promise<string>;
	linkIdentity(
		userId: string,
		data: { issuer: string; subject: string; email: string | null }
	): Promise<void>;
	updateRoleAndProfile(
		userId: string,
		patch: { role: Role | null; profile: ProfilePatch | null }
	): Promise<void>;
	touchIdentity(issuer: string, subject: string, at: number): Promise<void>;
}

export interface OidcConfig {
	clientId: string;
	redirectUri: string;
	scopes: string;
}

/** Generators are injectable so the authorization request is deterministic in tests. */
export interface AuthorizationRequestDeps {
	provider: Pick<OidcProvider, 'authorizationEndpoint'>;
	config: OidcConfig;
	generators?: {
		state: () => string;
		nonce: () => string;
		codeVerifier: () => string;
	};
}

export interface AuthorizationRequest {
	url: string;
	state: string;
	nonce: string;
	codeVerifier: string;
}

/** Build the redirect to the provider plus the one-time values to stash for the callback. */
export async function createAuthorizationRequest(
	deps: AuthorizationRequestDeps
): Promise<AuthorizationRequest> {
	const gen = deps.generators ?? {
		state: generateState,
		nonce: generateNonce,
		codeVerifier: generateCodeVerifier
	};
	const state = gen.state();
	const nonce = gen.nonce();
	const codeVerifier = gen.codeVerifier();

	const url = buildAuthorizationUrl({
		authorizationEndpoint: await deps.provider.authorizationEndpoint(),
		clientId: deps.config.clientId,
		redirectUri: deps.config.redirectUri,
		scopes: deps.config.scopes,
		state,
		nonce,
		codeChallenge: deriveCodeChallenge(codeVerifier)
	});

	return { url, state, nonce, codeVerifier };
}

export interface CompleteLoginDeps {
	provider: OidcProvider;
	identities: IdentityStore;
	policy: OidcPolicy;
	clock: Clock;
}

export type OidcLoginResult =
	| { ok: true; userId: string }
	| { ok: false; reason: 'not-authorized' | 'no-account' };

/** Handle the callback: verify, authorize, resolve/provision the account, report the user. */
export async function completeOidcLogin(
	deps: CompleteLoginDeps,
	params: { code: string; codeVerifier: string; expectedNonce: string }
): Promise<OidcLoginResult> {
	const claims = await deps.provider.exchangeCode(params);

	if (!isAuthorized(claims, deps.policy)) {
		return { ok: false, reason: 'not-authorized' };
	}

	const lookups = {
		existingUserId: await deps.identities.findUserIdByIssuerSubject(claims.issuer, claims.subject),
		userIdByEmail: claims.email
			? await deps.identities.findUserIdByEmail(claims.email)
			: null
	};

	const plan = planLogin(claims, lookups, deps.policy);

	switch (plan.action) {
		case 'deny':
			return { ok: false, reason: plan.reason };

		case 'provision': {
			const userId = await deps.identities.provision({
				issuer: claims.issuer,
				subject: claims.subject,
				email: plan.profile.email,
				name: plan.profile.name,
				role: plan.role
			});
			return { ok: true, userId };
		}

		case 'link':
			await deps.identities.linkIdentity(plan.userId, {
				issuer: claims.issuer,
				subject: claims.subject,
				email: claims.email
			});
			await deps.identities.updateRoleAndProfile(plan.userId, {
				role: plan.role,
				profile: plan.profile
			});
			await deps.identities.touchIdentity(claims.issuer, claims.subject, deps.clock.now());
			return { ok: true, userId: plan.userId };

		case 'use-existing':
			await deps.identities.updateRoleAndProfile(plan.userId, {
				role: plan.role,
				profile: plan.profile
			});
			await deps.identities.touchIdentity(claims.issuer, claims.subject, deps.clock.now());
			return { ok: true, userId: plan.userId };
	}
}
