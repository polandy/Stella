import { circleNameKey } from '../../../circles/name-key';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';

/*
 * Circles = shared contexts (docs/02 §2.4.2): a named group contacts belong to over a period
 * (class, club, team, workplace, friend group…). A first-class shareable record — distinct
 * from tags. Two contacts in the same circle are connected "via {circle}". Pure validation +
 * use-cases over a repository port; all reads are visibility-scoped in the adapter (§3.7).
 */

export const CIRCLE_KINDS = [
	'friends', 'family', 'school', 'class', 'course', 'club', 'team', 'work', 'neighborhood', 'other'
] as const;
export type CircleKind = (typeof CIRCLE_KINDS)[number];

export const CIRCLE_COLORS = [
	'rosewater', 'flamingo', 'pink', 'mauve', 'red', 'maroon', 'peach', 'yellow', 'green', 'teal',
	'sky', 'sapphire', 'blue', 'lavender'
] as const;
export type CircleColor = (typeof CIRCLE_COLORS)[number];

export function resolveCircleKind(kind: string | null | undefined): CircleKind {
	const trimmed = (kind ?? '').trim();
	if (trimmed === '') return 'other';
	if ((CIRCLE_KINDS as readonly string[]).includes(trimmed)) return trimmed as CircleKind;
	throw new Error(`Unknown circle kind: ${trimmed}`);
}

export function resolveCircleColor(color: string | null | undefined): CircleColor {
	const trimmed = (color ?? '').trim();
	if (trimmed === '') return 'blue';
	if ((CIRCLE_COLORS as readonly string[]).includes(trimmed)) return trimmed as CircleColor;
	throw new Error(`Unknown circle colour: ${trimmed}`);
}

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
 * The roles already in use, most common first and ties broken alphabetically — what to offer
 * when someone is added to a circle. Blank roles drop out; spellings that differ only in case
 * fold into the most common one (`Teacher` and `teacher` are one role, not two).
 */
export function suggestRoles(usedRoles: readonly (string | null | undefined)[]): string[] {
	const byKey = new Map<string, { label: string; count: number; labels: Map<string, number> }>();
	for (const raw of usedRoles) {
		const role = (raw ?? '').trim();
		if (role === '') continue;
		const key = role.toLowerCase();
		const entry = byKey.get(key) ?? { label: role, count: 0, labels: new Map() };
		entry.count += 1;
		entry.labels.set(role, (entry.labels.get(role) ?? 0) + 1);
		byKey.set(key, entry);
	}
	return [...byKey.values()]
		.map((e) => {
			// The spelling the household writes most often wins; alphabetical on a tie.
			const label = [...e.labels.entries()].sort(
				(a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
			)[0][0];
			return { label, count: e.count };
		})
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
		.map((e) => e.label);
}

// ── Value shapes ──────────────────────────────────────────────────────────

export interface Circle {
	id: string;
	householdId: string;
	createdBy: string;
	visibility: 'shared' | 'private';
	name: string;
	description: string | null;
	kind: CircleKind;
	color: CircleColor;
	startDate: string | null;
	endDate: string | null;
}

export interface NewCircle extends Circle {
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

// ── Ports ─────────────────────────────────────────────────────────────────

export interface CircleRepository {
	insert(circle: NewCircle): Promise<void>;
	findByNameVisibleTo(viewer: Viewer, name: string): Promise<Circle | null>;
	getVisibleTo(viewer: Viewer, circleId: string): Promise<Circle | null>;
	listVisibleTo(viewer: Viewer): Promise<CircleWithCount[]>;
	/**
	 * Insert those of `memberships` whose contact is not in the circle yet, in **one**
	 * transaction. Skipping is decided inside that transaction, so a pick either lands whole or
	 * not at all and no concurrent join can slip between check and insert. An existing member
	 * keeps the role they joined with.
	 */
	addMemberships(memberships: readonly NewMembership[]): Promise<void>;
	removeMembership(circleId: string, contactId: string): Promise<void>;
	listMembersVisibleTo(viewer: Viewer, circleId: string): Promise<MemberView[]>;
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<ContactCircleView[]>;
	/** Every visible membership's role, with the name of the circle it belongs to. */
	listRoleUsesVisibleTo(viewer: Viewer): Promise<CircleRoleUse[]>;
}

export interface CircleDeps {
	circles: CircleRepository;
	ids: IdGenerator;
	clock: Clock;
}

export interface CircleCreator {
	userId: string;
	householdId: string;
	defaultVisibility: 'shared' | 'private';
}

export interface CreateCircleInput {
	name: string;
	kind?: string | null;
	color?: string | null;
	description?: string | null;
	startDate?: string | null;
	endDate?: string | null;
	visibility?: 'shared' | 'private';
}

// ── Use-cases ───────────────────────────────────────────────────────────────

const orNull = (value?: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** Create a circle. Validates name/kind/colour; defaults visibility to the creator's default. */
export async function createCircle(
	deps: CircleDeps,
	creator: CircleCreator,
	input: CreateCircleInput
): Promise<string> {
	const name = input.name.trim();
	if (name === '') throw new Error('A circle needs a name.');
	const kind = resolveCircleKind(input.kind);
	const color = resolveCircleColor(input.color);

	const now = deps.clock.now();
	const id = deps.ids.next();
	await deps.circles.insert({
		id,
		householdId: creator.householdId,
		createdBy: creator.userId,
		visibility: input.visibility ?? creator.defaultVisibility,
		name,
		description: orNull(input.description),
		kind,
		color,
		startDate: orNull(input.startDate),
		endDate: orNull(input.endDate),
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

export async function removeMember(
	deps: Pick<CircleDeps, 'circles'>,
	circleId: string,
	contactId: string
): Promise<void> {
	await deps.circles.removeMembership(circleId, contactId);
}

export async function listCircles(
	deps: Pick<CircleDeps, 'circles'>,
	viewer: Viewer
): Promise<CircleWithCount[]> {
	return deps.circles.listVisibleTo(viewer);
}

export async function getCircle(
	deps: Pick<CircleDeps, 'circles'>,
	viewer: Viewer,
	circleId: string
): Promise<Circle | null> {
	return deps.circles.getVisibleTo(viewer, circleId);
}

export async function listMembers(
	deps: Pick<CircleDeps, 'circles'>,
	viewer: Viewer,
	circleId: string
): Promise<MemberView[]> {
	return deps.circles.listMembersVisibleTo(viewer, circleId);
}

export async function listCirclesForContact(
	deps: Pick<CircleDeps, 'circles'>,
	viewer: Viewer,
	contactId: string
): Promise<ContactCircleView[]> {
	return deps.circles.listForContactVisibleTo(viewer, contactId);
}

/**
 * The roles already used, per circle, for the join-a-circle-by-name flow where the circle is
 * only known by what was typed. Keyed by {@link circleNameKey}, the same rule the field that
 * offers them looks its suggestions up with.
 */
export async function listRoleSuggestionsByCircleName(
	deps: Pick<CircleDeps, 'circles'>,
	viewer: Viewer
): Promise<Record<string, string[]>> {
	const uses = await deps.circles.listRoleUsesVisibleTo(viewer);
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
