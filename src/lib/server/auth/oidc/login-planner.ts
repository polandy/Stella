import { mapRole } from './authorization';
import type { LoginPlan, OidcClaims, OidcLookups, OidcPolicy, ProfilePatch } from './types';

/*
 * Login planner — decides how an authorized OIDC identity maps to a Stella account
 * (docs/02 §2.1.2). Pure and deterministic: given the claims, what the store already has,
 * and the policy, it returns a plan the orchestrator carries out. It assumes authorization
 * (isAuthorized) has already passed; it only resolves the account.
 */

function profileFrom(claims: OidcClaims): ProfilePatch {
	return {
		name: claims.name ?? claims.email ?? claims.subject,
		email: claims.email ?? ''
	};
}

export function planLogin(
	claims: OidcClaims,
	lookups: OidcLookups,
	policy: OidcPolicy
): LoginPlan {
	const role = mapRole(claims.groups, policy.adminGroups);
	const roleSync = policy.syncRoles ? role : null;
	const profileSync = policy.syncProfile ? profileFrom(claims) : null;

	if (lookups.existingUserId) {
		return { action: 'use-existing', userId: lookups.existingUserId, role: roleSync, profile: profileSync };
	}

	if (policy.linkByEmail && claims.emailVerified && lookups.userIdByEmail) {
		return { action: 'link', userId: lookups.userIdByEmail, role: roleSync, profile: profileSync };
	}

	if (policy.jitProvision) {
		return { action: 'provision', role, profile: profileFrom(claims) };
	}

	return { action: 'deny', reason: 'no-account' };
}
