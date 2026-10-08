import type { Point, Route } from '../layout/geometry';

/*
 * A routed line in the terms Cytoscape draws it in (docs/05 §5.8). Pure, so it tests without
 * the library. A `segments` edge places each bend by a weight along the line between the two
 * node centres and a distance off it, towards that line's left-hand normal (-dy, dx) — with
 * `edge-distances: node-position`, which the stylesheet sets, so the centres and not the node
 * borders are what the bends are measured from.
 */

/** What a routed edge carries for the stylesheet to read. */
export interface Segments {
	weights: number[];
	distances: number[];
	/** Where the line leaves its source: a fixed offset, or Cytoscape's rule for the border. */
	sourceEndpoint: string;
	targetEndpoint: string;
}

/**
 * The upper end of a line stops short of the name under that person, which a line dropping
 * down would otherwise run over; the lower end meets the disc, whose name hangs below it.
 */
const BELOW_THE_NAME = 'outside-to-node-or-label';
const AT_THE_DISC = 'outside-to-node';

export function segmentsOf(route: Route, source: Point, target: Point): Segments {
	const along = { x: target.x - source.x, y: target.y - source.y };
	const squared = along.x * along.x + along.y * along.y;
	const length = Math.sqrt(squared);
	const weights = route.waypoints.map(
		(p) => ((p.x - source.x) * along.x + (p.y - source.y) * along.y) / squared
	);
	const distances = route.waypoints.map(
		(p) => ((p.x - source.x) * -along.y + (p.y - source.y) * along.x) / length
	);
	// Equal heights — a line over the top of a row — leaves upwards from both ends.
	const sourceIsUpper = source.y < target.y;
	const targetIsUpper = target.y < source.y;
	return {
		weights,
		distances,
		sourceEndpoint: route.sourceEnd
			? offset(route.sourceEnd, source)
			: sourceIsUpper
				? BELOW_THE_NAME
				: AT_THE_DISC,
		targetEndpoint: route.targetEnd
			? offset(route.targetEnd, target)
			: targetIsUpper
				? BELOW_THE_NAME
				: AT_THE_DISC
	};
}

/** A point as Cytoscape's endpoint offset from the centre of the node it belongs to. */
function offset(point: Point, node: Point): string {
	return `${point.x - node.x}px ${point.y - node.y}px`;
}
