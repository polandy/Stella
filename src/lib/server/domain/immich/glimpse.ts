import { immichMediaUrl } from '../../../immich/media-url';
import type { GlimpsePhoto, ImmichGlimpse } from '../../../immich/strip';
import { immichPhotoUrl } from '../../../immich/web-link';
import type { Viewer } from '../../access/visibility';
import { isAssetCursor, type ImmichFailure, type ImmichGateway, type ImmichImage } from './gateway';
import type { ImmichLinkRepository, LinkVisibleContacts } from './links';
import type { ImmichMediaSigner } from './signed-media';

/*
 * A glimpse of a linked person's photos (docs/concepts/immich.md §4.3, §5): the strip under the
 * gallery, and what the proxy serves for each picture in it. Every image URL handed out is
 * signed, and only after the access layer let the viewer see the contact; the proxy checks the
 * signature, the viewer and the link again on every request, so a token outlives none of them.
 */

/** How many photos the strip shows at first, and how many more each *Show more* adds. */
export const GLIMPSE_PAGE_SIZE = 12;

export interface ImmichGlimpseDeps {
	links: Pick<ImmichLinkRepository, 'findForContactVisibleTo'>;
	gateway: Pick<ImmichGateway, 'latestAssets'>;
	signer: ImmichMediaSigner;
	/** Where links into Immich point (`IMMICH_PUBLIC_URL`). */
	publicUrl: string;
}

/**
 * The linked person's latest photos, a page at a time, newest first; null when the viewer
 * cannot see the contact or it is not linked — the strip then does not exist. A key that may not
 * read photos reads as "Immich didn't answer", as everywhere on the person page; Settings names
 * the scope it lacks.
 */
export async function readImmichGlimpse(
	deps: ImmichGlimpseDeps,
	viewer: Viewer,
	contactId: string,
	cursor: string | null
): Promise<ImmichGlimpse | null> {
	const link = await deps.links.findForContactVisibleTo(viewer, contactId);
	if (!link) return null;
	// A cursor comes back from the browser; one that is not Immich's ends the strip.
	if (cursor !== null && !isAssetCursor(cursor)) return { state: 'photos', photos: [], nextCursor: null };

	const page = await deps.gateway.latestAssets(link.immichPersonId, GLIMPSE_PAGE_SIZE, cursor);
	if (!page.ok) return { state: page.failure === 'notFound' ? 'personGone' : 'unreachable' };

	const photos = await Promise.all(
		page.value.assets.map(async ({ id, takenOn }): Promise<GlimpsePhoto> => {
			const signed = (size: 'thumbnail' | 'preview') =>
				deps.signer.sign({ kind: 'photo', contactId, personId: link.immichPersonId, assetId: id, size });
			const [thumbnail, preview] = await Promise.all([signed('thumbnail'), signed('preview')]);
			return {
				id,
				takenOn,
				thumbnailUrl: immichMediaUrl(thumbnail),
				previewUrl: immichMediaUrl(preview),
				openUrl: immichPhotoUrl(deps.publicUrl, id)
			};
		})
	);
	return { state: 'photos', photos, nextCursor: page.value.nextCursor };
}

/**
 * The signed URL of a face the picker offers while linking `contactId`. Faces go through the
 * same proxy as photos (concept §9.10): the picker's route has checked the viewer may see the
 * contact, and the proxy checks it again.
 */
export async function faceUrlFor(signer: ImmichMediaSigner, contactId: string, personId: string): Promise<string> {
	return immichMediaUrl(await signer.sign({ kind: 'face', contactId, personId }));
}

/** Why the proxy serves nothing: the token, the viewer, the link, or Immich. */
export type ImmichMediaRefusal = 'invalid' | 'expired' | 'notVisible' | 'notLinked' | ImmichFailure;

export type ImmichMediaOutcome = { ok: true; image: ImmichImage } | { ok: false; refusal: ImmichMediaRefusal };

export interface ImmichMediaDeps {
	links: Pick<ImmichLinkRepository, 'findForContactVisibleTo'>;
	contacts: LinkVisibleContacts;
	gateway: Pick<ImmichGateway, 'assetImage' | 'personThumbnail'>;
	signer: ImmichMediaSigner;
}

/**
 * The image a signed token names, for this viewer now. In order, each refused before Immich is
 * asked anything: the signature and its expiry; whether the viewer may see the contact, through
 * the access layer; and, for a photo, whether the contact is still linked to the person the
 * photo was listed for — an unlink or a relink ends every URL issued before it.
 */
export async function openImmichMedia(
	deps: ImmichMediaDeps,
	viewer: Viewer,
	token: string
): Promise<ImmichMediaOutcome> {
	const verified = await deps.signer.verify(token);
	if (!verified.ok) return { ok: false, refusal: verified.reason };
	const { media } = verified;

	if (!(await deps.contacts.findByIdVisibleTo(viewer, media.contactId))) return { ok: false, refusal: 'notVisible' };

	if (media.kind === 'face') return served(await deps.gateway.personThumbnail(media.personId));

	const link = await deps.links.findForContactVisibleTo(viewer, media.contactId);
	if (link?.immichPersonId !== media.personId) return { ok: false, refusal: 'notLinked' };
	return served(await deps.gateway.assetImage(media.assetId, media.size));
}

function served(
	outcome: { ok: true; value: ImmichImage } | { ok: false; failure: ImmichFailure }
): ImmichMediaOutcome {
	return outcome.ok ? { ok: true, image: outcome.value } : { ok: false, refusal: outcome.failure };
}
