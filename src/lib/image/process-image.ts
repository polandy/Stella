/*
 * Client-side journal image processing (docs/02 §2.20 / §2.14). Unlike avatars this does not
 * crop: it fits the image within a max edge, preserving aspect ratio, and produces a full and a
 * thumbnail JPEG. Re-encoding via canvas drops all EXIF/GPS metadata (privacy) and keeps uploads
 * small, so the server needs no native image library. Browser-only (createImageBitmap + canvas).
 */

const MAX_EDGE = 1600;
const THUMB_EDGE = 480;
const QUALITY = 0.82;

export interface ProcessedImage {
	image: Blob;
	thumb: Blob;
	width: number;
	height: number;
}

/** Target size that fits (w×h) within `edge` on its longest side, never upscaling. */
function fit(w: number, h: number, edge: number): { w: number; h: number } {
	const scale = Math.min(1, edge / Math.max(w, h));
	return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function toJpeg(bitmap: ImageBitmap, w: number, h: number): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not available.');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, 0, 0, w, h);
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
			'image/jpeg',
			QUALITY
		);
	});
}

export async function processImage(file: File): Promise<ProcessedImage> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	try {
		const full = fit(bitmap.width, bitmap.height, MAX_EDGE);
		const thumb = fit(bitmap.width, bitmap.height, THUMB_EDGE);
		const [image, thumbBlob] = await Promise.all([
			toJpeg(bitmap, full.w, full.h),
			toJpeg(bitmap, thumb.w, thumb.h)
		]);
		return { image, thumb: thumbBlob, width: full.w, height: full.h };
	} finally {
		bitmap.close();
	}
}
