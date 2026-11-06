import type { Viewer } from '../../access/visibility';
import type { CircleCreator, CircleDeps, MemberRemovalDeps, MemberRoleDeps } from './circles';

/*
 * Who is in a circle (docs/02 §2.4.2): adding people, giving them a role and taking them out.
 * Only memberships the viewer can see are re-roled or removed (docs/03 §3.7).
 */

const orNull = (value?: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** Add a contact to an existing circle (the circle-detail flow). Idempotent. */
export async function addMember(
	deps: CircleDeps,
	creator: Pick<CircleCreator, 'userId'>,
	circleId: string,
	contactId: string,
	role?: string | null
): Promise<void> {
	await addMembers(deps, creator, circleId, [contactId], role);
}

/**
 * Add several contacts to a circle in one go (the circle-detail flow). A role, when given,
 * applies to every one of them. Someone named twice in the same pick joins once, and a contact
 * already in the circle keeps the role they joined with, so this never re-roles an existing
 * member. The whole pick is one transaction: it lands complete or not at all.
 */
export async function addMembers(
	deps: CircleDeps,
	creator: Pick<CircleCreator, 'userId'>,
	circleId: string,
	contactIds: readonly string[],
	role?: string | null
): Promise<void> {
	const now = deps.clock.now();
	const memberRole = orNull(role);
	const memberships = [...new Set(contactIds)].map((contactId) => ({
		id: deps.ids.next(),
		circleId,
		contactId,
		role: memberRole,
		createdBy: creator.userId,
		createdAt: now,
		updatedAt: now
	}));
	await deps.circles.addMemberships(memberships);
}

/**
 * Give several members of a circle one role at once, or none when `role` is blank. The
 * counterpart of {@link addMembers}, which never re-roles someone already in: this is how an
 * existing member changes role. Each member is named once however often the pick repeats them,
 * and only those the viewer can see in this circle are touched — an id from elsewhere, or one
 * that is not a member, is left out rather than written or joined (§3.7).
 */
export async function setMembersRole(
	deps: MemberRoleDeps,
	viewer: Viewer,
	circleId: string,
	contactIds: readonly string[],
	role: string | null | undefined
): Promise<void> {
	const visible = new Set(
		(await deps.memberships.listMembersVisibleTo(viewer, circleId)).map((m) => m.contactId)
	);
	const chosen = [...new Set(contactIds)].filter((id) => visible.has(id));
	if (chosen.length === 0) return;
	await deps.circles.setRoles(circleId, chosen, orNull(role), deps.clock.now());
}

/**
 * Take one person out of a circle. Only a membership the viewer can see is touched — both its
 * circle and its contact visible (§3.7) — so an id from elsewhere, or someone else's private
 * contact, is left in place. Answers whether anyone was removed.
 */
export async function removeMember(
	deps: MemberRemovalDeps,
	viewer: Viewer,
	circleId: string,
	contactId: string
): Promise<boolean> {
	const members = await deps.memberships.listMembersVisibleTo(viewer, circleId);
	if (!members.some((m) => m.contactId === contactId)) return false;
	await deps.circles.removeMembership(circleId, contactId);
	return true;
}
