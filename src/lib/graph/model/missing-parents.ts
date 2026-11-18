import { PARENT_CHILD_TYPE_KEY } from '../../relationships/type-keys';
import type { Point } from '../layout/geometry';
import type { GraphEdge, GraphModel } from './types';

/*
 * Where the family tree around a person offers a parent nobody entered (docs/dev/02 §2.7,
 * docs/dev/05 §5.8). Pure. A slot is not somebody: it never enters the model the filters, the
 * "+N" counts or the path read — only the tree's layout and its drawing take it in.
 *
 * Only the centre's own line asks: the centre, their parents and their grandparents. A gap is
 * a gap in what the viewer may see (`graph`), not in what the map has opened so far: a parent
 * still behind a "+N" is no gap. Nobody on record, or one parent, gives one slot; it takes no
 * room in the tree but stands just over the child, and shows only on demand.
 */

/** How many generations up from the centre may have a gap offered: centre, parents, grandparents. */
const LINE_DEPTH = 3;

const SLOT_PREFIX = 'slot:parent-of:';

/** The place of a parent nobody entered. */
export interface ParentSlot {
	/** Stands in for the parent on the canvas; `isParentSlot` tells it from anybody. */
	id: string;
	/** Whose parent is missing. */
	childId: string;
	/** The one parent on record, whose partner the slot asks for; absent when there is none. */
	besideParentId?: string;
}

/** Whether a node id is a slot rather than somebody. */
export function isParentSlot(id: string): boolean {
	return id.startsWith(SLOT_PREFIX);
}

/** The parents entered for `childId` in `model`. */
function parentsIn(model: GraphModel, childId: string): string[] {
	return model.edges
		.filter(
			(e) =>
				e.kind === 'relationship' &&
				e.typeKey === PARENT_CHILD_TYPE_KEY &&
				e.target === childId &&
				e.source !== childId
		)
		.map((e) => e.source);
}

/**
 * The slots up the centre's line: `graph` is what the viewer may see, `onMap` what the map
 * shows. Somebody gets a slot only while standing on the map, and so does a parent beside one.
 * `parentsKnown` says whose parents `graph` holds at all: a person's page carries two hops, so
 * a grandparent's own parents are past its edge, and no gap can be read there.
 */
export function missingParentSlots(
	graph: GraphModel,
	onMap: GraphModel,
	centerId: string,
	parentsKnown: (id: string) => boolean = () => true
): ParentSlot[] {
	const shown = new Set(onMap.nodes.filter((n) => n.kind === 'person').map((n) => n.id));
	if (!shown.has(centerId)) return [];
	const slots: ParentSlot[] = [];
	const seen = new Set<string>();
	let generation = [centerId];
	for (let depth = 0; depth < LINE_DEPTH && generation.length > 0; depth++) {
		const next: string[] = [];
		for (const childId of generation) {
			if (seen.has(childId) || !parentsKnown(childId)) continue;
			seen.add(childId);
			const parents = [...new Set(parentsIn(graph, childId))];
			const onIt = parents.filter((p) => shown.has(p));
			if (parents.length === 0) slots.push({ id: SLOT_PREFIX + childId, childId });
			else if (parents.length === 1 && onIt.length === 1)
				slots.push({ id: SLOT_PREFIX + childId, childId, besideParentId: onIt[0] });
			next.push(...onIt);
		}
		generation = next;
	}
	return slots;
}

/** A slot's disc: smaller than anybody's, a button rather than a person. */
export const SLOT_DIAMETER = 22;
/** How far over the top of the child's disc the slot's centre stands. */
const SLOT_RISE = 30;

/** The one line a slot is tied in by: the short one down to the child. */
export function slotLine(slot: ParentSlot): GraphEdge {
	return {
		id: `${slot.id}:line`,
		source: slot.id,
		target: slot.childId,
		kind: 'relationship',
		category: 'family',
		typeKey: PARENT_CHILD_TYPE_KEY
	};
}

/**
 * Where each slot stands once the people are placed: just over its child, so it takes no room
 * in the tree. `discOf` is a person's disc diameter; a slot whose child has no place has none.
 */
export function slotPlaces(
	slots: readonly ParentSlot[],
	places: ReadonlyMap<string, Point>,
	discOf: (id: string) => number
): Map<string, Point> {
	const placed = new Map<string, Point>();
	for (const slot of slots) {
		const child = places.get(slot.childId);
		if (child)
			placed.set(slot.id, { x: child.x, y: child.y - discOf(slot.childId) / 2 - SLOT_RISE });
	}
	return placed;
}

/** The slots that show: the selected people's, or every one while the gaps are asked for. */
export function slotsShown(
	slots: readonly ParentSlot[],
	{ gaps, selected }: { gaps: boolean; selected: ReadonlySet<string> }
): ParentSlot[] {
	return gaps ? [...slots] : slots.filter((s) => selected.has(s.childId));
}
