import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { OidcProvider } from './login';
import type { OidcClaims } from './types';

/*
 * OIDC provider adapter (docs/04 §4.4) — the HTTP/crypto edge of the relying party. Uses
 * the discovery document, exchanges the code at the token endpoint (client_secret_post),
 * and verifies the ID token's signature and standard claims via the provider's JWKS.
 * Confined here so the orchestration logic stays pure and testable.
 */

interface DiscoveryDocument {
	authorization_endpoint: string;
	token_endpoint: string;
	jwks_uri: string;
	end_session_endpoint?: string;
}

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
		groups: Array.isArray(payload.groups) ? payload.groups.filter((g): g is string => typeof g === 'string') : []
	};
}

export function createOidcProvider(config: OidcProviderConfig): OidcProvider {
	let discovery: DiscoveryDocument | null = null;
	let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

	async function discover(): Promise<DiscoveryDocument> {
		if (discovery) return discovery;
		const res = await fetch(`${config.issuer}/.well-known/openid-configuration`);
		if (!res.ok) throw new Error(`OIDC discovery failed with status ${res.status}`);
		discovery = (await res.json()) as DiscoveryDocument;
		jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
		return discovery;
	}

	return {
		async authorizationEndpoint() {
			return (await discover()).authorization_endpoint;
		},

		async exchangeCode({ code, codeVerifier, expectedNonce }) {
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
			if (!res.ok) throw new Error(`OIDC token exchange failed with status ${res.status}`);

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

			return toClaims(payload);
		}
	};
}
