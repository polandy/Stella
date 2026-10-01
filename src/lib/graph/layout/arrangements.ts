/*
 * The three ways to arrange the map (docs/05 §5.8). Each is a one-off action, not a mode: an
 * expand afterwards still only adds people around the one expanded. The family tree reads
 * what is shown, so a filtered-out line cannot pull someone into a generation; the groups by
 * circle read every membership, so the grouping holds while the Circles chip is off.
 */
export const ARRANGEMENTS = [
	{ key: 'force', label: 'graph.arrange.force', hint: 'graph.arrange.force.hint' },
	{ key: 'tree', label: 'graph.arrange.tree', hint: 'graph.arrange.tree.hint' },
	{ key: 'circles', label: 'graph.arrange.circles', hint: 'graph.arrange.circles.hint' }
] as const;

export type ArrangementKey = (typeof ARRANGEMENTS)[number]['key'];
