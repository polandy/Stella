import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import { completeOidcLogin, type IdentityStore, type OidcProvider } from './login';
import type { OidcClaims, OidcPolicy } from './types';

/*
 * Orchestration of an OIDC callback: verify claims (via the provider port), authorize,
 * resolve/provision the account (via the identity-store port), and report the user id.
 * Tested with fakes — deterministic, no HTTP, no DB (docs/08 §8.3).
 */

const claims: OidcClaims = {
	issuer: 'https://auth.example.home',
	subject: 'sub-1',
	email: 'andy@example.test',
	emailVerified: true,
	name: 'Andy',
	groups: ['stella-users', 'stella-admins']
};

const policy: OidcPolicy = {
	allowedGroups: ['stella-users'],
	adminGroups: ['stella-admins'],
	allowedEmails: [],
	jitProvision: true,
	linkByEmail: true,
	syncRoles: true,
	syncProfile: true
};

const clock: Clock = { now: () => 1_700_000_000_000 };

function fakeProvider(resolved: OidcClaims): OidcProvider {
	return {
		authorizationEndpoint: async () => 'https://auth.example.home/authorize',
		exchangeCode: async () => resolved
	};
}

function fakeStore(seed: Partial<Record<'bySub' | 'byEmail', string>> = {}) {
	const calls: string[] = [];
	const store: IdentityStore = {
		findUserIdByIssuerSubject: async () => seed.bySub ?? null,
		findUserIdByEmail: async () => seed.byEmail ?? null,
		provision: async () => {
			calls.push('provision');
			return 'new-user';
		},
		linkIdentity: async () => {
			calls.push('link');
		},
		updateRoleAndProfile: async () => {
			calls.push('update');
		},
		touchIdentity: async () => {
			calls.push('touch');
		}
	};
	return { store, calls };
}

const deps = (provider: OidcProvider, identities: IdentityStore) => ({
	provider,
	identities,
	policy,
	clock
});

describe('completeOidcLogin', () => {
	it('denies a user who fails the authorization gate, touching nothing', async () => {
		const f = fakeStore();
		const result = await completeOidcLogin(
			deps(fakeProvider({ ...claims, groups: ['other'] }), f.store),
			{ code: 'c', codeVerifier: 'v', expectedNonce: 'n' }
		);
		expect(result).toEqual({ ok: false, reason: 'not-authorized' });
		expect(f.calls).toEqual([]);
	});

	it('JIT-provisions a new user when nothing matches', async () => {
		const f = fakeStore();
		const result = await completeOidcLogin(deps(fakeProvider(claims), f.store), {
			code: 'c',
			codeVerifier: 'v',
			expectedNonce: 'n'
		});
		expect(result).toEqual({ ok: true, userId: 'new-user' });
		expect(f.calls).toContain('provision');
	});

	it('reuses and refreshes an existing linked identity', async () => {
		const f = fakeStore({ bySub: 'user-9' });
		const result = await completeOidcLogin(deps(fakeProvider(claims), f.store), {
			code: 'c',
			codeVerifier: 'v',
			expectedNonce: 'n'
		});
		expect(result).toEqual({ ok: true, userId: 'user-9' });
		expect(f.calls).toEqual(['update', 'touch']);
	});

	it('links to an existing user by verified email on first login', async () => {
		const f = fakeStore({ byEmail: 'user-3' });
		const result = await completeOidcLogin(deps(fakeProvider(claims), f.store), {
			code: 'c',
			codeVerifier: 'v',
			expectedNonce: 'n'
		});
		expect(result).toEqual({ ok: true, userId: 'user-3' });
		expect(f.calls).toEqual(['link', 'update', 'touch']);
	});
});
