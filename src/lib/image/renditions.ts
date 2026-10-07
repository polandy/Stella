/*
 * The sizes a picture is stored at (docs/02 §2.14). Pure
 * geometry, so the browser's canvas code (`./process-image`) only draws what is decided here.
 * A person's or a journal photo is kept at 1600 px. A group photo is kept up to 4096 px, so a
 * face in a class photo can be cut from it, and gets a 1600 px view beside that for the grid and
 * the lightbox — only the cropper loads the full picture. Nothing is ever enlarged.
 */

export interface PixelSize {
	width: number;
	height: number;
}

/** The sizes one picture is stored at; `view` is null when the full picture is already that small. */
export interface Renditions {
	full: PixelSize;
	view: PixelSize | null;
	thumb: PixelSize;
}

/** The longest edge a person's or journal photo is kept at, and a group photo's view. */
const PHOTO_EDGE = 1600;
/** The longest edge a group photo is kept at. */
const GROUP_PHOTO_EDGE = 4096;
/** The longest edge of every thumbnail. */
const THUMB_EDGE = 480;

/** `size` fitted within `edge` on its longest side, never enlarged. */
function fit(size: PixelSize, edge: number): PixelSize {
	const scale = Math.min(1, edge / Math.max(size.width, size.height));
	return {
		width: Math.max(1, Math.round(size.width * scale)),
		height: Math.max(1, Math.round(size.height * scale))
	};
}

/** A person's or journal photo: 1600 px and a thumbnail. */
export function photoRenditions(original: PixelSize): Renditions {
	return { full: fit(original, PHOTO_EDGE), view: null, thumb: fit(original, THUMB_EDGE) };
}

/** A group photo: up to 4096 px, a 1600 px view when that is smaller, and a thumbnail. */
export function groupPhotoRenditions(original: PixelSize): Renditions {
	const full = fit(original, GROUP_PHOTO_EDGE);
	const view = Math.max(full.width, full.height) > PHOTO_EDGE ? fit(original, PHOTO_EDGE) : null;
	return { full, view, thumb: fit(original, THUMB_EDGE) };
}
