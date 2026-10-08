/*
 * How the family tree searches for the order of one family's rows (docs/05 §5.8), for
 * `family-rows.ts`. Pure. A row is a list of units — a couple, or a longer chain of partners,
 * moves together. The search starts from the usual barycentre passes, then makes single moves
 * for as long as one draws the bars better, and last turns couples husband-left where that
 * costs nothing. How good an order is, `cost` says; this only searches.
 */

/** Each generation's row, left to right, as units of partners that move together. */
export type Rows = string[][][];

/** Down-and-up barycentre passes; a few settle a household-sized tree. */
const ORDERING_PASSES = 4;
/** The most rounds of single moves; each round either improves the order or ends the search. */
const SEARCH_ROUNDS = 40;

/** Each row re-ordered under the one above and over the one below, a few times over. */
export function barycentreOrder(
	start: Rows,
	family: ReadonlyMap<string, number>,
	neighbours: ReadonlyMap<string, ReadonlySet<string>>,
	place: (order: Rows) => Map<string, number>
): Rows {
	const rows = start.map((row) => [...row]);
	let x = place(rows);
	/** Mean position of a unit's neighbours on row `towards`, or where it stands without any. */
	const pull = (unit: string[], towards: number) => {
		const xs = unit.flatMap((id) =>
			[...(neighbours.get(id) ?? [])].filter((n) => family.get(n) === towards).map((n) => x.get(n)!)
		);
		return xs.length > 0
			? xs.reduce((a, b) => a + b, 0) / xs.length
			: unit.reduce((a, id) => a + x.get(id)!, 0) / unit.length;
	};
	const reorder = (generation: number, towards: number) => {
		if (rows[generation].length === 0 || rows[towards].length === 0) return;
		const keyed = rows[generation].map((unit) => ({ unit, key: pull(unit, towards) }));
		keyed.sort((a, b) => a.key - b.key);
		rows[generation] = keyed.map((k) => k.unit);
		x = place(rows);
	};
	for (let pass = 0; pass < ORDERING_PASSES; pass++) {
		for (let g = 1; g < rows.length; g++) reorder(g, g - 1);
		for (let g = rows.length - 2; g >= 0; g--) reorder(g, g + 1);
	}
	return rows;
}

/** The order after single moves — a unit to another place on its row, or turned round. */
export function improve(start: Rows, cost: (order: Rows) => number): Rows {
	let best = start;
	let bestCost = cost(best);
	for (let round = 0; round < SEARCH_ROUNDS; round++) {
		let improved = false;
		for (const candidate of movesFrom(best)) {
			const candidateCost = cost(candidate);
			if (candidateCost < bestCost) {
				best = candidate;
				bestCost = candidateCost;
				improved = true;
				break;
			}
		}
		if (!improved) break;
	}
	return best;
}

/** Every order one move away: a unit turned round, or taken out and put back elsewhere. */
function* movesFrom(rows: Rows): Generator<Rows> {
	for (let g = 0; g < rows.length; g++) {
		const row = rows[g];
		for (let i = 0; i < row.length; i++) {
			if (row[i].length > 1) {
				yield withRow(
					rows,
					g,
					row.map((unit, k) => (k === i ? [...unit].reverse() : unit))
				);
			}
			for (let j = 0; j < row.length; j++) {
				if (j === i) continue;
				const without = row.filter((_, k) => k !== i);
				yield withRow(rows, g, [...without.slice(0, j), row[i], ...without.slice(j)]);
			}
		}
	}
}

const withRow = (rows: Rows, g: number, row: string[][]): Rows =>
	rows.map((r, k) => (k === g ? row : r));

/** The same order seen in a mirror: every row and every unit back to front. */
export function mirrored(rows: Rows): Rows {
	return rows.map((row) => [...row].reverse().map((unit) => [...unit].reverse()));
}

/**
 * The order with every couple whose turning round costs nothing turned husband-left, and how
 * many more of the couples that `counts` then stand husband-left than wife-left.
 */
export function husbandsLeft(
	start: Rows,
	partners: ReadonlyMap<string, ReadonlySet<string>>,
	wording: ReadonlyMap<string, string | undefined>,
	cost: (order: Rows) => number,
	counts: (left: string, right: string) => boolean
): { rows: Rows; balance: number } {
	const sideOf = (unit: string[], only = (_l: string, _r: string) => true): number => {
		let balance = 0;
		for (let i = 1; i < unit.length; i++) {
			const [left, right] = [unit[i - 1], unit[i]];
			if (!partners.get(left)?.has(right) || !only(left, right)) continue;
			if (wording.get(left) === 'male' && wording.get(right) === 'female') balance++;
			if (wording.get(left) === 'female' && wording.get(right) === 'male') balance--;
		}
		return balance;
	};
	let rows = start;
	let current = cost(rows);
	for (let g = 0; g < rows.length; g++) {
		for (let i = 0; i < rows[g].length; i++) {
			const unit = rows[g][i];
			if (sideOf(unit) >= 0) continue;
			const turned = withRow(
				rows,
				g,
				rows[g].map((u, k) => (k === i ? [...u].reverse() : u))
			);
			const turnedCost = cost(turned);
			if (turnedCost <= current) {
				rows = turned;
				current = turnedCost;
			}
		}
	}
	return { rows, balance: rows.flat().reduce((sum, unit) => sum + sideOf(unit, counts), 0) };
}
