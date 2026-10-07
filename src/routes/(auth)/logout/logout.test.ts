import { beforeEach, describe, expect, it } from 'bun:test';
import { isRedirect, type Cookies } from '@sveltejs/kit';
import type { AuthServices } from '$lib/server/services/auth';
import type { AppServices } from '$lib/server/services/app-services';
import { SIGNED_OUT_PATH } from '$lib/server/auth/oidc/logout';
import { hashSessionToken } from '$lib/server/auth/tokens';
import type { SessionRecord, SessionRepository } from '$lib/server/auth/session';

/*
 * The sign-out edge (docs/02 §2.1) over a test-wired `locals.services` (AR-01): the route
 * reads its collaborators off the request, so its branching is testable without a database
 * or a provider. The cookie helpers read the configuration, whose `$env` only SvelteKit
 * provides; `env-test-preload.ts` (bunfig.toml) stubs it to the defaults for every test file.
 */
const { POST } = await import('./+server');

const NOW = Date.UTC(2026, 9, 7, 9);
const TOKEN = 'session-token';

let stored: Map<string, SessionRecord>;
let deletedCookies: string[];
let endSessionEndpoint: string | null;

function fakeSessions(): SessionRepository {
	return {
		create: async (session) => void stored.set(session.id, session),
		findById: async (id) => stored.get(id) ?? null,
		updateExpiry: async () => {},
		delete: async (id) => void stored.delete(id)
	};
}

function servicesWith(rpLogout: boolean): AppServices {
	const auth: Pick<AuthServices, 'sessionDeps' | 'rpLogoutDeps'> = {
		sessionDeps: { sessions: fakeSessions(), clock: { now: () => NOW } },
		rpLogoutDeps: {
			provider: { endSessionEndpoint: async () => endSessionEndpoint },
			enabled: rpLogout,
			clientId: 'stella',
			postLogoutRedirectUri: `https://stella.example.test${SIGNED_OUT_PATH}`
		}
	};
	// Sign-out reads only these two; the rest of the graph is not built for this test.
	return { auth: auth as AuthServices };
}

function cookiesWith(token: string | undefined): Cookies {
	return {
		get: (name: string) => (name === 'stella_session' ? token : undefined),
		delete: (name: string) => void deletedCookies.push(name)
	} as unknown as Cookies;
}

async function signOutWith(services: AppServices, token: string | undefined): Promise<string> {
	const event = { cookies: cookiesWith(token), locals: { services } };
	try {
		await POST(event as unknown as Parameters<typeof POST>[0]);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown.location;
		throw thrown;
	}
	throw new Error('sign-out answered without a redirect');
}

beforeEach(() => {
	stored = new Map();
	deletedCookies = [];
	endSessionEndpoint = 'https://auth.example.test/logout';
});

function storeSession(oidcIdToken: string | null) {
	const id = hashSessionToken(TOKEN);
	stored.set(id, { id, userId: 'user-1', expiresAt: NOW + 60_000, oidcIdToken });
}

describe('POST /logout', () => {
	it('revokes the session, clears its cookie and lands on the signed-out page', async () => {
		storeSession(null);
		expect(await signOutWith(servicesWith(true), TOKEN)).toBe(SIGNED_OUT_PATH);
		expect(stored.size).toBe(0);
		expect(deletedCookies).toEqual(['stella_session']);
	});

	it('ends a federated session at the provider too', async () => {
		storeSession('id-token');
		const location = await signOutWith(servicesWith(true), TOKEN);
		expect(location.startsWith('https://auth.example.test/logout?')).toBe(true);
		expect(new URL(location).searchParams.get('id_token_hint')).toBe('id-token');
		expect(stored.size).toBe(0);
	});

	it('stays local when RP logout is off', async () => {
		storeSession('id-token');
		expect(await signOutWith(servicesWith(false), TOKEN)).toBe(SIGNED_OUT_PATH);
	});

	it('still clears the cookie when there is no session', async () => {
		expect(await signOutWith(servicesWith(true), undefined)).toBe(SIGNED_OUT_PATH);
		expect(deletedCookies).toEqual(['stella_session']);
	});
});
