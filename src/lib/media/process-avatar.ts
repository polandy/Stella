import type { CropRect } from './crop';
import { encodeJpeg } from './encode-jpeg';
import { readCaptureDate } from './process-image';
import { turnPlan, type QuarterTurns } from './turn';

/*
 * Client-side avatar processing (docs/dev/02 §2.14). The browser applies EXIF orientation, cuts the
 * square the person chose in the cropper (`./crop`), and renders a full (512px) and a thumbnail
 * (128px) JPEG. Re-encoding via canvas drops all EXIF/GPS metadata (a privacy win) and keeps the
 * upload small — so the server needs no native image library. Only the capture date is read out
 * first, since a new picture also lands in the dated gallery. Browser-only (uses
 * createImageBitmap + canvas).
 */

const AVATAR_SIZE = 512;
/**
 * A profile picture cut from a group photo is rendered larger, so it stays sharp once it stands
 * on its own as a photo in the person's gallery (docs/dev/02 §2.14).
 */
export const CUT_SIZE = 1024;
const THUMB_SIZE = 128;
const QUALITY = 0.85;

export interface ProcessedAvatar {
	image: Blob;
	thumb: Blob;
	width: number;
	height: number;
	/** When it was taken, as its EXIF said; null when it said nothing usable. */
	takenAt: string | null;
}

/** The picture turned as the cropper showed it; the bitmap itself when it was not turned. */
function turnedSource(bitmap: ImageBitmap, turns: QuarterTurns): CanvasImageSource {
	if (turns === 0) return bitmap;
	const plan = turnPlan({ width: bitmap.width, height: bitmap.height }, turns);
	const canvas = document.createElement('canvas');
	canvas.width = plan.canvas.width;
	canvas.height = plan.canvas.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not available.');
	ctx.translate(plan.dx, plan.dy);
	ctx.rotate(plan.angle);
	ctx.drawImage(bitmap, 0, 0);
	return canvas;
}

function toSquareJpeg(
	bitmap: CanvasImageSource,
	size: number,
	sx: number,
	sy: number,
	crop: number
): Blob {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not available.');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, sx, sy, crop, crop, 0, 0, size, size);
	return encodeJpeg(canvas, QUALITY);
}

/**
 * `crop` is in the picture's pixels *after* EXIF orientation and the cropper's `turns` — the same
 * space the cropper measures, since browsers orient an image element from its EXIF too.
 */
export async function processAvatar(
	file: Blob,
	crop: CropRect,
	size = AVATAR_SIZE,
	turns: QuarterTurns = 0
): Promise<ProcessedAvatar> {
	const takenAt = await readCaptureDate(file);
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	try {
		const source = turnedSource(bitmap, turns);
		const image = toSquareJpeg(source, size, crop.x, crop.y, crop.size);
		const thumb = toSquareJpeg(source, THUMB_SIZE, crop.x, crop.y, crop.size);
		return { image, thumb, width: size, height: size, takenAt };
	} finally {
		bitmap.close();
	}
}
