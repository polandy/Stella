import type { ArrangeMode } from '../../../circles/arrange';
import { circleTree } from '../../../circles/tree';
import { phrase } from '../../../i18n/phrase';
import { TranslatableError } from '../../../i18n/translatable';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { NewMembership } from './circles';
import type { CircleTreeReads } from './tree';

/*
 * Arranging people between a circle and its sub-circles (docs/02 §2.4.2, ADR-127): one batch of
 * persons × source circle → one target circle, moved or copied, in one transaction.
 *
 * - *Move* gives the person a membership in the target and **deletes** the one at the source (no
 *   end date). *Copy* leaves the source alone.
 * - A copy's new membership carries the role only: period and note stay empty. A move's carries
 *   the role, the period and the note, since the same stay continues in the new circle. A person
 *   picked in several source circles of one move takes everything from the first pick.
 * - A person already in the target gets no second membership; a move still takes them out of
 *   the source.
 * - Memberships stay direct (no inheritance): a sub-circle's people are not the parent's.
 *
 * Only the circle the screen is opened on and the sub-circles below it (at any depth) take part,
 * and only those the viewer sees; anything else is refused, never skipped. Every change returns
 * what it did exactly (`ArrangementChange`), and `undoArrangement` puts that back — rows deleted
 * come back with role, period and note, rows added are taken away again — re-checked like the
 * change was, since the client carries the receipt.
 */

/** A person in one circle, as the arrange screen lists them. */
export interface ArrangeMember {
	circleId: string;
	contactId: string;
	displayName: string;
	avatarPhotoId: string | null;
	role: string | null;
	startDate: string | null;
	endDate: string | null;
	note: string | null;
}

/** A membership row exactly as stored, so a deleted one can be put back. */
export interface MembershipSnapshot {
	id: string;
	circleId: string;
	contactId: string;
	role: string | null;
	startDate: string | null;
	endDate: string | null;
	note: string | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
}

/** A membership the arrangement created, with what it had when created (to spot later edits). */
export interface AddedMembership {
	id: string;
	circleId: string;
	contactId: string;
	role: string | null;
	/** Period and note: empty on a copy, the source's on a move. */
	startDate: string | null;
	endDate: string | null;
	note: string | null;
	updatedAt: number;
}

/** What an arrangement did to the stored memberships: all `undoArrangement` needs. */
export interface ArrangementChange {
	added: AddedMembership[];
	removed: MembershipSnapshot[];
}

/** A membership to create: a copy carries the role, a move also the period and the note. */
export interface ArrangeAdd extends NewMembership {
	startDate: string | null;
	endDate: string | null;
	note: string | null;
}

/** One planned write batch, decided by the use-case and executed whole by the adapter. */
export interface ArrangementPlan {
	/** One new membership per person to give the target. */
	adds: ArrangeAdd[];
	/** Memberships to delete (move only). */
	removals: { circleId: string; contactId: string }[];
}

/** What the transaction really did — the truth, whatever the plan expected. */
export type ArrangementOutcome = ArrangementChange;

/** What taking an arrangement back managed. */
export interface RevertOutcome {
	/** Added memberships removed again. */
	removed: number;
	/** Added memberships left, because someone edited them since. */
	kept: number;
	/** Deleted memberships put back. */
	restored: number;
	/** Deleted memberships not put back: the person is in that circle again meanwhile. */
	conflicts: number;
}

export interface RevertPlan extends ArrangementChange {
	/** The household the rows must belong to, and who restored them (the author of last resort). */
	householdId: string;
	restoredBy: string;
}

/** The arrangement's writes: each one transaction (docs/08 §8.3). */
export interface CircleArrangementRepository {
	/**
	 * Delete the `removals` and insert those of the `adds` whose contact is not in that circle yet,
	 * in **one** transaction, answering what was really deleted and inserted.
	 */
	arrange(plan: ArrangementPlan): Promise<ArrangementOutcome>;
	/**
	 * Take an arrangement back in **one** transaction: delete each added membership that still
	 * is as it was made, re-insert each deleted one whose person is not back in that circle.
	 */
	revert(plan: RevertPlan): Promise<RevertOutcome>;
}

