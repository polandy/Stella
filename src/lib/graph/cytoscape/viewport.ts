/*
 * How the canvas makes room for what an expand brought in (docs/05 §5.8). Pure arithmetic over
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

/** What to keep in view when the whole map cannot be shown with its names drawn. */
export interface Focus {
	/** The part that matters most — the family tree. */
	box: Box;
	/** Where to centre when even that is too wide: the person the map is about. */
	point?: { x: number; y: number };
}

/**
 * Like {@link frameBelow}, but never zoomed out past `zoom.legible`, where the canvas would stop
 * drawing the names (`legibleZoom`, docs/05 §5.8). When the whole map fits only further out, it
 * is shown at the legible zoom instead: the `focus` (else the map) from its top edge down, centred
 * across the free part — or, if wider than that, centred on its `point` — and whatever falls
 * outside, the shelf beneath the tree, is left to pan to.
 */
export function frameLegibly(
	map: Box,
	focus: Focus | null,
	screen: { width: number; height: number },
	covered: Covered,
	padding: number,
	zoom: { min: number; max: number; legible: number }
): Viewport {
	const fitted = frameBelow(map, screen, covered, padding, { min: zoom.min, max: zoom.max });
	if (fitted.zoom >= zoom.legible) return fitted;

	const { top, right = 0 } = covered;
	const z = Math.min(zoom.max, Math.max(zoom.min, zoom.legible));
	const target = focus?.box ?? map;
	const freeWidth = screen.width - right - 2 * padding;
	const middle = (screen.width - right) / 2;
	const x =
		(target.x2 - target.x1) * z <= freeWidth
			? (target.x1 + target.x2) / 2
			: (focus?.point?.x ?? (target.x1 + target.x2) / 2);
	return {
		zoom: z,
		pan: { x: middle - z * x, y: top + padding - z * target.y1 }
	};
}
