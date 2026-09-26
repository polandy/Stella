import type { Point, SizeOf } from './geometry';

/*
 * A group by role as one block (docs/02 §2.7). Pure geometry: the renderer draws the frame
 * around wherever the members stand, so standing them together is what makes a group compact.
 */

/**
 * The room a group's frame takes beyond its members: its padding on every side and the name
 * drawn on top (the stylesheet's `node.role-group`).
 */
const FRAME = { padding: 16, label: 24 } as const;
/** The least room between two members' names. */
const GAP = 30;

/** Where each member stands from the block's centre, and how far the block reaches. */
export interface GroupBlock {
	offsets: Point[];
	/** The half-diagonal: turned any way, the block's corner is what comes nearest the rest. */
	reach: number;
}

/** The members in rows as near square as they go, below room for the frame's name. */
export function groupBlock(ids: readonly string[], sizeOf: SizeOf): GroupBlock {
	const sizes = ids.map(sizeOf);
	const cell = {
		width: Math.max(...sizes.map((s) => s.width)) + GAP,
		height: Math.max(...sizes.map((s) => s.height)) + GAP
	};
	const columns = Math.ceil(Math.sqrt(ids.length));
	const rows = Math.ceil(ids.length / columns);
	const outer = {
		width: columns * cell.width - GAP + 2 * FRAME.padding,
		height: rows * cell.height - GAP + 2 * FRAME.padding + FRAME.label
	};
	const offsets = ids.map((_, k) => ({
		x: ((k % columns) - (columns - 1) / 2) * cell.width,
		y: (Math.floor(k / columns) - (rows - 1) / 2) * cell.height + FRAME.label / 2
	}));
	return { offsets, reach: Math.hypot(outer.width, outer.height) / 2 };
}

/**
 * `positions` with each group's members gathered into a block where the group stood (the
 * centre of its members). Everybody else stays where they are.
 */
export function packGroups(
	positions: ReadonlyMap<string, Point>,
	groups: readonly (readonly string[])[],
	sizeOf: SizeOf
): Map<string, Point> {
	const packed = new Map(positions);
	for (const ids of groups) {
		const placed = ids.filter((id) => positions.has(id));
		if (placed.length === 0) continue;
		const centre = {
			x: placed.reduce((sum, id) => sum + positions.get(id)!.x, 0) / placed.length,
			y: placed.reduce((sum, id) => sum + positions.get(id)!.y, 0) / placed.length
		};
		const { offsets } = groupBlock(placed, sizeOf);
		placed.forEach((id, k) =>
			packed.set(id, { x: centre.x + offsets[k].x, y: centre.y + offsets[k].y })
		);
	}
	return packed;
}
