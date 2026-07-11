import { describe, expect, it } from 'bun:test';
import { buildAuthorizationUrl } from './authorize-url';

/* Building the provider authorization redirect (auth-code + PKCE). Pure. */

describe('buildAuthorizationUrl', () => {
	it('includes the required OIDC + PKCE parameters', () => {
		const url = new URL(
			buildAuthorizationUrl({
				authorizationEndpoint: 'https://auth.example.home/api/oidc/authorization',
				clientId: 'stella',
				redirectUri: 'https://stella.example.home/login/sso/callback',
				scopes: 'openid profile email groups',
				state: 'state-123',
				nonce: 'nonce-456',
				codeChallenge: 'challenge-789'
			})
		);

		expect(url.origin + url.pathname).toBe('https://auth.example.home/api/oidc/authorization');
		expect(url.searchParams.get('response_type')).toBe('code');
		expect(url.searchParams.get('client_id')).toBe('stella');
		expect(url.searchParams.get('redirect_uri')).toBe(
			'https://stella.example.home/login/sso/callback'
		);
		expect(url.searchParams.get('scope')).toBe('openid profile email groups');
		expect(url.searchParams.get('state')).toBe('state-123');
		expect(url.searchParams.get('nonce')).toBe('nonce-456');
		expect(url.searchParams.get('code_challenge')).toBe('challenge-789');
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
	});
});
