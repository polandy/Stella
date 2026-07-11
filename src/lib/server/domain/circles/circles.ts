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

export interface CircleWithCount extends Circle {
	memberCount: number;
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

// ── Ports ─────────────────────────────────────────────────────────────────

export interface CircleRepository {
	insert(circle: NewCircle): Promise<void>;
	findByNameVisibleTo(viewer: Viewer, name: string): Promise<Circle | null>;
	getVisibleTo(viewer: Viewer, circleId: string): Promise<Circle | null>;
	listVisibleTo(viewer: Viewer): Promise<CircleWithCount[]>;
	membershipExists(circleId: string, contactId: string): Promise<boolean>;
	addMembership(membership: NewMembership): Promise<void>;
	removeMembership(circleId: string, contactId: string): Promise<void>;
	listMembersVisibleTo(viewer: Viewer, circleId: string): Promise<MemberView[]>;
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<ContactCircleView[]>;
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
	if (await deps.circles.membershipExists(circleId, contactId)) return;
	const now = deps.clock.now();
	await deps.circles.addMembership({
		id: deps.ids.next(),
		circleId,
		contactId,
		role: orNull(role),
		createdBy: creator.userId,
		createdAt: now,
		updatedAt: now
	});
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
