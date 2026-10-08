import type { Core, EdgeSingular, EventObject, NodeSingular } from 'cytoscape';
import { CURSOR_CLASS, HOVERED_CLASS, TUCKED_CLASS } from './stylesheet';

/*
 * What the canvas lights up and what it dims: a neighbourhood, a connection path, the node the
 * keyboard is on, and the lines under the pointer (docs/05 §5.8). Classes only — the stylesheet
 * says what they look like, and nobody moves.
 */

/** The classes a highlight sets, all cleared before the next one. */
const HIGHLIGHT_CLASSES = 'faded highlight selected onpath';

/** Dims everything except the node and its immediate neighbourhood (null clears). */
export function highlightNeighborhood(cy: Core, nodeId: string | null): void {
	cy.elements().removeClass(HIGHLIGHT_CLASSES);
	if (!nodeId) return;
	const node = cy.$id(nodeId);
	if (node.empty()) return;
	// A group lights up with its members and everything they are tied to; anybody lit keeps
	// the frame they stand in lit too, since a frame's fading would fade them with it.
	const own = node.union(node.children());
	let hood = own.closedNeighborhood();
	hood = hood.union(hood.nodes().parents());
	cy.elements().not(hood).addClass('faded');
	// A tucked-away line shows for the member it belongs to, not for whoever is at its
	// other end: selecting the circle keeps the one line to each group. Nor does it show
	// for a selected group where the group's own bundle already reaches that other end.
	const grouped = own.nodes().filter((n) => n.isChild());
	const bundledTo = node.isParent() ? node.neighborhood().nodes() : cy.collection();
	const shows = (e: EdgeSingular) =>
		!e.hasClass(TUCKED_CLASS) ||
		(e.connectedNodes().intersection(grouped).nonempty() &&
			e.connectedNodes().intersection(bundledTo).empty());
	hood.edges().filter(shows).addClass('highlight');
	node.addClass('selected');
}

/** Emphasises a connection path and dims the rest (null clears). */
export function highlightPath(cy: Core, nodeIds: string[] | null): void {
	cy.elements().removeClass(HIGHLIGHT_CLASSES);
	if (!nodeIds || nodeIds.length === 0) return;
	let path = cy.collection();
	for (let i = 0; i < nodeIds.length; i++) {
		const node = cy.$id(nodeIds[i]);
		path = path.union(node);
		if (i > 0) path = path.union(cy.$id(nodeIds[i - 1]).edgesWith(node));
	}
	cy.elements().not(path.union(path.nodes().parents())).addClass('faded');
	path.addClass('onpath');
}

/** Rings the node the keyboard is on, and nobody else; the node ringed, or null. */
export function markCursor(cy: Core, nodeId: string | null): NodeSingular | null {
	cy.nodes().removeClass(CURSOR_CLASS);
	if (!nodeId) return null;
	const node = cy.$id(nodeId);
	if (node.empty()) return null;
	node.addClass(CURSOR_CLASS);
	return node;
}

/**
 * Pointing at a line, or at a person, names those lines (docs/05 §5.8): with the names of a
 * busy map switched off, this is how one is read without selecting anybody.
 */
export function nameLinesUnderPointer(cy: Core): void {
	const linesUnder = (e: EventObject) => (e.target.isNode() ? e.target.connectedEdges() : e.target);
	cy.on('mouseover', 'node, edge', (e) => linesUnder(e).addClass(HOVERED_CLASS));
	cy.on('mouseout', 'node, edge', (e) => linesUnder(e).removeClass(HOVERED_CLASS));
}
