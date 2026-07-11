import type { Role } from '../accounts';

/*
 * Sign-in authorization gate and group→role mapping (docs/02 §2.1.2). Pure functions —
 * the only place that decides who may enter via SSO and with what role.
 */

/** Map IdP groups to a Stella role: admin if any group is in the admin set, else member. */
export function mapRole(groups: string[], adminGroups: string[]): Role {
	return groups.some((group) => adminGroups.includes(group)) ? 'admin' : 'member';
}

/**
 * Decide whether a set of claims may sign in. Each configured gate must pass; an empty
 * gate is open. With no gates configured, any authenticated user is allowed.
 */
export function isAuthorized(
	claims: { groups: string[]; email: string | null },
	policy: { allowedGroups: string[]; allowedEmails: string[] }
): boolean {
	const groupGateOpen = policy.allowedGroups.length === 0;
	const groupAllowed = groupGateOpen || claims.groups.some((g) => policy.allowedGroups.includes(g));

	const emailGateOpen = policy.allowedEmails.length === 0;
	const email = claims.email?.toLowerCase() ?? null;
	const allowedEmails = policy.allowedEmails.map((e) => e.toLowerCase());
	const emailAllowed = emailGateOpen || (email !== null && allowedEmails.includes(email));

	return groupAllowed && emailAllowed;
}
