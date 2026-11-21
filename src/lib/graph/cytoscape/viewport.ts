/*
 * How the canvas makes room for what an expand brought in (docs/dev/05 §5.8). Pure arithmetic over
 * boxes, so it tests without a renderer. The frame only ever widens: what the reader was
 * looking at stays on screen, and nothing moves relative to anything else — the map is the
 * same map, seen from a little further back.
 */

/** An axis-aligned box in the renderer's model coordinates. */
export interface Box {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/** A viewport as the renderer sets it: rendered = model × zoom + pan. */
export interface Viewport {
	zoom: number;
	pan: { x: number; y: number };
}

/**
 * The viewport that shows both the current `extent` and the `newcomers` box, or null when the
 * newcomers are already fully in view (so the reader's view is left exactly as it was). It
 * never zooms in past the current zoom and never out past `minZoom`.
 */
export function widenToReveal(
	current: { extent: Box; zoom: number },
	newcomers: Box,
	screen: { width: number; height: number },
	padding: number,
	minZoom: number
): Viewport | null {
	const { extent, zoom } = current;
	const inset = padding / zoom;
	const inView =
		newcomers.x1 >= extent.x1 + inset &&
		newcomers.y1 >= extent.y1 + inset &&
		newcomers.x2 <= extent.x2 - inset &&
		newcomers.y2 <= extent.y2 - inset;
	if (inView) return null;

	const frame: Box = {
		x1: Math.min(extent.x1, newcomers.x1),
		y1: Math.min(extent.y1, newcomers.y1),
		x2: Math.max(extent.x2, newcomers.x2),
		y2: Math.max(extent.y2, newcomers.y2)
	};
	const fitted = Math.min(
		(screen.width - 2 * padding) / (frame.x2 - frame.x1),
		(screen.height - 2 * padding) / (frame.y2 - frame.y1)
	);
	const next = Math.max(minZoom, Math.min(zoom, fitted));
	return {
		zoom: next,
		pan: {
			x: screen.width / 2 - next * ((frame.x1 + frame.x2) / 2),
			y: screen.height / 2 - next * ((frame.y1 + frame.y2) / 2)
		}
	};
}

/** Screen pixels along the canvas's edges that something floats over: a toolbar, a panel. */
export interface Covered {
	top: number;
	right?: number;
	bottom?: number;
}

/**
 * The viewport that frames `box` — the whole map — in the part of the canvas nothing floats
 * over (`covered`: the toolbar at the top, a panel at the right or along the foot), with
 * `padding` all round and the map centred in what is left. The zoom stays within
 * `zoom.min`..`zoom.max`, so a lone node is not blown up and a huge map is not shrunk to dust.
 */
export function frameBelow(
	box: Box,
	screen: { width: number; height: number },
	covered: Covered,
	padding: number,
	zoom: { min: number; max: number }
): Viewport {
	const { top, right = 0, bottom = 0 } = covered;
	const free = {
		width: screen.width - right - 2 * padding,
		height: screen.height - top - bottom - 2 * padding
	};
	const fitted = Math.min(
		free.width / Math.max(box.x2 - box.x1, Number.EPSILON),
		free.height / Math.max(box.y2 - box.y1, Number.EPSILON)
	);
	const next = Math.min(zoom.max, Math.max(zoom.min, fitted));
	return {
		zoom: next,
		pan: {
			x: (screen.width - right) / 2 - next * ((box.x1 + box.x2) / 2),
			y: top + (screen.height - top - bottom) / 2 - next * ((box.y1 + box.y2) / 2)
		}
	};
}

/** What to keep in view when the whole map cannot be shown at a readable size. */
export interface Focus {
	/** The part that matters most — the centre's core family. */
	box: Box;
	/** Where to centre when the map is wider than the screen: the person the map is about. */
	point?: { x: number; y: number };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Like {@link frameBelow}, but for the family tree (docs/dev/05 §5.8): when the whole map fits only
 * further out than `zoom.readable`, it zooms out no further than the `focus` (else the map) needs,
 * and never past `zoom.legible`, where the canvas would stop drawing the names (`legibleZoom`).
 * Across, it centres on the focus's `point`, shifted so the focus stays whole when it fits and no
 * empty room shows beyond the map's edge; down, a map taller than the screen shows from the
 * focus's top. Whatever falls outside is left to pan to.
 */
export function frameLegibly(
	map: Box,
	focus: Focus | null,
	screen: { width: number; height: number },
	covered: Covered,
	padding: number,
	zoom: { min: number; max: number; legible: number; readable: number }
): Viewport {
	const range = { min: zoom.min, max: zoom.max };
	const fitted = frameBelow(map, screen, covered, padding, range);
	if (fitted.zoom >= zoom.readable) return fitted;

	const target = focus?.box ?? map;
	const fittedTarget = frameBelow(target, screen, covered, padding, range).zoom;
	const z = clamp(
		Math.max(fitted.zoom, Math.min(fittedTarget, zoom.readable), zoom.legible),
		zoom.min,
		zoom.max
	);
	const { top, right = 0, bottom = 0 } = covered;
	const half = {
		width: (screen.width - right - 2 * padding) / (2 * z),
		height: (screen.height - top - bottom - 2 * padding) / (2 * z)
	};
	const centreOf = (low: number, high: number) => (low + high) / 2;

	let x = centreOf(map.x1, map.x2);
	if (map.x2 - map.x1 > 2 * half.width) {
		x = focus?.point?.x ?? centreOf(target.x1, target.x2);
		if (target.x2 - target.x1 <= 2 * half.width) {
			x = clamp(x, target.x2 - half.width, target.x1 + half.width);
		}
		x = clamp(x, map.x1 + half.width, map.x2 - half.width);
	}
	const y = map.y2 - map.y1 <= 2 * half.height ? centreOf(map.y1, map.y2) : target.y1 + half.height;
	return {
		zoom: z,
		pan: {
			x: (screen.width - right) / 2 - z * x,
			y: top + (screen.height - top - bottom) / 2 - z * y
		}
	};
}

/** How many people stand wholly off the free part of the screen, to either side. */
export interface Outside {
	left: number;
	right: number;
}

/** Counts the `boxes` (people, in model units) that lie wholly left or right of `view`. */
export function outsideOf(boxes: readonly Box[], view: Box): Outside {
	return {
		left: boxes.filter((b) => b.x2 < view.x1).length,
		right: boxes.filter((b) => b.x1 > view.x2).length
	};
}
