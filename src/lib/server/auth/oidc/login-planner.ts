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

export function planLogin(claims: OidcClaims, lookups: OidcLookups, policy: OidcPolicy): LoginPlan {
	const role = mapRole(claims.groups, policy.adminGroups);
	const roleSync = policy.syncRoles ? role : null;
	const profileSync = policy.syncProfile ? profileFrom(claims) : null;

	// A member an admin removed is turned away before anything about them is synced, and their
	// email links nobody new beside them: a restore is the way back (docs/02 §2.1).
	if (lookups.existingUser?.removed || lookups.userByEmail?.removed) {
		return { action: 'deny', reason: 'removed' };
	}

	if (lookups.existingUser) {
		return {
			action: 'use-existing',
			userId: lookups.existingUser.id,
			role: roleSync,
			profile: profileSync
		};
	}

	if (policy.linkByEmail && claims.emailVerified && lookups.userByEmail) {
		return { action: 'link', userId: lookups.userByEmail.id, role: roleSync, profile: profileSync };
	}

	if (policy.jitProvision) {
		return { action: 'provision', role, profile: profileFrom(claims) };
	}

	return { action: 'deny', reason: 'no-account' };
}
