import type { CropRect } from './crop';

/*
 * Client-side avatar processing (docs/02 §2.14). The browser applies EXIF orientation, cuts the
 * square the person chose in the cropper (`./crop`), and renders a full (512px) and a thumbnail
 * (128px) JPEG. Re-encoding via canvas drops all EXIF/GPS metadata (a privacy win) and keeps the
 * upload small — so the server needs no native image library. Browser-only (uses
 * createImageBitmap + canvas).
 */

const AVATAR_SIZE = 512;
const THUMB_SIZE = 128;
const QUALITY = 0.85;

export interface ProcessedAvatar {
	image: Blob;
	thumb: Blob;
	width: number;
	height: number;
}

function toSquareJpeg(bitmap: ImageBitmap, size: number, sx: number, sy: number, crop: number): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not available.');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, sx, sy, crop, crop, 0, 0, size, size);
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
			'image/jpeg',
			QUALITY
		);
	});
}

/**
 * `crop` is in the picture's pixels *after* EXIF orientation — the same space the cropper's
 * `<img>` measures, since browsers orient an image element from its EXIF too.
 */
export async function processAvatar(file: Blob, crop: CropRect): Promise<ProcessedAvatar> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	try {
		const [image, thumb] = await Promise.all([
			toSquareJpeg(bitmap, AVATAR_SIZE, crop.x, crop.y, crop.size),
			toSquareJpeg(bitmap, THUMB_SIZE, crop.x, crop.y, crop.size)
		]);
		return { image, thumb, width: AVATAR_SIZE, height: AVATAR_SIZE };
	} finally {
		bitmap.close();
	}
}
