/*
 * Client-side avatar processing (docs/02 §2.14). The browser applies EXIF orientation, centre-
 * crops to a square, and renders a full (512px) and a thumbnail (128px) JPEG. Re-encoding via
 * canvas drops all EXIF/GPS metadata (a privacy win) and keeps the upload small — so the server
 * needs no native image library. Browser-only (uses createImageBitmap + canvas).
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

export async function processAvatar(file: File): Promise<ProcessedAvatar> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	try {
		const crop = Math.min(bitmap.width, bitmap.height);
		const sx = (bitmap.width - crop) / 2;
		const sy = (bitmap.height - crop) / 2;
		const [image, thumb] = await Promise.all([
			toSquareJpeg(bitmap, AVATAR_SIZE, sx, sy, crop),
			toSquareJpeg(bitmap, THUMB_SIZE, sx, sy, crop)
		]);
		return { image, thumb, width: AVATAR_SIZE, height: AVATAR_SIZE };
	} finally {
		bitmap.close();
	}
}
