import { describe, expect, it } from 'bun:test';
import { isRedirect, type Cookies } from '@sveltejs/kit';
import { readOidcTransaction } from '$lib/server/auth/cookies';
import type { AuthServices } from '$lib/server/services/auth';
import type { AppServices } from '$lib/server/services/app-services';

/*
 * The start of the SSO flow (docs/04 §4.4) over a test-wired `locals.services`: it leaves the
 * one-time values behind in the sealed cookie the callback opens, and only while SSO is on.
 */
const { GET } = await import('./+server');

function servicesWith(oidc: boolean): AppServices {
	const auth: Pick<AuthServices, 'methods' | 'authorizationRequestDeps'> = {
		methods: { local: true, oidc },
		authorizationRequestDeps: {
			provider: { authorizationEndpoint: async () => 'https://auth.example.test/authorize' },
			config: { clientId: 'stella', redirectUri: 'https://stella.test/cb', scopes: 'openid' },
			generators: { state: () => 'the-state', nonce: () => 'the-nonce', codeVerifier: () => 'v' }
		}
	};
	return { auth: auth as AuthServices } as AppServices;
}

async function start(oidc: boolean) {
	const jar = new Map<string, string>();
	const cookies = {
		get: (name: string) => jar.get(name),
		set: (name: string, value: string) => void jar.set(name, value)
	} as unknown as Cookies;
	try {
		await GET({ cookies, locals: { services: servicesWith(oidc) } } as unknown as Parameters<
			typeof GET
		>[0]);
	} catch (thrown) {
		if (isRedirect(thrown)) return { location: thrown.location, cookies, jar };
		throw thrown;
	}
	throw new Error('the SSO start answered without a redirect');
}

describe('GET /login/sso', () => {
	it('sends the visitor to the provider with the transaction sealed in its cookie', async () => {
		const { location, cookies, jar } = await start(true);
		expect(location.startsWith('https://auth.example.test/authorize?')).toBe(true);
		expect(jar.get('stella_oidc')).not.toContain('the-state');
		expect(readOidcTransaction(cookies)).toEqual({
			state: 'the-state',
			nonce: 'the-nonce',
			codeVerifier: 'v'
		});
	});

	it('goes back to the login page, leaving no cookie, while SSO is off', async () => {
		const { location, jar } = await start(false);
		expect(location).toBe('/login');
		expect(jar.size).toBe(0);
	});
});
