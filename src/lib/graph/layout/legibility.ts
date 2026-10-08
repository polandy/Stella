/*
 * What keeps a busy relationship map readable (docs/05 §5.8). Pure numbers and decisions, so
 * the stylesheet and the component read them from one place and the tests pin them down
 * without a canvas.
 */

/** The widest a person's name is drawn under their disc, in model units. */
export const NODE_LABEL_WIDTH = 96;

/**
 * Below this rendered size (in screen pixels) a name is dropped rather than drawn. Zoomed far
 * out, names would otherwise pile into smudges over the people and lines they belong to.
 */
export const LABEL_MIN_ZOOMED_FONT_SIZE = 8;

/**
 * The most lines the map names at once. Past it, the names around a hub stack on top of each
 * other into noise, so they are left to the lines the reader points at or selects.
 */
export const EDGE_LABEL_LIMIT = 40;

/**
 * Whether every line is named, given the reader's Labels switch and how many lines are shown.
 * A highlighted, hovered or traced line is named regardless; this is only about naming all.
 * In the family tree the switch is the tree's own (`tree-labels.ts`), not the reader's habit.
 */
export function edgeLabelsFit(switchedOn: boolean, visibleEdges: number): boolean {
	return switchedOn && visibleEdges <= EDGE_LABEL_LIMIT;
}

/**
 * What the Labels switch says under its name: why the names paused when there are too many;
 * in the tree, `rolesInstead`, why they start off there and that the switch brings them; else
 * what it does.
 */
export function labelsHint(
	switchedOn: boolean,
	fit: boolean,
	rolesInstead: boolean
): 'graph.labels.hint' | 'graph.labels.tooMany' | 'graph.labels.inTree' {
	if (switchedOn && !fit) return 'graph.labels.tooMany';
	return rolesInstead ? 'graph.labels.inTree' : 'graph.labels.hint';
}

/**
 * How many lines the map draws, the count {@link edgeLabelsFit} weighs: the lines shown, less
 * any `heldBack` until their person is selected (left-off kinship, the lines a bundle tucks
 * away), plus the `bundles` drawn in their stead.
 */
export function linesDrawn(
	shown: readonly { id: string }[],
	heldBack: readonly ReadonlySet<string>[],
	bundles: number
): number {
	return shown.filter((line) => !heldBack.some((set) => set.has(line.id))).length + bundles;
}

/** The smallest disc, for somebody with no lines on the map. */
export const MIN_NODE_DIAMETER = 30;
/** The largest disc: big enough to find a hub, small enough to leave its neighbours room. */
export const MAX_NODE_DIAMETER = 64;
/** How much each line grows a disc, before the square root flattens it. */
const GROWTH = 7;

/**
 * A person's disc by how many lines they have on the map. The square root keeps telling hubs
 * apart well past ten lines — the old linear scale stopped there — while the first few lines
 * still make a visible difference; the cap keeps a hub from crowding its own fan.
 */
export function nodeDiameter(degree: number): number {
	const lines = Math.max(0, degree);
	return Math.min(MAX_NODE_DIAMETER, MIN_NODE_DIAMETER + GROWTH * Math.sqrt(lines));
}
