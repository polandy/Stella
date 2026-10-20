import { phrase } from '../../../i18n/phrase';
import { TranslatableError } from '../../../i18n/translatable';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import { CircleGoneError } from './circle-details';
import type { CircleRepository } from './circles';

/*
 * Where a circle sits (docs/02 §2.4.2): under another circle, or standing for itself. The edit
 * form's *Belongs to*, the sub-circles card's *Add existing* and *Detach*, and every *Undo* of
 * them move a circle through `moveCircle`, and the API import refuses a loop with the same
 * `closesLoop` (ADR-125, ADR-126).
 *
 * Seeing the circle and its new parent is enough, as seeing it is enough to edit it; the circle's
 * own visibility never changes. The loop check walks the household's whole nesting, hidden
 * circles included — a hidden circle can sit between two the viewer sees — and answers only yes
 * or no: the refusal names the moved circle, never the one it ran into.
 */

/**
 * The household's nesting as stored: every circle with its parent, hidden ones included. Only the
 * loop check reads it, and nothing of it leaves the domain.
 */
export interface CircleNestingReads {
	parentsInHouseholdOf(viewer: Viewer): Promise<ReadonlyMap<string, string | null>>;
}

export interface CircleNestingDeps {
	circles: Pick<CircleRepository, 'getVisibleTo' | 'setParent'>;
	nesting: CircleNestingReads;
	clock: Clock;
}

/** Putting the circle there would make it its own ancestor. Names only the moved circle. */
export class CircleLoopError extends TranslatableError {
	constructor(name: string) {
		super(phrase('errors.circle.loop', { name }), 'CircleLoopError');
	}
}

/** The chosen parent is not there for this viewer: never visible to them, or deleted meanwhile. */
export class CircleParentGoneError extends TranslatableError {
	constructor() {
		super(phrase('errors.circle.parentNotFound'), 'CircleParentGoneError');
	}
}

/**
 * A checked move: the circle, the parent it has as the viewer sees it (`from`; a parent hidden
 * from them reads as none) and the one it is to have (`to`). `from === to` moves nothing.
 */
export interface CircleMove {
	circleId: string;
	name: string;
	from: string | null;
	to: string | null;
}

/** Whether putting `id` inside `parentId` would make it its own ancestor. */
export function closesLoop(
	id: string,
	parentId: string,
	parentOf: ReadonlyMap<string, string | null>
): boolean {
	const seen = new Set<string>();
	for (let at: string | null = parentId; at !== null; at = parentOf.get(at) ?? null) {
		if (at === id) return true;
		// The stored nesting has no loop; this only keeps a broken one from hanging the walk.
		if (seen.has(at)) return false;
		seen.add(at);
	}
	return false;
}

/**
 * Check that `viewer` may put `circleId` under `parentId` (null: on its own), without writing.
 * Asking for the parent the viewer already sees is no move — which is what keeps a shared circle
 * under a private parent where it is when someone else saves its edit form.
 */
export async function planCircleMove(
	deps: Omit<CircleNestingDeps, 'clock'>,
	viewer: Viewer,
	circleId: string,
	parentId: string | null
): Promise<CircleMove> {
	const subject = await deps.circles.getVisibleTo(viewer, circleId);
	if (!subject) throw new CircleGoneError();
	const parentOf = await deps.nesting.parentsInHouseholdOf(viewer);
	const stored = parentOf.get(circleId) ?? null;
	const from = stored !== null && (await deps.circles.getVisibleTo(viewer, stored)) ? stored : null;
	const move = { circleId, name: subject.name, from, to: parentId };
	if (parentId === from || parentId === null) return move;

	if (!(await deps.circles.getVisibleTo(viewer, parentId))) throw new CircleParentGoneError();
	if (closesLoop(circleId, parentId, parentOf)) throw new CircleLoopError(subject.name);
	return move;
}

/** Write a planned move, if it moves anything. */
export async function applyCircleMove(
	deps: CircleNestingDeps,
	viewer: Viewer,
	move: CircleMove
): Promise<void> {
	if (move.from === move.to) return;
	const moved = await deps.circles.setParent(viewer, move.circleId, move.to, deps.clock.now());
	if (!moved) throw new CircleGoneError();
}

/**
 * Put `circleId` under `parentId`, or on its own with null. Only the circle's parent changes: its
 * members, photos and period stay, and its own sub-circles move along with it.
 */
export async function moveCircle(
	deps: CircleNestingDeps,
	viewer: Viewer,
	circleId: string,
	parentId: string | null
): Promise<CircleMove> {
	const move = await planCircleMove(deps, viewer, circleId, parentId);
	await applyCircleMove(deps, viewer, move);
	return move;
}
