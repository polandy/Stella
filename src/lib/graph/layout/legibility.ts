/*
 * What keeps a busy relationship map readable (docs/05 §5.8). Pure numbers and decisions, so
 * the stylesheet and the component read them from one place and the tests pin them down
 * without a canvas.
 */

/** The widest a person's name is drawn under their disc, in model units. */
export const NODE_LABEL_WIDTH = 96;

/** The widest a circle's pill writes its name and, in the tree, its people, in model units. */
export const CIRCLE_LABEL_WIDTH = 160;

/**
 * Below this rendered size (in screen pixels) a name is dropped rather than drawn. Zoomed far
 * out, names would otherwise pile into smudges over the people and lines they belong to.
 */
export const LABEL_MIN_ZOOMED_FONT_SIZE = 8;

/** The smallest text the map draws: a line's name. A person's name and a caption are 11. */
export const SMALLEST_LABEL_FONT_SIZE = 10;

/**
 * Whether a label of `fontSize` is drawn at `zoom` on a screen of `pixelRatio`. Cytoscape draws
 * labels from a texture at the next power of two of zoom × pixel ratio and leaves out a label
 * whose font falls under the floor at that level (`eleTextBiggerThanMin`); this mirrors it, so
 * framing can stop before the names vanish.
 */
export function labelsDrawnAt(
	zoom: number,
	pixelRatio: number,
	fontSize: number = SMALLEST_LABEL_FONT_SIZE
): boolean {
	const level = 2 ** Math.ceil(Math.log2(zoom * pixelRatio));
	return fontSize * level >= LABEL_MIN_ZOOMED_FONT_SIZE;
}

/** A little past the exact edge, so a rounding error in the renderer never drops the names. */
const LEGIBLE_MARGIN = 1.02;

/**
 * The furthest out the map can be zoomed on a screen of `pixelRatio` with every name still
 * drawn — half zoom on a desktop, much further on a phone's denser screen.
 */
export function legibleZoom(
	pixelRatio: number,
	fontSize: number = SMALLEST_LABEL_FONT_SIZE
): number {
	// The lowest texture level at which the font clears the floor; the zoom just above the
	// level below it is the first to reach that one.
	const level = Math.ceil(Math.log2(LABEL_MIN_ZOOMED_FONT_SIZE / fontSize));
	return (2 ** (level - 1) / pixelRatio) * LEGIBLE_MARGIN;
}

/** The size a person's name and a circle's name are drawn at, in model units. */
export const NAME_FONT_SIZE = 11;

/** The most a lit name grows; past it the names would cover the people they belong to. */
export const MAX_NAME_GROWTH = 2;

/** How finely the growth is stepped, so a pinch restyles the map a few times, not every frame. */
const NAME_GROWTH_STEP = 0.125;

/**
 * How much the names of the selected person and their neighbours grow at `zoom` (docs/05
 * §5.8). A whole family framed on a phone sits far below full zoom, where an 11-unit name is a
 * 6-pixel smudge; growing the lit names by the inverse of the zoom keeps them at their own size
 * on screen, while the faded rest stays small and out of the way.
 */
export function nameGrowth(zoom: number): number {
	if (zoom >= 1) return 1;
	const stepped = Math.ceil(1 / zoom / NAME_GROWTH_STEP) * NAME_GROWTH_STEP;
	return Math.min(stepped, MAX_NAME_GROWTH);
}

/**
 * The most lines the map names at once. Past it, the names around a hub stack on top of each
 * other into noise, so they are left to the lines the reader points at or selects.
 */
export const EDGE_LABEL_LIMIT = 40;

/**
 * Whether every line is named, given the reader's Labels switch and how many lines are shown.
 * A highlighted, hovered or traced line is named regardless; this is only about naming all.
 * In the family tree the switch is the tree's own (`tree-view.ts`), not the reader's habit.
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
