import { groupPhotoRenditions, photoRenditions, type Renditions, type PixelSize } from './renditions';

/*
 * Client-side photo processing (docs/02 §2.20 / §2.14 / §2.4.2). Unlike avatars this does not
 * crop: it fits the image within the sizes `./renditions` decides, preserving aspect ratio, and
 * produces a full, a thumbnail and — for a large group photo — a 1600 px view JPEG.
 * Re-encoding via canvas drops all EXIF/GPS metadata (privacy) and keeps uploads small, so the
 * server needs no native image library. Browser-only (createImageBitmap + canvas).
 */

const QUALITY = 0.82;

export interface ProcessedImage {
	image: Blob;
	thumb: Blob;
	/** A group photo's 1600 px view; absent when the full picture is no larger. */
	view?: Blob;
	width: number;
	height: number;
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

async function render(file: Blob, sizes: (original: PixelSize) => Renditions): Promise<ProcessedImage> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	try {
		const { full, view, thumb } = sizes({ width: bitmap.width, height: bitmap.height });
		const [image, thumbBlob, viewBlob] = await Promise.all([
			toJpeg(bitmap, full),
			toJpeg(bitmap, thumb),
			view ? toJpeg(bitmap, view) : null
		]);
		return { image, thumb: thumbBlob, ...(viewBlob ? { view: viewBlob } : {}), width: full.width, height: full.height };
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
