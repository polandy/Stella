import { describe, expect, it } from 'bun:test';
import { buildEndSessionUrl } from './logout-url';

/*
 * RP-initiated logout URL (docs/02 §2.1). Pure — the decision whether to bounce the browser
 * through the provider at all lives here, so the route only carries it out (docs/08 §8.3).
 */

const base = {
	endSessionEndpoint: 'https://auth.example.home/logout',
	idToken: 'header.payload.signature',
	clientId: 'stella',
	postLogoutRedirectUri: 'https://stella.example.home/login?signedOut'
};

describe('buildEndSessionUrl', () => {
	it('sends the ID token as the hint and asks to come back to Stella', () => {
		const url = new URL(buildEndSessionUrl(base) as string);

		expect(url.origin + url.pathname).toBe('https://auth.example.home/logout');
		expect(url.searchParams.get('id_token_hint')).toBe(base.idToken);
		expect(url.searchParams.get('post_logout_redirect_uri')).toBe(base.postLogoutRedirectUri);
		expect(url.searchParams.get('client_id')).toBe('stella');
	});

	it('keeps a query string the provider already put on its endpoint', () => {
		const url = new URL(
			buildEndSessionUrl({
				...base,
				endSessionEndpoint: 'https://auth.example.home/logout?tenant=home'
			}) as string
		);

		expect(url.searchParams.get('tenant')).toBe('home');
		expect(url.searchParams.get('id_token_hint')).toBe(base.idToken);
	});

	it('declines when the provider advertises no end_session_endpoint', () => {
		expect(buildEndSessionUrl({ ...base, endSessionEndpoint: null })).toBeNull();
	});

	it('declines for a local session, which the provider knows nothing about', () => {
		expect(buildEndSessionUrl({ ...base, idToken: null })).toBeNull();
	});

	it('declines rather than build a URL from a malformed endpoint', () => {
		expect(buildEndSessionUrl({ ...base, endSessionEndpoint: 'not a url' })).toBeNull();
	});
});
