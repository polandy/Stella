import { describe, expect, it } from 'bun:test';
import { planLogin } from './login-planner';
import type { OidcClaims, OidcLookups, OidcPolicy } from './types';

/*
 * The login planner decides how an incoming OIDC identity maps to a Stella user: reuse a
 * linked identity, link to an existing user by email, JIT-provision, or deny. Pure and
 * deterministic — the heart of "identity linking + JIT + group→role" (docs/02 §2.1.2).
 */

const claims: OidcClaims = {
	issuer: 'https://auth.example.home',
	subject: 'sub-1',
	email: 'andy@example.test',
	emailVerified: true,
	name: 'Andy',
	groups: ['stella-users', 'stella-admins']
};

const basePolicy: OidcPolicy = {
	allowedGroups: ['stella-users'],
	adminGroups: ['stella-admins'],
	allowedEmails: [],
	jitProvision: true,
	linkByEmail: true,
	syncRoles: true,
	syncProfile: true
};

const noLookups: OidcLookups = { existingUserId: null, userIdByEmail: null };

describe('planLogin', () => {
	it('reuses a linked identity and syncs role + profile when enabled', () => {
		const plan = planLogin(claims, { existingUserId: 'user-9', userIdByEmail: null }, basePolicy);
		expect(plan).toEqual({
			action: 'use-existing',
			userId: 'user-9',
			role: 'admin',
			profile: { name: 'Andy', email: 'andy@example.test' }
		});
	});

	it('does not sync role/profile for an existing identity when disabled', () => {
		const plan = planLogin(
			claims,
			{ existingUserId: 'user-9', userIdByEmail: null },
			{ ...basePolicy, syncRoles: false, syncProfile: false }
		);
		expect(plan).toEqual({ action: 'use-existing', userId: 'user-9', role: null, profile: null });
	});

	it('links to an existing local user by verified email on first login', () => {
		const plan = planLogin(claims, { existingUserId: null, userIdByEmail: 'user-3' }, basePolicy);
		expect(plan).toEqual({
			action: 'link',
			userId: 'user-3',
			role: 'admin',
			profile: { name: 'Andy', email: 'andy@example.test' }
		});
	});

	it('does not link by email when the email is unverified', () => {
		const plan = planLogin(
			{ ...claims, emailVerified: false },
			{ existingUserId: null, userIdByEmail: 'user-3' },
			basePolicy
		);
		expect(plan.action).toBe('provision');
	});

	it('JIT-provisions a new user with the mapped role when nothing matches', () => {
		const plan = planLogin(claims, noLookups, basePolicy);
		expect(plan).toEqual({
			action: 'provision',
			role: 'admin',
			profile: { name: 'Andy', email: 'andy@example.test' }
		});
	});

	it('denies when nothing matches and provisioning is off', () => {
		const plan = planLogin(claims, noLookups, { ...basePolicy, jitProvision: false });
		expect(plan).toEqual({ action: 'deny', reason: 'no-account' });
	});
});
