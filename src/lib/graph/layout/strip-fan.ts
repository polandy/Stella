/*
 * The People card's map strip on a wide card (docs/05 §5.5): a short, wide picture of the
 * people entered, drawn by the server before — and instead of — the live map. The strip is
 * 7.5 rem tall, so a ring would shrink the faces past reading; the fan runs sideways instead,
 * half the people to the left of this person and half to the right, each side in two
 * staggered rows, so a first name fits over or under every face. Drawn at its own size and
 * centred in the card, a narrow card crops the far ends rather than shrinking the names.
 */

/** The strip's height in CSS pixels: `h-30`, 7.5 rem. */
export const STRIP_HEIGHT = 120;

/** How far the first face on each side stands from this person's. */
const INNER = 84;
/** The room one first name takes in a row; faces in the same row stand this far apart. */
const LABEL_WIDTH = 96;
/** How far each row stands above or below the middle. */
const ROW_OFFSET = 22;
/** A name's baseline over a face in the upper row, and under one in the lower. */
const LABEL_ABOVE = 16;
const LABEL_BELOW = 25;

export interface StripNode {
	x: number;
	y: number;
	/** Where the first name's baseline sits: over the face in the upper row, under it in the lower. */
	labelY: number;
}

export interface StripFan {
	width: number;
	height: number;
	center: { x: number; y: number };
	/** One per person, in the order given: the first half to the left, the rest to the right. */
	nodes: StripNode[];
	/** The room a name has, which the drawing gives its text as a maximum length. */
	labelWidth: number;
}

/** Where `count` people stand in the strip, and how wide it is. */
export function stripFan(count: number): StripFan {
	const leftCount = Math.ceil(count / 2);
	const offsets = Array.from({ length: count }, (_, index) => {
		const side = index < leftCount ? -1 : 1;
		const k = index < leftCount ? index : index - leftCount;
		const lower = k % 2 === 1;
		const along = INNER + Math.floor(k / 2) * LABEL_WIDTH + (lower ? LABEL_WIDTH / 2 : 0);
		return { dx: side * along, lower };
	});
	const reach = Math.max(INNER, ...offsets.map(({ dx }) => Math.abs(dx)));
	const width = 2 * (reach + LABEL_WIDTH / 2);
	const center = { x: width / 2, y: STRIP_HEIGHT / 2 };
	return {
		width,
		height: STRIP_HEIGHT,
		center,
		nodes: offsets.map(({ dx, lower }) => {
			const y = center.y + (lower ? ROW_OFFSET : -ROW_OFFSET);
			return { x: center.x + dx, y, labelY: lower ? y + LABEL_BELOW : y - LABEL_ABOVE };
		}),
		labelWidth: LABEL_WIDTH
	};
}
