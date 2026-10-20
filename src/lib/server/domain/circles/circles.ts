import { roleKey } from '../../../circles/role-key';
import type { Remover, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { ActivityOf } from '../activity/activity';
import {
	CIRCLE_COLORS,
	readCircleDetails,
	type CircleColor,
	type CircleDetails,
	type CircleDetailsInput,
	type CircleKind
} from './circle-details';
import type { CircleDeletionFacts, DeletedCirclePhotoFiles } from './delete-circle';
import type { CircleMembershipReads } from './memberships';
import { CircleParentGoneError } from './nesting';

/*
 * Circles = shared contexts (docs/02 §2.4.2): a named group contacts belong to over a period
 * (class, club, team, workplace, friend group…). A first-class shareable record — distinct
 * from tags. Two contacts in the same circle are connected "via {circle}". Pure validation +
 * use-cases over a repository port; all reads are visibility-scoped in the adapter (§3.7). What
 * the screens list are read models of their own: the overview (`directory.ts`) and who is in
 * which circle (`memberships.ts`).
 */

// The vocabularies and their checks live with the rest of a circle's details; re-exported here
// because most callers think of them as the circle's.
export {
	CIRCLE_COLORS,
	CIRCLE_KINDS,
	resolveCircleColor,
	resolveCircleKind,
	type CircleColor,
	type CircleDetails,
	type CircleDetailsInput,
	type CircleKind
} from './circle-details';

/**
 * Suggest a colour to pre-select when creating a circle: a random one **not yet used** by
 * existing circles, so circles stay visually distinct; if every colour is taken, any random
 * one. `rng` is injectable for deterministic tests.
 */
export function suggestCircleColor(
	usedColors: readonly string[],
	rng: () => number = Math.random
): CircleColor {
	const used = new Set(usedColors);
	const free = CIRCLE_COLORS.filter((c) => !used.has(c));
	const pool = free.length > 0 ? free : CIRCLE_COLORS;
	return pool[Math.floor(rng() * pool.length)];
}

/**
 * The one rule for which roles are "the same": trimmed, case-folded, blank means none. Each
 * role comes back under the spelling the household writes most often (alphabetical on a tie),
 * with the items that carry it, most common role first and ties broken alphabetically. Items
 * without a role are left out.
 */
function foldByRole<T>(
	items: readonly T[],
	roleOf: (item: T) => string | null | undefined
): { label: string; items: T[] }[] {
	const byKey = new Map<string, { items: T[]; spellings: Map<string, number> }>();
	for (const item of items) {
		const key = roleKey(roleOf(item));
		if (key === null) continue;
		const role = (roleOf(item) ?? '').trim();
		const entry = byKey.get(key) ?? { items: [] as T[], spellings: new Map<string, number>() };
		entry.items.push(item);
		entry.spellings.set(role, (entry.spellings.get(role) ?? 0) + 1);
		byKey.set(key, entry);
	}
	return [...byKey.values()]
		.map((e) => {
			const label = [...e.spellings.entries()].sort(
				(a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
			)[0][0];
			return { label, items: e.items };
		})
		.sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
}

/**
 * The roles already in use, most common first and ties broken alphabetically — what to offer
 * when someone is added to a circle. Blank roles drop out; spellings that differ only in case
 * fold into the most common one (`Teacher` and `teacher` are one role, not two).
 */
export function suggestRoles(usedRoles: readonly (string | null | undefined)[]): string[] {
	return foldByRole(usedRoles, (role) => role).map((group) => group.label);
}

/** The people of a circle who share one role; `role` is null for those who have none. */
export interface RoleGroup<T> {
	role: string | null;
	members: T[];
}

/**
 * A circle's members grouped by role, in the order `suggestRoles` offers the roles, with the
 * people who have no role last. The members' own order is kept inside each group.
 */
export function groupMembersByRole<T extends { role: string | null }>(
	members: readonly T[]
): RoleGroup<T>[] {
	const groups: RoleGroup<T>[] = foldByRole(members, (m) => m.role).map((g) => ({
		role: g.label,
		members: g.items
	}));
	const withoutRole = members.filter((m) => roleKey(m.role) === null);
	if (withoutRole.length > 0) groups.push({ role: null, members: withoutRole });
	return groups;
}

// ── Value shapes ──────────────────────────────────────────────────────────

export interface Circle extends CircleDetails {
	id: string;
	householdId: string;
	createdBy: string;
	visibility: 'shared' | 'private';
}

export interface NewCircle extends Circle {
	/** The circle it belongs to (docs/02 §2.4.2); null stands on its own. */
	parentCircleId: string | null;
	createdAt: number;
	updatedAt: number;
}

/** How many faces a circle card shows before it says "+n". */
export const CIRCLE_PREVIEW_SIZE = 4;

/** A member as a circle card shows them: a face and a name. */
export interface MemberPreview {
	contactId: string;
	displayName: string;
	avatarPhotoId: string | null;
}

/** A circle as the overview lists it: with how many, and which faces, the viewer may see. */
export interface CircleWithCount extends Circle {
	memberCount: number;
	/** The first `CIRCLE_PREVIEW_SIZE` visible members by name (docs/05 §5.5). */
	preview: MemberPreview[];
}

export interface NewMembership {
	id: string;
	circleId: string;
	contactId: string;
	role: string | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
}

/** A member of a circle, as shown on the circle detail page. */
export interface MemberView {
	membershipId: string;
	contactId: string;
	displayName: string;
	avatarPhotoId: string | null;
	role: string | null;
}

/** A circle a contact belongs to, as shown on the contact profile. */
export interface ContactCircleView {
	membershipId: string;
	circleId: string;
	name: string;
	kind: CircleKind;
	color: CircleColor;
	role: string | null;
}

/** One membership's role, as the role suggestions read them: which circle, which role. */
export interface CircleRoleUse {
	circleName: string;
	role: string | null;
}

/**
 * One role of a circle renamed: these memberships and these photos of the circle take `role`.
 * The use-case has already chosen them (`rename-role.ts`); the adapter only writes.
 */
export interface RoleRename {
	circleId: string;
	contactIds: readonly string[];
	photoIds: readonly string[];
	role: string;
	updatedAt: number;
}

// ── Ports ─────────────────────────────────────────────────────────────────

/** A circle's writes and the one-circle reads they rest on; the lists are read models. */
export interface CircleRepository {
	insert(circle: NewCircle): Promise<void>;
	findByNameVisibleTo(viewer: Viewer, name: string): Promise<Circle | null>;
	getVisibleTo(viewer: Viewer, circleId: string): Promise<Circle | null>;
	/**
	 * Insert those of `memberships` whose contact is not in the circle yet, in **one**
	 * transaction. Skipping is decided inside that transaction, so a pick either lands whole or
	 * not at all and no concurrent join can slip between check and insert. An existing member
	 * keeps the role they joined with.
	 */
	addMemberships(memberships: readonly NewMembership[]): Promise<void>;
	removeMembership(circleId: string, contactId: string): Promise<void>;
	/**
	 * Give each of `contactIds` that is in the circle `role` (null clears it), in **one**
	 * transaction, so a bulk re-role lands whole or not at all. People not in the circle are
	 * left out rather than joined.
	 */
	setRoles(
		circleId: string,
		contactIds: readonly string[],
		role: string | null,
		updatedAt: number
	): Promise<void>;
	/**
	 * Rename a role across the circle's memberships **and** its photos in **one** transaction, so
	 * a role never ends up half renamed — its people under the new name, its banner under the
	 * old. Rows of other circles are never touched, whatever ids are passed.
	 */
	renameRole(change: RoleRename): Promise<void>;
	/**
	 * Give the circle `details`, if `viewer` sees it — the visibility rule is the write's own
	 * condition. Answers whether a circle was changed: false means not visible, or gone.
	 */
	update(
		viewer: Viewer,
		circleId: string,
		details: CircleDetails,
		updatedAt: number
	): Promise<boolean>;
	/**
	 * Put the circle under `parentId` (null: on its own), if `viewer` sees it — the visibility
	 * rule is the write's own condition; whether the move is allowed is `planCircleMove`'s.
	 * Answers whether a circle was changed: false means not visible, or gone.
	 */
	setParent(
		viewer: Viewer,
		circleId: string,
		parentId: string | null,
		updatedAt: number
	): Promise<boolean>;
	/**
	 * What deleting the circle would take, if `remover` may delete it (`circleDeletableBy`), else
	 * null. Counts what the remover cannot see too, since the deletion takes it.
	 */
	readDeletion(remover: Remover, circleId: string): Promise<CircleDeletionFacts | null>;
	/**
	 * Delete the circle in **one** transaction, if `remover` may — the rule is the `DELETE`'s own
	 * condition: the cuts of its photos are turned first, its photos (framings included) go, its
	 * memberships cascade and its children lose their parent; `audit` is logged with it. Answers
	 * the files of the deleted photos, to unlink after the commit, or null when nothing was
	 * deleted.
	 */
	deleteDeletable(
		remover: Remover,
		circleId: string,
		audit: ActivityOf<'circle.deleted'>
	): Promise<DeletedCirclePhotoFiles[] | null>;
}

export interface CircleDeps {
	circles: CircleRepository;
	ids: IdGenerator;
	clock: Clock;
}

/** Re-roling members: who is in the circle decides whom the write may touch. */
export interface MemberRoleDeps {
	circles: Pick<CircleRepository, 'setRoles'>;
	memberships: Pick<CircleMembershipReads, 'listMembersVisibleTo'>;
	clock: Clock;
}

/** Taking someone out of a circle: who is in it, as the viewer sees it, decides whom it may touch. */
export interface MemberRemovalDeps {
	circles: Pick<CircleRepository, 'removeMembership'>;
	memberships: Pick<CircleMembershipReads, 'listMembersVisibleTo'>;
}

export interface CircleCreator {
	userId: string;
	householdId: string;
	defaultVisibility: 'shared' | 'private';
}

export interface CreateCircleInput extends CircleDetailsInput {
	visibility?: 'shared' | 'private';
	/** The circle the new one belongs to, which the creator must see; none when left out. */
	parentId?: string | null;
}

// ── Use-cases ───────────────────────────────────────────────────────────────

const orNull = (value?: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/**
 * Create a circle. Its details are checked as editing checks them (`readCircleDetails`);
 * visibility defaults to the creator's default. A parent must be one the creator sees — a new
 * circle has nothing inside it yet, so it cannot close a loop.
 */
export async function createCircle(
	deps: CircleDeps,
	creator: CircleCreator,
	input: CreateCircleInput
): Promise<string> {
	const details = readCircleDetails(input);
	const parentCircleId = input.parentId ?? null;
	if (parentCircleId !== null) {
		const viewer = { id: creator.userId, householdId: creator.householdId };
		if (!(await deps.circles.getVisibleTo(viewer, parentCircleId))) {
			throw new CircleParentGoneError();
		}
	}

	const now = deps.clock.now();
	const id = deps.ids.next();
	await deps.circles.insert({
		id,
		householdId: creator.householdId,
		createdBy: creator.userId,
		visibility: input.visibility ?? creator.defaultVisibility,
		...details,
		parentCircleId,
		createdAt: now,
		updatedAt: now
	});
	return id;
}

/**
 * Join a contact to a circle by name (the contact-profile flow): reuse an existing visible
 * circle of that name, or create it on the fly. Idempotent on membership. Returns the circle id.
 */
export async function joinCircleByName(
	deps: CircleDeps,
	creator: CircleCreator,
	contactId: string,
	circleName: string,
	role?: string | null
): Promise<string> {
	const name = circleName.trim();
	if (name === '') throw new Error('A circle needs a name.');

	const viewer = { id: creator.userId, householdId: creator.householdId };
	const existing = await deps.circles.findByNameVisibleTo(viewer, name);
	const circleId = existing?.id ?? (await createCircle(deps, creator, { name }));
	await addMember(deps, creator, circleId, contactId, role);
	return circleId;
}

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

export async function getCircle(
	deps: Pick<CircleDeps, 'circles'>,
	viewer: Viewer,
	circleId: string
): Promise<Circle | null> {
	return deps.circles.getVisibleTo(viewer, circleId);
}
