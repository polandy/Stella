import { circleNameKey } from '../../../circles/name-key';
import type { Viewer } from '../../access/visibility';
import {
	suggestRoles,
	type CircleRoleUse,
	type ContactCircleView,
	type MemberView
} from './circles';

/*
 * Who is in which circle, and under which role (docs/02 §2.4.2): a circle's members, a person's
 * circles, and the roles the household already uses. A read model, apart from the
 * `CircleRepository` that writes the memberships (docs/08 §8.3) — re-roling and renaming a role
 * read it to learn whom they may touch.
 *
 * A membership is visible only when its circle AND its contact are; the adapter scopes every
 * read through the access layer (docs/03 §3.7).
 */

/** The memberships, read through the access layer. */
export interface CircleMembershipReads {
	/** One circle's members, by name. */
	listMembersVisibleTo(viewer: Viewer, circleId: string): Promise<MemberView[]>;
	/** The circles one person is in, by name. */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<ContactCircleView[]>;
	/** Every visible membership's role, with the name of the circle it belongs to. */
	listRoleUsesVisibleTo(viewer: Viewer): Promise<CircleRoleUse[]>;
}

export interface CircleMembershipDeps {
	memberships: CircleMembershipReads;
}

export async function listMembers(
	deps: CircleMembershipDeps,
	viewer: Viewer,
	circleId: string
): Promise<MemberView[]> {
	return deps.memberships.listMembersVisibleTo(viewer, circleId);
}

export async function listCirclesForContact(
	deps: CircleMembershipDeps,
	viewer: Viewer,
	contactId: string
): Promise<ContactCircleView[]> {
	return deps.memberships.listForContactVisibleTo(viewer, contactId);
}

/**
 * The roles already used, per circle, for the join-a-circle-by-name flow where the circle is
 * only known by what was typed. Keyed by {@link circleNameKey}, the same rule the field that
 * offers them looks its suggestions up with.
 */
export async function listRoleSuggestionsByCircleName(
	deps: CircleMembershipDeps,
	viewer: Viewer
): Promise<Record<string, string[]>> {
	const uses = await deps.memberships.listRoleUsesVisibleTo(viewer);
	const rolesByName = new Map<string, string[]>();
	for (const use of uses) {
		const key = circleNameKey(use.circleName);
		const roles = rolesByName.get(key) ?? [];
		if (use.role !== null) roles.push(use.role);
		rolesByName.set(key, roles);
	}
	const suggestions: Record<string, string[]> = {};
	for (const [name, roles] of rolesByName) {
		const ranked = suggestRoles(roles);
		if (ranked.length > 0) suggestions[name] = ranked;
	}
	return suggestions;
}
