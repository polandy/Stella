import { cropRect, initialCrop } from './crop';
import { sendImmichPhoto } from './send-immich-photo';

/*
 * Keeping the face Immich shows of someone as their photo, for a person just added from *New
 * from Immich* (docs/02 §2.24.7). The same path as *Use as photo* (docs/02 §2.24.6): the face is
 * fetched through the signed proxy, cut to its largest centred square and re-encoded in the
 * browser like any new picture, then posted with the token it was served under — which the server
 * accepts only while the person is linked to that very face.
 */

/** Keep the face behind `faceUrl` as the person's photo; throws when it was not stored. */
export async function sendImmichFace(contactId: string, faceUrl: string): Promise<void> {
	const answer = await fetch(faceUrl);
	if (!answer.ok) throw new Error(`The face could not be read (${answer.status}).`);
	const picture = await answer.blob();
	const bitmap = await createImageBitmap(picture);
	const size = { width: bitmap.width, height: bitmap.height };
	bitmap.close();
	await sendImmichPhoto(contactId, faceUrl, picture, cropRect(size, initialCrop(size)));
}
