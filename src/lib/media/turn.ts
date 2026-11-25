import type { Crop, ImageSize, Placement } from './crop';

// Quarter turns before the square is cut (docs/dev/02 §2.14): one geometry for the cropper and the canvas.

/** Quarter turns clockwise. */
export type QuarterTurns = 0 | 1 | 2 | 3;

export type TurnDirection = 'left' | 'right';

export function turned(turns: QuarterTurns, direction: TurnDirection): QuarterTurns {
	return ((turns + (direction === 'right' ? 1 : 3)) % 4) as QuarterTurns;
}

export function turnedSize(image: ImageSize, turns: QuarterTurns): ImageSize {
	return turns % 2 === 0 ? image : { width: image.height, height: image.width };
}

/** The canvas transform that draws `image` turned: translate by (dx, dy), then rotate by `angle`. */
export interface TurnPlan {
	canvas: ImageSize;
	dx: number;
	dy: number;
	angle: number;
}

export function turnPlan(image: ImageSize, turns: QuarterTurns): TurnPlan {
	const canvas = turnedSize(image, turns);
	const angle = (turns * Math.PI) / 2;
	if (turns === 1) return { canvas, dx: image.height, dy: 0, angle };
	if (turns === 2) return { canvas, dx: image.width, dy: image.height, angle };
	if (turns === 3) return { canvas, dx: 0, dy: image.width, angle };
	return { canvas, dx: 0, dy: 0, angle: 0 };
}

/** The same part of the picture, once `image` (as shown before the turn) turns one quarter. */
export function turnCrop(image: ImageSize, crop: Crop, direction: TurnDirection): Crop {
	const { centerX: x, centerY: y, zoom } = crop;
	return direction === 'right'
		? { centerX: image.height - y, centerY: x, zoom }
		: { centerX: y, centerY: image.width - x, zoom };
}

/** Where to draw the unturned picture so that, turned about its centre, it fills `placement`. */
export function turnStyle(
	placement: Placement,
	turns: QuarterTurns
): Placement & { transform: string } {
	if (turns === 0) return { ...placement, transform: 'none' };
	const width = turns % 2 === 0 ? placement.width : placement.height;
	const height = turns % 2 === 0 ? placement.height : placement.width;
	return {
		left: placement.left + placement.width / 2 - width / 2,
		top: placement.top + placement.height / 2 - height / 2,
		width,
		height,
		transform: `rotate(${turns * 90}deg)`
	};
}
