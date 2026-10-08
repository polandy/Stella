/*
 * The lanes the family tree's bars run on (docs/05 §5.8), for `tree-lines.ts`. Pure. Where two
 * bars would run along the same stretch of one gap between rows, they are set a lane apart.
 */

/** Distances between lanes, in model units. */
export interface LaneSpacing {
	/** Between two bars that would otherwise run along each other. */
	lane: number;
	/** The lanes one gap between rows has room for; more are squeezed into the same room. */
	lanes: number;
	/** The room left between two bars that end and begin on the same lane. */
	margin: number;
}

/** One horizontal piece of a line, before the lane it runs on is known. */
export interface Leg {
	/** The y of the row above the gap the piece runs in. */
	channel: number;
	/** Pieces of one group share a lane: the bar over one couple's children is one group. */
	group: string;
	x1: number;
	x2: number;
}

/** Pieces with one key share a lane: one group in one gap. */
export const laneKey = (leg: Leg) => `${leg.channel}|${leg.group}`;

/**
 * How far below its gap's top bar each group of pieces runs: on the first lane, counted down,
 * where it overlaps nobody already there — left to right, so the same map gets the same lanes.
 * A gap needing more lanes than it has room for squeezes them closer together, never two
 * groups onto one lane.
 */
export function laneOffsets(legs: readonly Leg[], spacing: LaneSpacing): Map<string, number> {
	const lanes = assignLanes(legs, spacing.margin);
	const used = new Map<number, number>();
	for (const leg of legs) {
		const lane = lanes.get(laneKey(leg))!;
		used.set(leg.channel, Math.max(used.get(leg.channel) ?? 0, lane + 1));
	}
	const room = (spacing.lanes - 1) * spacing.lane;
	const offsets = new Map<string, number>();
	for (const leg of legs) {
		const count = used.get(leg.channel)!;
		const step = count > spacing.lanes ? room / (count - 1) : spacing.lane;
		offsets.set(laneKey(leg), lanes.get(laneKey(leg))! * step);
	}
	return offsets;
}

/** A lane number for every group of pieces in each gap, as many lanes as the gap needs. */
function assignLanes(legs: readonly Leg[], margin: number): Map<string, number> {
	const spans = new Map<string, { channel: number; left: number; right: number }>();
	for (const leg of legs) {
		const key = laneKey(leg);
		const known = spans.get(key);
		const left = Math.min(leg.x1, leg.x2);
		const right = Math.max(leg.x1, leg.x2);
		spans.set(
			key,
			known
				? { ...known, left: Math.min(known.left, left), right: Math.max(known.right, right) }
				: { channel: leg.channel, left, right }
		);
	}

	const lanes = new Map<string, number>();
	const ends = new Map<number, number[]>();
	const ordered = [...spans].sort(([ka, a], [kb, b]) => a.left - b.left || (ka < kb ? -1 : 1));
	for (const [key, span] of ordered) {
		const taken = ends.get(span.channel) ?? [];
		const free = taken.findIndex((end) => end + margin <= span.left);
		const lane = free === -1 ? taken.length : free;
		taken[lane] = span.right;
		ends.set(span.channel, taken);
		lanes.set(key, lane);
	}
	return lanes;
}
