/*
 * The lanes the family tree's bars run on (docs/dev/05 §5.8), for `tree-lines.ts`. Pure. Where two
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
	/** Where it comes down from the row above: its line rises from here. */
	x1: number;
	/** Where it goes on down to the row below. */
	x2: number;
	/** Set for a line over the top of a row: it goes down to the row at both ends. */
	over?: true;
}

/** Pieces with one key share a lane: one group in one gap. */
export const laneKey = (leg: Leg) => `${leg.channel}|${leg.group}`;

/**
 * How far above its gap's lowest bar each group of pieces runs: on the first lane, counted up,
 * where it overlaps nobody already there — left to right, so the same map gets the same lanes.
 * A gap needing more lanes than it has room for squeezes them closer together, never two
 * groups onto one lane. Where one group's line would run down through another's bar, the two
 * trade lanes if that clears it — two pairs of parents over one child, say.
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

/** The stretch one group takes in its gap, and where its lines leave it up and down. */
interface Span {
	channel: number;
	left: number;
	right: number;
	ups: number[];
	downs: number[];
}

/** A lane number for every group of pieces in each gap, as many lanes as the gap needs. */
function assignLanes(legs: readonly Leg[], margin: number): Map<string, number> {
	const spans = new Map<string, Span>();
	for (const leg of legs) {
		const key = laneKey(leg);
		const known = spans.get(key) ?? {
			channel: leg.channel,
			left: Infinity,
			right: -Infinity,
			ups: [],
			downs: []
		};
		spans.set(key, {
			...known,
			left: Math.min(known.left, leg.x1, leg.x2),
			right: Math.max(known.right, leg.x1, leg.x2),
			ups: leg.over ? known.ups : [...known.ups, leg.x1],
			downs: leg.over ? [...known.downs, leg.x1, leg.x2] : [...known.downs, leg.x2]
		});
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
	untangle(spans, lanes, margin);
	return lanes;
}

/** How many of the lines run through a bar with `below` on the lower lane of the two. */
function through(below: Span, above: Span): number {
	const inside = (x: number, span: Span) => x > span.left && x < span.right;
	return (
		below.ups.filter((x) => inside(x, above)).length +
		above.downs.filter((x) => inside(x, below)).length
	);
}

/** Bounds the search for lane trades: a few passes settle any gap a family tree has. */
const UNTANGLE_PASSES = 4;

/**
 * The lanes with two groups of one gap traded wherever that runs fewer lines through a bar and
 * still keeps every lane's groups `margin` apart. In place.
 */
function untangle(spans: ReadonlyMap<string, Span>, lanes: Map<string, number>, margin: number) {
	const byChannel = new Map<number, string[]>();
	for (const [key, span] of spans)
		byChannel.set(span.channel, [...(byChannel.get(span.channel) ?? []), key]);
	for (const keys of byChannel.values()) {
		const crossings = () => {
			let count = 0;
			for (const a of keys) {
				for (const b of keys) {
					if (lanes.get(a)! < lanes.get(b)!) count += through(spans.get(a)!, spans.get(b)!);
				}
			}
			return count;
		};
		const fits = (key: string) =>
			keys.every((other) => {
				if (other === key || lanes.get(other) !== lanes.get(key)) return true;
				const [a, b] = [spans.get(key)!, spans.get(other)!];
				return a.right + margin <= b.left || b.right + margin <= a.left;
			});
		let current = crossings();
		for (let pass = 0; pass < UNTANGLE_PASSES && current > 0; pass++) {
			let traded = false;
			for (const a of keys) {
				for (const b of keys) {
					const [la, lb] = [lanes.get(a)!, lanes.get(b)!];
					if (la >= lb) continue;
					lanes.set(a, lb);
					lanes.set(b, la);
					const after = fits(a) && fits(b) ? crossings() : Infinity;
					if (after < current) {
						current = after;
						traded = true;
					} else {
						lanes.set(a, la);
						lanes.set(b, lb);
					}
				}
			}
			if (!traded) break;
		}
	}
}