/** What the arrange screen reads, through the access layer (docs/03 §3.7). */
export interface CircleArrangementReads {
	/** The memberships of `circleIds` whose circle and contact the viewer sees, by name. */
	listMembersOfVisibleTo(viewer: Viewer, circleIds: readonly string[]): Promise<ArrangeMember[]>;
	/** Of `contactIds`, those the viewer sees. */
	visibleContactIdsAmong(viewer: Viewer, contactIds: readonly string[]): Promise<Set<string>>;
}

export interface ArrangePeopleDeps {
	tree: CircleTreeReads;
	arrangement: CircleArrangementReads;
	circles: CircleArrangementRepository;
	ids: IdGenerator;
	clock: Clock;
}

/** A circle that is not there for the viewer, or not part of this arrangement. */
export class ArrangeScopeError extends TranslatableError {
	constructor() {
		super(phrase('errors.circle.arrangeGone'), 'ArrangeScopeError');
	}
}

/** A person picked is no longer where the screen showed them: it changed meanwhile. */
export class ArrangeStaleError extends TranslatableError {
	constructor() {
		super(phrase('errors.circle.arrangeStale'), 'ArrangeStaleError');
	}
}

/** Nothing would change: everyone picked is in the target already (or is picked from it). */
export class ArrangeNothingToDoError extends TranslatableError {
	constructor() {
		super(phrase('errors.circle.arrangeNothing'), 'ArrangeNothingToDoError');
	}
}

/** One person picked in one circle. */
export interface ArrangePick {
	circleId: string;
	contactId: string;
}

export interface ArrangeRequest {
	/** The circle the screen is opened on. */
	scopeCircleId: string;
	mode: ArrangeMode;
	targetId: string;
	picks: readonly ArrangePick[];
}

/** What an arrangement answers: enough for the toast, and the receipt for *Undo*. */
export interface ArrangeResult {
	mode: ArrangeMode;
	targetId: string;
	targetName: string;
	/** People given a membership in the target. */
	addedCount: number;
	/** People who were in the target already. */
	alreadyThereCount: number;
	change: ArrangementChange;
}

/** One card of the screen: a circle of the arrangement and the people directly in it. */
export interface ArrangeZone {
	circleId: string;
	name: string;
	/** The names from the circle the screen is opened on down to this one; empty for that one. */
	path: string[];
	members: ArrangeMember[];
}

interface Scope {
	/** The circle and its sub-circles at any depth, in display order. */
	circles: { id: string; name: string; path: string[] }[];
}

async function readScope(
	deps: Pick<ArrangePeopleDeps, 'tree'>,
	viewer: Viewer,
	scopeCircleId: string
): Promise<Scope | null> {
	const tree = circleTree(await deps.tree.treeVisibleTo(viewer));
	const root = tree.get(scopeCircleId);
	if (!root) return null;
	const rootDepth = tree.ancestors(scopeCircleId).length;
	const inScope = [root, ...tree.descendants(scopeCircleId)];
	return {
		circles: inScope.map((c) => ({
			id: c.id,
			name: c.name,
			path:
				c.id === root.id ? [] : [...tree.ancestors(c.id).slice(rootDepth + 1), c].map((p) => p.name)
		}))
	};
}

/**
 * The cards of the screen opened on `circleId`: the circle itself and each sub-circle below it,
 * with the people directly in each. Null when the viewer does not see the circle.
 */
export async function readArrangement(
	deps: Pick<ArrangePeopleDeps, 'tree' | 'arrangement'>,
	viewer: Viewer,
	circleId: string
): Promise<ArrangeZone[] | null> {
	const scope = await readScope(deps, viewer, circleId);
	if (!scope) return null;
	const members = await deps.arrangement.listMembersOfVisibleTo(
		viewer,
		scope.circles.map((c) => c.id)
	);
	return scope.circles.map((c) => ({
		circleId: c.id,
		name: c.name,
		path: c.path,
		members: members.filter((m) => m.circleId === c.id)
	}));
}

/**
 * Decide the writes of one arrangement from the members as the viewer sees them. Pure: a pick
 * from the target itself is no change, a person in two source circles gets one new membership
 * (with the data of the first pick, in request order), and one already in the target gets none.
 */
