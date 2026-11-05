import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import * as v from 'valibot';
import { systemClock, type Clock } from '../../clock';
import type { OidcProvider, TokenExchange } from './login';
import type { OidcClaims } from './types';

/*
 * OIDC provider adapter (docs/04 §4.4) — the HTTP/crypto edge of the relying party. Uses
 * the discovery document, exchanges the code at the token endpoint (client_secret_post),
 * and verifies the ID token's signature and standard claims via the provider's JWKS.
 * Confined here so the orchestration logic stays pure and testable.
 */

const Url = v.pipe(v.string(), v.url());

/** The fields Stella reads; anything else the IdP publishes is ignored. */
const DiscoveryDocument = v.object({
	authorization_endpoint: Url,
	token_endpoint: Url,
	jwks_uri: Url,
	end_session_endpoint: v.optional(Url)
});
type DiscoveryDocument = v.InferOutput<typeof DiscoveryDocument>;

/** How long a discovery document is trusted before it is read again. */
export const DISCOVERY_TTL_MS = 60 * 60 * 1000;

export interface OidcProviderConfig {
	issuer: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function toClaims(payload: JWTPayload): OidcClaims {
	return {
		issuer: String(payload.iss),
		subject: String(payload.sub),
		email: asString(payload.email),
		emailVerified: payload.email_verified === true,
		name: asString(payload.name) ?? asString(payload.preferred_username),
		groups: Array.isArray(payload.groups)
			? payload.groups.filter((g): g is string => typeof g === 'string')
			: []
	};
}

export interface OidcProviderEdges {
	/** Overridable for tests; defaults to the platform's `fetch`. */
	fetch?: typeof globalThis.fetch;
	clock?: Clock;
}

export function createOidcProvider(
	config: OidcProviderConfig,
	{ fetch = globalThis.fetch, clock = systemClock }: OidcProviderEdges = {}
): OidcProvider {
	let discovery: { document: DiscoveryDocument; readAt: number } | null = null;
	let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

	async function discover(): Promise<DiscoveryDocument> {
		if (discovery && clock.now() - discovery.readAt < DISCOVERY_TTL_MS) return discovery.document;
		const res = await fetch(`${config.issuer}/.well-known/openid-configuration`);
		if (!res.ok) throw new Error(`OIDC discovery failed with status ${res.status}`);
		const parsed = v.safeParse(DiscoveryDocument, await res.json().catch(() => null));
		if (!parsed.success) {
			const where = parsed.issues.map((issue) => v.getDotPath(issue) ?? '(root)').join(', ');
			throw new Error(`OIDC discovery document is invalid at: ${where}`);
		}
		discovery = { document: parsed.output, readAt: clock.now() };
		jwks = createRemoteJWKSet(new URL(parsed.output.jwks_uri));
		return parsed.output;
	}

	return {
		async authorizationEndpoint() {
			return (await discover()).authorization_endpoint;
		},

		async endSessionEndpoint() {
			return (await discover()).end_session_endpoint ?? null;
		},

		async exchangeCode({ code, codeVerifier, expectedNonce }): Promise<TokenExchange> {
			const document = await discover();

			const res = await fetch(document.token_endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					grant_type: 'authorization_code',
					code,
					redirect_uri: config.redirectUri,
					code_verifier: codeVerifier,
					client_id: config.clientId,
					client_secret: config.clientSecret
				})
			});
			if (!res.ok) {
				// The IdP may have moved its endpoints: the next sign-in reads them afresh.
				discovery = null;
				throw new Error(`OIDC token exchange failed with status ${res.status}`);
			}

			const tokens = (await res.json()) as { id_token?: string };
			if (!tokens.id_token) throw new Error('OIDC token response is missing an id_token');
			if (!jwks) throw new Error('OIDC JWKS not initialised');

			const { payload } = await jwtVerify(tokens.id_token, jwks, {
				issuer: config.issuer,
				audience: config.clientId
			});
			if (payload.nonce !== expectedNonce) {
				throw new Error('OIDC nonce mismatch');
			}

			return { claims: toClaims(payload), idToken: tokens.id_token };
		}
	};
}
