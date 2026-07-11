import type { Role } from '../accounts';

/*
 * OIDC domain types (docs/02 §2.1.2, docs/04 §4.4). Pure data shared by the relying-party
 * logic; no framework or library types leak in here.
 */

/** The claims Stella consumes from a verified ID token. */
export interface OidcClaims {
	issuer: string;
	subject: string;
	email: string | null;
	emailVerified: boolean;
	name: string | null;
	groups: string[];
}

/** Authorization + provisioning policy, derived from configuration. */
export interface OidcPolicy {
	/** Groups permitted to sign in; empty = any authenticated user. */
	allowedGroups: string[];
	/** Groups mapped to the admin role. */
	adminGroups: string[];
	/** Explicit email allowlist; empty = no email restriction. */
	allowedEmails: string[];
	/** Create a new user on first login when no account matches. */
	jitProvision: boolean;
	/** On first login, link to an existing local user by verified email. */
	linkByEmail: boolean;
	/** Re-apply group→role mapping on every login. */
	syncRoles: boolean;
	/** Refresh name/email from claims on every login. */
	syncProfile: boolean;
}

/** What the login planner found in the store for the incoming identity. */
export interface OidcLookups {
	/** An existing federated identity matching (issuer, subject). */
	existingUserId: string | null;
	/** An existing local user matching the claim email (for first-login linking). */
	userIdByEmail: string | null;
}

/** Optional profile fields to write when syncing. */
export interface ProfilePatch {
	name: string;
	email: string;
}

/** The decision the planner produces; the orchestrator carries it out. */
export type LoginPlan =
	| { action: 'deny'; reason: 'not-authorized' | 'no-account' }
	| { action: 'use-existing'; userId: string; role: Role | null; profile: ProfilePatch | null }
	| { action: 'link'; userId: string; role: Role | null; profile: ProfilePatch | null }
	| { action: 'provision'; role: Role; profile: ProfilePatch };
