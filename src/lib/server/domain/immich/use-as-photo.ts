import type { Viewer } from '../../access/visibility';
import type { AvatarUpload, AvatarUploader } from '../media/avatars';
import { admitImmichMedia, type ImmichMediaAdmissionRefusal, type ImmichMediaDeps } from './glimpse';

/*
 * *Use as photo* from the Immich viewer (docs/concepts/immich.md §4.3, docs/02 §2.24.6): the one
 * way Immich content enters Stella, as a deliberate copy by a person, never a sync.
 *
 * The browser cuts the square out of the preview the signed proxy served it, in the same cropper
 * and through the same canvas re-encode as any new picture (docs/02 §2.14) — so the server needs
 * no image library and no EXIF ever reaches it. What the server decides is whether to take that
 * square as a copy of an Immich photo: only with the preview token it signed for this person,
 * while the viewer still sees them (the access layer) and they are still linked to the Immich
 * person the photo was listed for. Immich is never asked anything here, so no asset id the
 * browser names is ever fetched. The capture date is the one Immich gave, signed into the token,
 * not one the browser sends.
 */

export interface UseImmichPhotoDeps extends Pick<ImmichMediaDeps, 'links' | 'contacts' | 'signer'> {
	/** Stores a new picture and makes it the person's photo: the path every new avatar takes. */
	setAvatar(uploader: AvatarUploader, contactId: string, upload: AvatarUpload): Promise<string>;
}

export interface ImmichPhotoCopy {
	/** The person whose page the viewer is on. */
	contactId: string;
	/** The token of the preview URL the square was cut from. */
	token: string;
	/** The square, rendered in the browser; its date comes from the token. */
	upload: Omit<AvatarUpload, 'takenAt'>;
}

export type UseImmichPhotoOutcome =
	| { ok: true; photoId: string }
	| { ok: false; refusal: ImmichMediaAdmissionRefusal };

/**
 * Keep the square as the person's new photo, dated as Immich dated the original. Throws the
 * avatar path's `InvalidAvatarError` for a square that is not an image Stella stores.
 */
export async function useImmichPhoto(
	deps: UseImmichPhotoDeps,
	viewer: Viewer,
	copy: ImmichPhotoCopy
): Promise<UseImmichPhotoOutcome> {
	const admitted = await admitImmichMedia(deps, viewer, copy.token);
	if (!admitted.ok) return admitted;
	const { media } = admitted;
	// Only the picture the viewer showed, and only on the page of the person it was listed for.
	if (media.kind !== 'photo' || media.size !== 'preview' || media.contactId !== copy.contactId) {
		return { ok: false, refusal: 'invalid' };
	}

	const photoId = await deps.setAvatar(
		{ userId: viewer.id, householdId: viewer.householdId },
		copy.contactId,
		{ ...copy.upload, takenAt: media.takenAt ?? null }
	);
	return { ok: true, photoId };
}
