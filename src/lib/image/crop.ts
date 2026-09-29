/*
 * The square a person's photo is cut to (docs/02 §2.14). Pure geometry, no DOM: the cropper
 * dialog draws the picture with `imagePlacement` and the canvas cuts with `cropRect`, both from
 * the same `Crop`, so what the dialog shows is exactly what gets uploaded.
 *
 * A crop is kept as the centre of the square in picture pixels plus a zoom, where zoom 1 is the
 * largest square the picture holds (its short side). Every operation clamps, so the square never
 * leaves the picture and there is no blank border to upload.
 */

/** Zooming further than this only shows the camera's noise at avatar size. */
export const MAX_ZOOM = 6;

export interface ImageSize {
	width: number;
	height: number;
}

export interface Crop {
	centerX: number;
	centerY: number;
	zoom: number;
}

/** The cut, in picture pixels. */
export interface CropRect {
	x: number;
	y: number;
	size: number;
}

/** Where to draw the whole picture, in window pixels, so the crop fills the window. */
export interface Placement {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** A point inside the window, as fractions of its width and height (0,0 is top-left). */
export interface WindowPoint {
	x: number;
	y: number;
}

const WINDOW_CENTRE: WindowPoint = { x: 0.5, y: 0.5 };

function side(image: ImageSize, zoom: number): number {
	return Math.min(image.width, image.height) / zoom;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function withinPicture(image: ImageSize, crop: Crop): Crop {
	const zoom = clamp(crop.zoom, 1, MAX_ZOOM);
	const half = side(image, zoom) / 2;
	return {
		centerX: clamp(crop.centerX, half, image.width - half),
		centerY: clamp(crop.centerY, half, image.height - half),
		zoom
	};
}

/** The centred square of the whole short side — what the uploader cut before there was a choice. */
export function initialCrop(image: ImageSize): Crop {
	return { centerX: image.width / 2, centerY: image.height / 2, zoom: 1 };
}

export function cropRect(image: ImageSize, crop: Crop): CropRect {
	const size = side(image, crop.zoom);
	return { x: crop.centerX - size / 2, y: crop.centerY - size / 2, size };
}

/**
 * Drag the picture by a distance in window pixels. The picture follows the finger, so the
 * square moves the other way across it.
 */
export function panBy(
	image: ImageSize,
	crop: Crop,
	delta: { dx: number; dy: number },
	windowPx: number
): Crop {
	const picturePerWindowPx = side(image, crop.zoom) / windowPx;
	return withinPicture(image, {
		...crop,
		centerX: crop.centerX - delta.dx * picturePerWindowPx,
		centerY: crop.centerY - delta.dy * picturePerWindowPx
	});
}

/**
 * Zoom to `zoom`, keeping the part of the picture under `focus` (the fingers, the mouse, or
 * the window's centre) where it is on screen.
 */
export function zoomTo(image: ImageSize, crop: Crop, zoom: number, focus: WindowPoint = WINDOW_CENTRE): Crop {
	const before = cropRect(image, crop);
	const nextZoom = clamp(zoom, 1, MAX_ZOOM);
	const nextSide = side(image, nextZoom);
	const pinnedX = before.x + focus.x * before.size;
	const pinnedY = before.y + focus.y * before.size;
	return withinPicture(image, {
		centerX: pinnedX - focus.x * nextSide + nextSide / 2,
		centerY: pinnedY - focus.y * nextSide + nextSide / 2,
		zoom: nextZoom
	});
}

export function imagePlacement(image: ImageSize, crop: Crop, windowPx: number): Placement {
	const rect = cropRect(image, crop);
	const scale = windowPx / rect.size;
	return {
		left: -rect.x * scale,
		top: -rect.y * scale,
		width: image.width * scale,
		height: image.height * scale
	};
}
