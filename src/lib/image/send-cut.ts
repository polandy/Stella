import type { CropRect } from './crop';
import { CUT_SIZE, processAvatar } from './process-avatar';

/*
 * Sending a profile picture cut from a group photo (docs/concepts/circle-photos.md §5): the
 * square is rendered in the browser at 1024 px, as any avatar is rendered, and posted with the
 * square itself to the form action that stores it. The circle page's lightbox and the person
 * page share this; each names its own action. A cut is a change, not an addition, so it is
 * never kept for later on the device (concept §6) — it goes now, or it fails.
 */

/** The full picture a cut is made from: only the cropper loads it (concept §5.3). */
export async function loadFullPicture(url: string): Promise<Blob> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`The picture did not load (${res.status}).`);
	return res.blob();
}

/** Render `crop` of `picture` and post it to `action` with `fields`; throws when it was not stored. */
export async function sendCut(
	action: string,
	fields: Record<string, string>,
	picture: Blob,
	crop: CropRect
): Promise<void> {
	const { image, thumb, width, height } = await processAvatar(picture, crop, CUT_SIZE);
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	body.append('cropX', String(crop.x));
	body.append('cropY', String(crop.y));
	body.append('cropSize', String(crop.size));
	body.append('image', image, 'avatar.jpg');
	body.append('thumb', thumb, 'thumb.jpg');
	body.append('width', String(width));
	body.append('height', String(height));
	const res = await fetch(action, { method: 'POST', body });
	if (!res.ok) throw new Error(`The cut was not saved (${res.status}).`);
}
