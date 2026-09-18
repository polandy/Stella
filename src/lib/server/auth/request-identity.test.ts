import { beforeEach, describe, expect, it } from 'bun:test';
import type { AuthUser } from './accounts';
import { issueApiToken, type ApiTokenRecord } from './api-tokens';
import { resolveRequestIdentity, type RequestIdentityDeps } from './request-identity';
import { createSession, type SessionRecord } from './session';

/*
 * Who a request is (docs/04 §4.4, docs/02 §2.16.1). Two credentials, two territories: the
 * session cookie opens the app's pages, an API token opens `/api/v1/`, and neither crosses
 * over. Every refusal below is paired with the same credential being accepted on its own side,
 * so a case cannot pass because nothing signs in at all.
 */

const NOW = 1_700_000_000_000;
const ANNA: AuthUser = {
	id: 'user-anna',
	householdId: 'h',
	email: 'anna@example.test',
	name: 'Anna',
	role: 'member',
	locale: null,
	selfContactId: null
};

let deps: RequestIdentityDeps;
let tokens: ApiTokenRecord[];
let sessions: SessionRecord[];

beforeEach(() => {
	tokens = [];
	sessions = [];
	let seq = 0;
	deps = {
		apiTokens: {
			tokens: {
				insert: async (r) => void tokens.push(r),
				findByHash: async (hash) => tokens.find((t) => t.tokenHash === hash) ?? null,
				listForUser: async () => tokens,
				deleteForUser: async () => false,
				touch: async () => {}
			},
			clock: { now: () => NOW },
			ids: { next: () => `tok-${++seq}` }
		},
		sessions: {
			sessions: {
				create: async (s) => void sessions.push(s),
				findById: async (id) => sessions.find((s) => s.id === id) ?? null,
				updateExpiry: async () => {},
				delete: async (id) => void (sessions = sessions.filter((s) => s.id !== id))
			},
			clock: { now: () => NOW }
		},
		findUser: async (id) => (id === ANNA.id ? ANNA : null)
	};
});

const apiToken = async () =>
	(await issueApiToken(deps.apiTokens, ANNA.id, { name: 'script', lifetimeDays: 30 })).token;
const sessionToken = async () => (await createSession(deps.sessions, ANNA.id)).token;

describe('resolveRequestIdentity', () => {
	it('signs an API request in by its bearer token', async () => {
		const token = await apiToken();
		expect(
			await resolveRequestIdentity(deps, {
				pathname: '/api/v1/people',
				authorization: `Bearer ${token}`,
				sessionToken: undefined
			})
		).toEqual({ user: ANNA, viaApi: true, staleSessionCookie: false });
	});

	it('does not let a session cookie sign an API request in', async () => {
		const cookie = await sessionToken();
		const onApi = await resolveRequestIdentity(deps, {
			pathname: '/api/v1/import',
			authorization: null,
			sessionToken: cookie
		});
		const onPage = await resolveRequestIdentity(deps, {
			pathname: '/settings',
			authorization: null,
			sessionToken: cookie
		});
		expect(onApi.user).toBeNull();
		expect(onPage.user).toEqual(ANNA);
	});

	it('does not let an API token open a page', async () => {
		const token = await apiToken();
		const onPage = await resolveRequestIdentity(deps, {
			pathname: '/settings',
			authorization: `Bearer ${token}`,
			sessionToken: undefined
		});
		const onApi = await resolveRequestIdentity(deps, {
			pathname: '/api/v1/people',
			authorization: `Bearer ${token}`,
			sessionToken: undefined
		});
		expect(onPage).toEqual({ user: null, viaApi: false, staleSessionCookie: false });
		expect(onApi.user).toEqual(ANNA);
	});

	it('asks for a cookie that no longer signs anyone in to be cleared, on a page only', async () => {
		const unknown = { authorization: null, sessionToken: 'no-such-session' };
		expect(await resolveRequestIdentity(deps, { pathname: '/', ...unknown })).toEqual({
			user: null,
			viaApi: false,
			staleSessionCookie: true
		});
		expect(await resolveRequestIdentity(deps, { pathname: '/api/v1/people', ...unknown })).toEqual({
			user: null,
			viaApi: true,
			staleSessionCookie: false
		});
	});

	it('signs nobody in whose member is gone', async () => {
		const token = await apiToken();
		const cookie = await sessionToken();
		deps.findUser = async () => null;
		expect(
			(
				await resolveRequestIdentity(deps, {
					pathname: '/api/v1/people',
					authorization: `Bearer ${token}`,
					sessionToken: undefined
				})
			).user
		).toBeNull();
		expect(
			await resolveRequestIdentity(deps, {
				pathname: '/',
				authorization: null,
				sessionToken: cookie
			})
		).toEqual({
			user: null,
			viaApi: false,
			staleSessionCookie: true
		});
	});
});
