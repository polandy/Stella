/*
 * Shared geometry of the explorer's arrangements (docs/05 §5.8). Pure: the layouts in this
 * folder compute positions in model units, and the Cytoscape adapter only moves nodes there.
 */

/** A position on the canvas, in the renderer's model coordinates. */
export interface Point {
	x: number;
	y: number;
}

/**
 * Rows of `ids`, left to right from `origin`, wrapping to a new row before `width` is passed.
 * For whoever an arrangement has no better place for.
 */
export function shelve(
	ids: readonly string[],
	origin: Point,
	width: number,
	column: number,
	row: number
): Map<string, Point> {
	const perRow = Math.max(1, Math.floor(width / column) + 1);
	return new Map(
		ids.map((id, i) => [
			id,
			{ x: origin.x + (i % perRow) * column, y: origin.y + Math.floor(i / perRow) * row }
		])
	);
}
