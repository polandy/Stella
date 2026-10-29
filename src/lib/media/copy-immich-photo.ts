import { immichMediaToken } from '../immich/media-url';

/*
 * A photo from the whole Immich library, fetched through Stella's signed proxy at Immich's preview
 * size (docs/02 §2.24.9). It is handed on as a file, so it runs the very pipeline a photo from
 * the device runs — downscaled, re-encoded, no EXIF or GPS — and the token goes with it, for the
 * server to date a gallery's copy by what Immich said (signed, never taken from the browser).
 */

export interface ImmichCopy {
	file: File;
	immichToken: string;
}

/** Fetch the preview behind `previewUrl`; throws when it is not the proxy's or did not come. */
export async function copyImmichPhoto(previewUrl: string): Promise<ImmichCopy> {
	const immichToken = immichMediaToken(previewUrl);
	if (immichToken === null) throw new Error('Not a picture from Stella’s Immich proxy.');
	const response = await fetch(previewUrl);
	if (!response.ok) throw new Error(`The Immich proxy answered ${response.status}.`);
	const blob = await response.blob();
	if (!blob.type.startsWith('image/')) throw new Error('The Immich proxy sent no picture.');
	return { file: new File([blob], 'immich.jpg', { type: blob.type }), immichToken };
}
