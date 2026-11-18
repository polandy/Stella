import type { Core, EdgeCollection, EventObject, NodeSingular } from 'cytoscape';
import type { Point } from '../layout/geometry';
import { CAPTION_CLASS, DRAGGED_LINE_CLASS } from './canvas-classes';

/*
 * Dragging in the family tree (docs/dev/05 §5.8): a person keeps to their row while dragged,
 * their own lines hidden until the drop — a routed line's bends are measured along it from end
 * to end, so they would tilt into a zigzag with every step — and the drop is reported for the
 * tree to be laid out again around it. Elsewhere a drag stays free.
 */

export interface RowDragging {
	/** Whether drags keep to their row and report their drop: while the tree is arranged. */
	setOn(on: boolean): void;
}

export function dragAlongRowsOn(cy: Core, onDrop: (id: string, at: Point) => void): RowDragging {
	let on = false;
	let held: { node: NodeSingular; y: number; lines: EdgeCollection; moved: boolean } | null = null;

	cy.on('grab', 'node', (e: EventObject) => {
		const node = e.target as NodeSingular;
		if (!on || node.hasClass(CAPTION_CLASS)) return;
		const lines = node.connectedEdges();
		lines.addClass(DRAGGED_LINE_CLASS);
		held = { node, y: node.position().y, lines, moved: false };
	});
	cy.on('drag', 'node', (e: EventObject) => {
		if (!held || e.target !== held.node) return;
		held.moved = true;
		if (held.node.position().y !== held.y) held.node.position('y', held.y);
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
