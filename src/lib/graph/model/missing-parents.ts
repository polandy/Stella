import { PARENT_CHILD_TYPE_KEY } from '../../relationships/type-keys';
import type { GraphEdge, GraphModel } from './types';

/*
 * Where the family tree around a person offers a parent nobody entered (docs/02 §2.7,
 * docs/05 §5.8). Pure. A slot is not somebody: it never enters the model the filters, the
 * "+N" counts or the path read — only the tree's layout and its drawing take it in.
 *
 * Only the centre's own line asks: the centre, their parents and their grandparents. A gap is
 * a gap in what the viewer may see (`graph`), not in what the map has opened so far: a parent
 * still behind a "+N" is no gap. Nobody on record gives one slot over the child; one parent on
 * record gives one slot beside them, the couple the child hangs from.
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
	/** The one parent on record, whom the slot stands beside; absent when there is none. */
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

/** The lines a slot is tied in by: down to the child, and the bar to the parent beside it. */
export function slotLines(slot: ParentSlot): { line: GraphEdge; bar?: GraphEdge } {
	const line: GraphEdge = {
		id: `${slot.id}:line`,
		source: slot.id,
		target: slot.childId,
		kind: 'relationship',
		category: 'family',
		typeKey: PARENT_CHILD_TYPE_KEY
	};
	if (slot.besideParentId === undefined) return { line };
	return {
		line,
		bar: {
			id: `${slot.id}:bar`,
			source: slot.id,
			target: slot.besideParentId,
			kind: 'relationship',
			category: 'romantic',
			typeKey: 'partner'
		}
	};
}

/**
 * The one line the canvas draws for a slot: the bar beside a parent — the child's drop already
 * hangs from the couple — or, with nobody beside it, the line down to the child.
 */
export function drawnSlotLine(slot: ParentSlot): GraphEdge {
	const { line, bar } = slotLines(slot);
	return bar ?? line;
}

/** `model` with every slot standing in as a parent, for the tree to make room for it. */
export function withParentSlots(model: GraphModel, slots: readonly ParentSlot[]): GraphModel {
	if (slots.length === 0) return model;
	return {
		nodes: [
			...model.nodes,
			...slots.map((s) => ({ id: s.id, kind: 'person' as const, label: '' }))
		],
		edges: [
			...model.edges,
			...slots.flatMap((s) => {
				const { line, bar } = slotLines(s);
				return bar ? [line, bar] : [line];
			})
		]
	};
}
