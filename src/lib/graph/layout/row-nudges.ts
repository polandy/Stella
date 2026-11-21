import { PARENT_CHILD_TYPE_KEY } from '../../relationships/type-keys';
import type { GraphEdge } from '../model/types';
import type { SizeOf } from './geometry';
import type { RowSpacing } from './family-rows';
import type { Rows } from './row-order';
import { reachesBack, type BarSpan } from './bar-spans';

/*
 * The small moves the family tree makes after its rows are ordered (docs/dev/05 §5.8), for
 * `family-rows.ts`. Pure, in place on the positions: a unit moves only where it keeps its gap
 * from its neighbours, or with every unit beyond it, and adds no crossing.
 */

/** Whether moving `unit` by `delta` keeps it `gap` clear of the other units on its row. */
function fitsInRow(
	unit: string[],
	delta: number,
	row: readonly string[][],
	x: ReadonlyMap<string, number>,
	sizeOf: SizeOf,
	gap: number
): boolean {
	const box = (u: string[]) => ({
		left: Math.min(...u.map((id) => x.get(id)! - sizeOf(id).width / 2)),
		right: Math.max(...u.map((id) => x.get(id)! + sizeOf(id).width / 2))
	});
	const moved = box(unit);
	const [left, right] = [moved.left + delta, moved.right + delta];
	return row
		.filter((other) => other !== unit)
		.every((other) => {
			const b = box(other);
			return b.right + gap <= left || right + gap <= b.left;
		});
}

/**
 * The positions with every only child's drop made one straight line: the child set right under
 * the parents' drop, or — where the child's row has no room — a lone parent set right over the
 * child. A move is kept only where it keeps every name its gap from its neighbours and adds no
 * crossing; otherwise the drop keeps its small jog.
 */
export function straightened(
	rows: Rows,
	start: Map<string, number>,
	familyEdges: readonly GraphEdge[],
	family: ReadonlyMap<string, number>,
	sizeOf: SizeOf,
	spacing: RowSpacing,
	crossings: (x: ReadonlyMap<string, number>) => number
): Map<string, number> {
	const x = new Map(start);
	const parentsOf = new Map<string, string[]>();
	for (const e of familyEdges) {
		if (e.typeKey !== PARENT_CHILD_TYPE_KEY) continue;
		if (family.get(e.source) !== family.get(e.target)! - 1) continue;
		parentsOf.set(e.target, [...(parentsOf.get(e.target) ?? []), e.source]);
	}
	const byDrop = new Map<string, string[]>();
	for (const [child, parents] of parentsOf) {
		const key = [...parents].sort().join('+');
		byDrop.set(key, [...(byDrop.get(key) ?? []), child]);
	}
	const unitOf = (id: string) => rows.flat().find((unit) => unit.includes(id))!;
	const fits = (unit: string[], delta: number) =>
		fitsInRow(unit, delta, rows[family.get(unit[0])!], x, sizeOf, spacing.gap);
	const move = (unit: string[], delta: number) => {
		const before = crossings(x);
		for (const id of unit) x.set(id, x.get(id)! + delta);
		if (crossings(x) <= before) return true;
		for (const id of unit) x.set(id, x.get(id)! - delta);
		return false;
	};

	// From the top down: straightening a drop may move its parents' unit, so the drop over them
	// is straightened first, or the one beneath would be left pointing where they used to stand.
	const generationOf = (key: string) => family.get(key.split('+')[0])!;
	const topDown = [...byDrop].sort(([a], [b]) => generationOf(a) - generationOf(b));
	// The units a straight drop already rests on: moving one again would bend that drop — a
	// couple whose partners each hang from a lone parent of their own would line up under the
	// second and leave the first askew.
	const settled = new Set<string[]>();
	for (const [key, children] of topDown) {
		if (children.length !== 1) continue;
		const parents = key.split('+');
		const parentUnit = unitOf(parents[0]);
		// One drop: a lone parent, or partners standing side by side in one unit.
		if (!parents.every((p) => parentUnit.includes(p))) continue;
		const dropX = parents.reduce((sum, p) => sum + x.get(p)!, 0) / parents.length;
		const child = children[0];
		const delta = dropX - x.get(child)!;
		const childUnit = unitOf(child);
		const straight =
			delta === 0 ||
			(!settled.has(childUnit) && fits(childUnit, delta) && move(childUnit, delta)) ||
			(parents.length === 1 &&
				parentUnit.length === 1 &&
				!settled.has(parentUnit) &&
				fits(parentUnit, -delta) &&
				move(parentUnit, -delta));
		if (straight) {
			settled.add(childUnit);
			settled.add(parentUnit);
		}
	}
	return x;
}

/**
 * The positions with every lone parent's children moved out past that parent's outer edge, where
 * the packing left one in under the parent's couple: the children's side of their row shifted
 * outwards, or else the parent's unit, then with the rest of its row, shifted inwards. A move is
 * kept only where it removes a crossing; where none does, the bar keeps reaching back.
 */
