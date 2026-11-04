import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { isHttpError, isRedirect, type Cookies } from '@sveltejs/kit';
import { setOidcTransaction, type OidcTransaction } from '$lib/server/auth/cookies';
import type { OidcClaims } from '$lib/server/auth/oidc/types';
import type { SessionRecord } from '$lib/server/auth/session';
import type { AuthServices } from '$lib/server/services/auth';
import type { AppServices } from '$lib/server/services/app-services';

/*
 * The SSO callback (docs/04 §4.4) over a test-wired `locals.services`: the provider is a fake,
 * so the branches — SSO off, already signed in, a planted cookie, a failing exchange — are
 * testable without an IdP. The transaction cookie is sealed by the real helper with the test
 * configuration's secret (`env-test-preload.ts`), as `/login/sso` would have set it.
 */
const { GET } = await import('./+server');

const NOW = Date.UTC(2026, 10, 3, 9);
const TX: OidcTransaction = { state: 'the-state', nonce: 'the-nonce', codeVerifier: 'verifier' };

let jar: Map<string, string>;
let sessions: Map<string, SessionRecord>;
let exchanges: number;
let exchange: () => Promise<{ claims: OidcClaims; idToken: string }>;
let exchangedWith: { codeVerifier: string; expectedNonce: string } | null;
let logged: unknown[][];
let errorSpy: ReturnType<typeof spyOn>;

const cookies = {
	get: (name: string) => jar.get(name),
	set: (name: string, value: string) => void jar.set(name, value),
	delete: (name: string) => void jar.delete(name)
} as unknown as Cookies;

function servicesWith(oidc: boolean): AppServices {
	const auth: Pick<AuthServices, 'methods' | 'sessionDeps' | 'completeLoginDeps'> = {
		methods: { local: true, oidc },
		sessionDeps: {
			sessions: {
				create: async (session) => void sessions.set(session.id, session),
				findById: async (id) => sessions.get(id) ?? null,
				updateExpiry: async () => {},
				delete: async (id) => void sessions.delete(id)
			},
			clock: { now: () => NOW }
		},
		completeLoginDeps: {
			provider: {
				exchangeCode: (params: { codeVerifier: string; expectedNonce: string }) => {
					exchanges++;
					exchangedWith = params;
					return exchange();
				}
			},
			// An identity this household already knows: the plan is `use-existing`.
			identities: {
				findUserByIssuerSubject: async () => ({ id: 'user-7', removed: false }),
				findUserByEmail: async () => null,
				updateRoleAndProfile: async () => {},
				touchIdentity: async () => {}
			},
			policy: {
				allowedGroups: [],
				adminGroups: [],
				allowedEmails: [],
				jitProvision: false,
				linkByEmail: false,
				syncRoles: false,
				syncProfile: false
			},
			clock: { now: () => NOW }
		} as unknown as AuthServices['completeLoginDeps']
	};
	return { auth: auth as AuthServices } as AppServices;
}

async function callback(
	services: AppServices,
	{ user = null as { id: string } | null } = {}
): Promise<unknown> {
	const event = {
		url: new URL('http://localhost/login/sso/callback?code=the-code&state=the-state'),
		cookies,
		locals: { services, user, requestId: 'req-42', locale: 'en' }
	};
	try {
		await GET(event as unknown as Parameters<typeof GET>[0]);
	} catch (thrown) {
		if (isHttpError(thrown) || isRedirect(thrown)) return thrown;
		throw thrown;
	}
	throw new Error('the callback answered without a redirect or an error');
}

const location = (answer: unknown) => (isRedirect(answer) ? answer.location : null);

beforeEach(() => {
	jar = new Map();
	sessions = new Map();
	exchanges = 0;
	exchangedWith = null;
	exchange = async () => {
		throw new Error('no exchange expected');
	};
	logged = [];
	errorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
		logged.push(args);
	});
	setOidcTransaction(cookies, TX);
});

afterEach(() => errorSpy.mockRestore());

describe('GET /login/sso/callback', () => {
	it('opens the sealed transaction and signs the member in', async () => {
		exchange = async () => ({
			claims: {
				issuer: 'https://auth.example.test',
				subject: 'sub-7',
				email: 'ada@example.test',
				emailVerified: true,
				name: 'Ada',
				groups: []
			},
			idToken: 'id-token'
		});
		expect(location(await callback(servicesWith(true)))).toBe('/');
		expect(exchangedWith).toMatchObject({ codeVerifier: 'verifier', expectedNonce: 'the-nonce' });
		expect([...sessions.values()].map((s) => s.userId)).toEqual(['user-7']);
		expect(jar.has('stella_session')).toBe(true);
		expect(jar.has('stella_oidc')).toBe(false);
	});

	it('answers 404 when SSO is off, without asking the provider', async () => {
		const answer = await callback(servicesWith(false));
		expect(isHttpError(answer) && answer.status).toBe(404);
		expect(exchanges).toBe(0);
		expect(sessions.size).toBe(0);
	});

	it('keeps the session of a member already signed in instead of swapping it', async () => {
		const answer = await callback(servicesWith(true), { user: { id: 'user-1' } });
		expect(location(answer)).toBe('/');
		expect(exchanges).toBe(0);
		expect(sessions.size).toBe(0);
		expect(jar.has('stella_oidc')).toBe(false);
	});

	it('refuses a planted unsigned transaction cookie', async () => {
		jar.set('stella_oidc', JSON.stringify(TX));
		expect(location(await callback(servicesWith(true)))).toBe('/login?error=sso');
		expect(exchanges).toBe(0);
	});

	it('logs a failing exchange with the request id before returning to the login page', async () => {
		const failure = new Error('invalid_client');
		exchange = async () => {
			throw failure;
		};
		expect(location(await callback(servicesWith(true)))).toBe('/login?error=sso');
		expect(logged).toHaveLength(1);
		expect(String(logged[0][0])).toContain('req-42');
		expect(logged[0]).toContain(failure);
	});
});
