import { readExifCaptureDate } from './exif-date';
import {
	groupPhotoRenditions,
	photoRenditions,
	type Renditions,
	type PixelSize
} from './renditions';
import { isPlausibleTakenAt } from './taken-at';

/*
 * Client-side photo processing (docs/02 §2.20 / §2.14 / §2.4.2). Unlike avatars this does not
 * crop: it fits the image within the sizes `./renditions` decides, preserving aspect ratio, and
 * produces a full, a thumbnail and — for a large group photo — a 1600 px view JPEG.
 * Re-encoding via canvas drops all EXIF/GPS metadata (privacy) and keeps uploads small, so the
 * server needs no native image library. Only the capture date is read out first and sent beside
 * the picture (`./exif-date`). Browser-only (createImageBitmap + canvas).
 */

/**
 * How much of a file is read for its EXIF: the APP1 segment sits at the start and is at most
 * 64 KiB, behind at most a JFIF segment or two.
 */
const EXIF_HEAD_BYTES = 256 * 1024;

/**
 * When the picture was taken, out of its EXIF; null when it does not say, or says something
 * that cannot be true (a camera whose clock was never set), so an upload never fails over it.
 */
export async function readCaptureDate(file: Blob): Promise<string | null> {
	const head = new Uint8Array(await file.slice(0, EXIF_HEAD_BYTES).arrayBuffer());
	const takenAt = readExifCaptureDate(head);
	return takenAt !== null && isPlausibleTakenAt(takenAt, Date.now()) ? takenAt : null;
}

const QUALITY = 0.82;

export interface ProcessedImage {
	image: Blob;
	thumb: Blob;
	/** A group photo's 1600 px view; absent when the full picture is no larger. */
	view?: Blob;
	width: number;
	height: number;
	/** When it was taken, as its EXIF said (`./taken-at`); null when it said nothing usable. */
	takenAt: string | null;
}

function toJpeg(bitmap: ImageBitmap, size: PixelSize): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = size.width;
	canvas.height = size.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not available.');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, 0, 0, size.width, size.height);
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
			'image/jpeg',
			QUALITY
		);
	});
}

async function render(
	file: Blob,
	sizes: (original: PixelSize) => Renditions
): Promise<ProcessedImage> {
	const takenAt = await readCaptureDate(file);
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	try {
		const { full, view, thumb } = sizes({ width: bitmap.width, height: bitmap.height });
		const [image, thumbBlob, viewBlob] = await Promise.all([
			toJpeg(bitmap, full),
			toJpeg(bitmap, thumb),
			view ? toJpeg(bitmap, view) : null
		]);
		return {
			image,
			thumb: thumbBlob,
			...(viewBlob ? { view: viewBlob } : {}),
			width: full.width,
			height: full.height,
			takenAt
		};
	} finally {
		bitmap.close();
	}
}

/**
 * Downscale one picture into a full-size and a thumbnail JPEG. Takes any `Blob`, not only a
 * picked `File`: a Monica JSON import fetches its pictures back from the server (docs/02 §2.16).
 */
export function processImage(file: Blob): Promise<ProcessedImage> {
	return render(file, photoRenditions);
}

/** A circle's group photo: kept up to 4096 px so faces can be cut from it, with a 1600 px view. */
export function processGroupPhoto(file: Blob): Promise<ProcessedImage> {
	return render(file, groupPhotoRenditions);
}
