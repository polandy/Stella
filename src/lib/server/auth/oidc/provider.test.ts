import { describe, expect, it } from 'bun:test';
import { fixedClock } from '../../domain/testing';
import { createOidcProvider, DISCOVERY_TTL_MS } from './provider';

/*
 * The provider's discovery document (docs/04 §4.4): parsed, not cast, and kept for a while
 * rather than for the life of the process — an IdP that rotates its endpoints is followed
 * without a restart. The token exchange and ID-token checks are covered end to end.
 */

const ISSUER = 'https://auth.example.test';

const discovery = (tokenEndpoint = `${ISSUER}/token`) => ({
	authorization_endpoint: `${ISSUER}/authorize`,
	token_endpoint: tokenEndpoint,
	jwks_uri: `${ISSUER}/jwks`
});

/** A fetch that answers each request with the next canned response, recording the URLs. */
function fakeFetch(answers: Response[]) {
	const urls: string[] = [];
	const fetch = (async (input: string | URL | Request) => {
		urls.push(String(input));
		const next = answers.shift();
		if (!next) throw new Error(`unexpected request ${String(input)}`);
		return next;
	}) as typeof globalThis.fetch;
	return { fetch, urls };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

function provider(answers: Response[]) {
	const { fetch, urls } = fakeFetch(answers);
	const clock = fixedClock(0);
	const oidc = createOidcProvider(
		{ issuer: ISSUER, clientId: 'stella', clientSecret: 's', redirectUri: 'https://x/cb' },
		{ fetch, clock }
	);
	const discoveries = () => urls.filter((u) => u.endsWith('/openid-configuration')).length;
	return { oidc, clock, urls, discoveries };
}

describe('the OIDC discovery document', () => {
	it('fails loud when the IdP answers 200 with something else', async () => {
		const { oidc } = provider([json({ error: 'maintenance' })]);
		await expect(oidc.authorizationEndpoint()).rejects.toThrow(/discovery document/);
	});

	it('refuses an endpoint that is not a URL', async () => {
		const { oidc } = provider([json({ ...discovery(), token_endpoint: 'nope' })]);
		await expect(oidc.authorizationEndpoint()).rejects.toThrow(/discovery document/);
	});

	it('is read once within the hour and again after it', async () => {
		const { oidc, clock, discoveries } = provider([json(discovery()), json(discovery())]);
		expect(await oidc.authorizationEndpoint()).toBe(`${ISSUER}/authorize`);
		clock.advance(DISCOVERY_TTL_MS - 1);
		await oidc.authorizationEndpoint();
		expect(discoveries()).toBe(1);
		clock.advance(1);
		await oidc.authorizationEndpoint();
		expect(discoveries()).toBe(2);
	});

	it('is read anew after a failed token exchange, so a moved endpoint is found', async () => {
		const { oidc, urls } = provider([
			json(discovery(`${ISSUER}/old-token`)),
			new Response('gone', { status: 404 }),
			json(discovery(`${ISSUER}/new-token`)),
			new Response('bad', { status: 400 })
		]);
		const exchange = () => oidc.exchangeCode({ code: 'c', codeVerifier: 'v', expectedNonce: 'n' });
		await expect(exchange()).rejects.toThrow(/token exchange failed/);
		await expect(exchange()).rejects.toThrow(/token exchange failed/);
		expect(urls).toEqual([
			`${ISSUER}/.well-known/openid-configuration`,
			`${ISSUER}/old-token`,
			`${ISSUER}/.well-known/openid-configuration`,
			`${ISSUER}/new-token`
		]);
	});
});
