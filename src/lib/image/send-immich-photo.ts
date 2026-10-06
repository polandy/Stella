import { immichMediaToken } from '../immich/media-url';
import { submitAction } from '../undo/submit-action';
import type { CropRect } from './crop';
import { processAvatar } from './process-avatar';

/*
 * Sending the square cut from a photo in Immich (docs/02 §2.24.6): rendered and re-encoded in the
 * browser as any new picture is, so nothing but the pixels leaves it, and posted with the signed
 * token of the preview it was cut from. Shared by the Immich viewer and the picture's chooser.
 * The capture date the browser might read out of the preview is left behind: the server dates the
 * copy by what Immich said, signed into the token. It goes now or fails — never kept for later.
 */

/** Render `crop` of `picture` and keep it as the person's photo; throws when it was not stored. */
export async function sendImmichPhoto(
	contactId: string,
	previewUrl: string,
	picture: Blob,
	crop: CropRect
): Promise<void> {
	const token = immichMediaToken(previewUrl);
	if (token === null) throw new Error('Not a picture from Stella’s Immich proxy.');
	const { image, thumb, width, height } = await processAvatar(picture, crop);
	const body = new FormData();
	body.append('token', token);
	body.append('image', image, 'avatar.jpg');
	body.append('thumb', thumb, 'thumb.jpg');
	body.append('width', String(width));
	body.append('height', String(height));
	await submitAction(fetch, `/contacts/${encodeURIComponent(contactId)}?/useImmichPhoto`, body, {
		keepalive: false
	});
}
