import type { Core, EdgeCollection, EventObject, NodeCollection, NodeSingular } from 'cytoscape';
import type { Point } from '../layout/geometry';
import { CAPTION_CLASS, DRAGGED_LINE_CLASS, SLOT_CLASS } from './canvas-classes';

/*
 * Dragging in the family tree (docs/dev/05 §5.8): a person keeps to their row while dragged,
 * their own lines hidden until the drop — a routed line's bends are measured along it from end
 * to end, so they would tilt into a zigzag with every step — and the drop is reported for the
 * tree to be laid out again around it. A missing parent's slot stays where the tree put it, and
 * keeps over its child while they are dragged.
 * Elsewhere a drag stays free.
 */

export interface RowDragging {
	/** Whether drags keep to their row and report their drop: while the tree is arranged. */
	setOn(on: boolean): void;
}

export function dragAlongRowsOn(cy: Core, onDrop: (id: string, at: Point) => void): RowDragging {
	let on = false;
	let held: {
		node: NodeSingular;
		at: Point;
		pinned: boolean;
		lines: EdgeCollection;
		plus: NodeCollection;
		moved: boolean;
	} | null = null;

	cy.on('grab', 'node', (e: EventObject) => {
		const node = e.target as NodeSingular;
		if (!on || node.hasClass(CAPTION_CLASS)) return;
		const pinned = node.hasClass(SLOT_CLASS);
		// A slot never moves, so its lines never tilt; the one over a child moves with them, upright.
		const lines = pinned ? cy.collection() : node.connectedEdges().not(`.${SLOT_CLASS}`);
		lines.addClass(DRAGGED_LINE_CLASS);
		const plus = pinned ? cy.collection() : node.incomers(`node.${SLOT_CLASS}`);
		held = { node, at: { ...node.position() }, pinned, lines, plus, moved: false };
	});
	cy.on('drag', 'node', (e: EventObject) => {
		if (!held || e.target !== held.node) return;
		const { node, at, pinned, plus } = held;
		if (pinned) return void node.position(at);
		held.moved = true;
		if (node.position().y !== at.y) node.position('y', at.y);
		plus.forEach((slot) => void slot.position('x', node.position().x));
	});
	cy.on('free', 'node', (e: EventObject) => {
		if (!held || e.target !== held.node) return;
		const { node, lines, moved } = held;
		held = null;
		lines.removeClass(DRAGGED_LINE_CLASS);
		if (moved) onDrop(node.id(), { ...node.position() });
	});

	return {
		setOn(next) {
			on = next;
		}
	};
}