export function clearOfCouples(
	rows: Rows,
	x: Map<string, number>,
	family: ReadonlyMap<string, number>,
	sizeOf: SizeOf,
	spacing: RowSpacing,
	spansAt: (x: ReadonlyMap<string, number>) => BarSpan[],
	crossingsAt: (x: ReadonlyMap<string, number>) => number
): void {
	const unitOf = (id: string) => rows.flat().find((unit) => unit.includes(id))!;
	const rowOf = (id: string) => rows[family.get(id)!];
	const fits = (unit: string[], delta: number) =>
		fitsInRow(unit, delta, rowOf(unit[0]), x, sizeOf, spacing.gap);
	const tryMove = (units: string[][], delta: number) => {
		const before = crossingsAt(x);
		const ids = units.flat();
		for (const id of ids) x.set(id, x.get(id)! + delta);
		if (crossingsAt(x) < before) return true;
		for (const id of ids) x.set(id, x.get(id)! - delta);
		return false;
	};
	/** The units of `id`'s row standing on `side` of `id`'s unit, that unit included. */
	const unitsToward = (id: string, side: -1 | 1) => {
		const centre = (u: string[]) => u.reduce((sum, m) => sum + x.get(m)!, 0) / u.length;
		const from = centre(unitOf(id));
		return rowOf(id).filter((u) => (centre(u) - from) * side >= 0);
	};

	const given = new Set<string>();
	for (let round = 0; round < rows.flat().length; round++) {
		const span = spansAt(x)
			.filter((s) => reachesBack(s) && !given.has(s.parents[0]))
			.sort((a, b) => a.channel - b.channel)[0];
		if (!span) return;
		const [parent] = span.parents;
		const outward = span.outward!;
		const delta = outward === -1 ? span.right - span.drop : span.left - span.drop;
		// The innermost child, and every unit beyond it, shifted out; or the parent shifted in.
		const innermost = span.children.reduce((a, b) =>
			(x.get(b)! - x.get(a)!) * outward < 0 ? b : a
		);
		const parentUnit = unitOf(parent);
		const moved =
			tryMove(unitsToward(innermost, outward), -delta) ||
			(fits(parentUnit, delta) && tryMove([parentUnit], delta)) ||
			tryMove(unitsToward(parent, -outward as -1 | 1), delta);
		if (!moved) given.add(parent);
	}
}

/**
 * The positions with each child of several parent pairs moved toward the drop of the pair it
 * lives or grew up with (`parent-pairs.ts`), as far as its row has room. A move is kept only
 * where it puts more of the child's pairs in their order and adds no crossing.
 */
export function towardHome(
	rows: Rows,
	x: Map<string, number>,
	family: ReadonlyMap<string, number>,
	sizeOf: SizeOf,
	spacing: RowSpacing,
	spansAt: (x: ReadonlyMap<string, number>) => BarSpan[],
	crossingsAt: (x: ReadonlyMap<string, number>) => number,
	breaksAt: (x: ReadonlyMap<string, number>) => number
): void {
	const unitOf = (id: string) => rows.flat().find((unit) => unit.includes(id))!;
	const bars = new Map<string, number>();
	for (const span of spansAt(x)) for (const c of span.children) bars.set(c, (bars.get(c) ?? 0) + 1);
	const children = [...bars].filter(([, count]) => count > 1).map(([child]) => child);
	for (const child of children.sort()) {
		const pairs = spansAt(x).filter((s) => s.children.includes(child));
		const rankOf = (s: BarSpan) => s.ranks[s.children.indexOf(child)];
		const home = pairs.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
		const delta = home.drop - x.get(child)!;
		const unit = unitOf(child);
		const room = roomToward(
			unit,
			Math.sign(delta),
			rows[family.get(child)!],
			x,
			sizeOf,
			spacing.gap
		);
		const step = Math.sign(delta) * Math.min(Math.abs(delta), room);
		if (step === 0) continue;
		const [crossings, breaks] = [crossingsAt(x), breaksAt(x)];
		for (const id of unit) x.set(id, x.get(id)! + step);
		if (crossingsAt(x) <= crossings && breaksAt(x) < breaks) continue;
		for (const id of unit) x.set(id, x.get(id)! - step);
	}
}

/** How far `unit` can move toward `side` before it comes within `gap` of a neighbour. */
function roomToward(
	unit: string[],
	side: number,
	row: readonly string[][],
	x: ReadonlyMap<string, number>,
	sizeOf: SizeOf,
	gap: number
): number {
	const edge = (u: string[], s: number) =>
		s * Math.max(...u.map((id) => s * (x.get(id)! + (s * sizeOf(id).width) / 2)));
	const own = edge(unit, side);
	const ahead = row
		.filter((other) => other !== unit && (edge(other, -side) - own) * side >= 0)
		.map((other) => (edge(other, -side) - own) * side - gap);
	return Math.max(0, Math.min(Infinity, ...ahead));
}