export function planArrangement(
	request: Pick<ArrangeRequest, 'mode' | 'targetId' | 'picks'>,
	members: readonly ArrangeMember[],
	creator: { userId: string },
	ids: IdGenerator,
	now: number
): { plan: ArrangementPlan; peopleCount: number } {
	const memberAt = new Map(members.map((m) => [`${m.circleId}\u0000${m.contactId}`, m]));
	const inTarget = new Set(
		members.filter((m) => m.circleId === request.targetId).map((m) => m.contactId)
	);

	const picks: ArrangeMember[] = [];
	const seen = new Set<string>();
	for (const pick of request.picks) {
		const at = `${pick.circleId}\u0000${pick.contactId}`;
		const member = memberAt.get(at);
		if (!member) throw new ArrangeStaleError();
		if (pick.circleId === request.targetId || seen.has(at)) continue;
		seen.add(at);
		picks.push(member);
	}

	const people = new Map<string, ArrangeMember>();
	for (const member of picks)
		if (!people.has(member.contactId)) people.set(member.contactId, member);
	const newcomers = [...people.values()].filter((m) => !inTarget.has(m.contactId));

	const nothingChanges = request.mode === 'copy' ? newcomers.length === 0 : picks.length === 0;
	if (nothingChanges) throw new ArrangeNothingToDoError();

	return {
		peopleCount: people.size,
		plan: {
			adds: newcomers.map((m) => ({
				id: ids.next(),
				circleId: request.targetId,
				contactId: m.contactId,
				role: m.role,
				startDate: request.mode === 'move' ? m.startDate : null,
				endDate: request.mode === 'move' ? m.endDate : null,
				note: request.mode === 'move' ? m.note : null,
				createdBy: creator.userId,
				createdAt: now,
				updatedAt: now
			})),
			removals:
				request.mode === 'move'
					? picks.map((m) => ({ circleId: m.circleId, contactId: m.contactId }))
					: []
		}
	};
}

/**
 * Move or copy the picked people into the target, in one transaction. Every circle must be the
 * screen's own or below it, and visible to the viewer; one that is not refuses the whole batch.
 */
export async function arrangePeople(
	deps: ArrangePeopleDeps,
	viewer: Viewer,
	request: ArrangeRequest
): Promise<ArrangeResult> {
	const scope = await readScope(deps, viewer, request.scopeCircleId);
	if (!scope) throw new ArrangeScopeError();
	const names = new Map(scope.circles.map((c) => [c.id, c.name]));
	const target = names.get(request.targetId);
	if (target === undefined) throw new ArrangeScopeError();
	const circleIds = new Set([request.targetId, ...request.picks.map((p) => p.circleId)]);
	if ([...circleIds].some((id) => !names.has(id))) throw new ArrangeScopeError();

	const members = await deps.arrangement.listMembersOfVisibleTo(viewer, [...circleIds]);
	const { plan, peopleCount } = planArrangement(
		request,
		members,
		{ userId: viewer.id },
		deps.ids,
		deps.clock.now()
	);
	const outcome = await deps.circles.arrange(plan);

	// Counted from what the transaction did: someone may have joined the target meanwhile.
	return {
		mode: request.mode,
		targetId: request.targetId,
		targetName: target,
		addedCount: outcome.added.length,
		alreadyThereCount: peopleCount - outcome.added.length,
		change: { added: outcome.added, removed: outcome.removed }
	};
}

/**
 * Take an arrangement back. The receipt came from the client, so it is checked like a new
 * change: every circle in scope and visible, every person visible. Rows that changed since stay
 * as they are, and the outcome says how many.
 */
export async function undoArrangement(
	deps: Pick<ArrangePeopleDeps, 'tree' | 'arrangement' | 'circles'>,
	viewer: Viewer,
	scopeCircleId: string,
	change: ArrangementChange
): Promise<RevertOutcome> {
	const scope = await readScope(deps, viewer, scopeCircleId);
	if (!scope) throw new ArrangeScopeError();
	const inScope = new Set(scope.circles.map((c) => c.id));
	const touched = [...change.added, ...change.removed];
	if (touched.some((m) => !inScope.has(m.circleId))) throw new ArrangeScopeError();
	const contactIds = [...new Set(touched.map((m) => m.contactId))];
	const visible = await deps.arrangement.visibleContactIdsAmong(viewer, contactIds);
	if (contactIds.some((id) => !visible.has(id))) throw new ArrangeScopeError();

	return deps.circles.revert({
		...change,
		householdId: viewer.householdId,
		restoredBy: viewer.id
	});
}
