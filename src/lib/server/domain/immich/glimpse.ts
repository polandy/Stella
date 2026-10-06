import { immichMediaUrl } from '../../../immich/media-url';
import type { GlimpsePhoto, ImmichGlimpse } from '../../../immich/strip';
import { immichPhotoUrl } from '../../../immich/web-link';
import type { Viewer } from '../../access/visibility';
import {
	isAssetCursor,
	type ImmichFailure,
	type ImmichGateway,
	type ImmichImage,
	type ImmichPeopleFilter
} from './gateway';
import type { ImmichLinkRepository, LinkVisibleContacts } from './links';
import type { ImmichCompanion, ImmichMediaSigner, SignedImmichMedia } from './signed-media';

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
 *
 * With `togetherWith`, only the photos both people are in (concept §4.3, *You and Julia*): the
 * other person must be someone else the viewer sees and who is linked too, or there is no
 * strip, and Immich is not asked. Which pairs the page offers is the page's choice; what is
 * checked here is only what the viewer could already see of each of them.
 */
export async function readImmichGlimpse(
	deps: ImmichGlimpseDeps,
	viewer: Viewer,
	contactId: string,
	cursor: string | null,
	togetherWith: string | null = null
): Promise<ImmichGlimpse | null> {
	const link = await deps.links.findForContactVisibleTo(viewer, contactId);
	if (!link) return null;
	let together: ImmichCompanion | undefined;
	if (togetherWith !== null) {
		if (togetherWith === contactId) return null;
		const other = await deps.links.findForContactVisibleTo(viewer, togetherWith);
		if (!other) return null;
		together = { contactId: togetherWith, personId: other.immichPersonId };
	}
	// A cursor comes back from the browser; one that is not Immich's ends the strip.
	if (cursor !== null && !isAssetCursor(cursor))
		return { state: 'photos', photos: [], nextCursor: null };

	const people: ImmichPeopleFilter = together
		? { personIds: [link.immichPersonId, together.personId], match: 'all' }
		: { personIds: [link.immichPersonId], match: 'any' };
	const page = await deps.gateway.latestAssets(people, GLIMPSE_PAGE_SIZE, cursor);
	if (!page.ok) return { state: page.failure === 'notFound' ? 'personGone' : 'unreachable' };

	const photos = await Promise.all(
		page.value.assets.map(async ({ id, takenAt }): Promise<GlimpsePhoto> => {
			const photo = {
				kind: 'photo',
				contactId,
				personId: link.immichPersonId,
				assetId: id,
				...(together ? { together } : {})
			} as const;
			const [thumbnail, preview] = await Promise.all([
				deps.signer.sign({ ...photo, size: 'thumbnail' }),
				// The preview is what *Use as photo* cuts from, so it carries the date the copy keeps.
				deps.signer.sign({ ...photo, size: 'preview', ...(takenAt === null ? {} : { takenAt }) })
			]);
			return {
				id,
				takenOn: takenAt === null ? null : takenAt.slice(0, 10),
				thumbnailUrl: immichMediaUrl(thumbnail),
				previewUrl: immichMediaUrl(preview),
				openUrl: immichPhotoUrl(deps.publicUrl, id)
			};
		})
	);
	return { state: 'photos', photos, nextCursor: page.value.nextCursor };
}

/**
 * Of `candidates`, the people the page may offer photos together with (concept §4.3): those the
 * viewer sees who are linked too, in the order given — and nobody when the page's own person is
 * not linked. Immich is asked nothing; the page offers, the strip's own request checks again.
 */
export async function readTogetherOffers(
	deps: Pick<ImmichGlimpseDeps, 'links'>,
	viewer: Viewer,
	contactId: string,
	candidates: readonly string[]
): Promise<string[]> {
	if (!(await deps.links.findForContactVisibleTo(viewer, contactId))) return [];
	const linked = await Promise.all(
		candidates.map(async (id) =>
			id !== contactId && (await deps.links.findForContactVisibleTo(viewer, id)) ? id : null
		)
	);
	return linked.filter((id): id is string => id !== null);
}

/**
 * The signed URL of a face the picker offers while linking `contactId`. Faces go through the
 * same proxy as photos (concept §9.10): the picker's route has checked the viewer may see the
 * contact, and the proxy checks it again.
 */
export async function faceUrlFor(
	signer: ImmichMediaSigner,
	contactId: string,
	personId: string
): Promise<string> {
	return immichMediaUrl(await signer.sign({ kind: 'face', contactId, personId }));
}

/**
 * The signed URL of a face on *New from Immich* (docs/02 §2.24.7): someone Immich names whom
 * no contact holds. There is no contact to sign for, so it is signed for the viewer's household;
 * the proxy serves it only to a member of that household, and only while nobody holds the face.
 */
export async function newcomerFaceUrl(
	signer: ImmichMediaSigner,
	householdId: string,
	personId: string
): Promise<string> {
	return immichMediaUrl(await signer.sign({ kind: 'newcomer', householdId, personId }));
}

/** Why the proxy serves nothing: the token, the viewer, the link, or Immich. */
export type ImmichMediaRefusal = ImmichMediaAdmissionRefusal | ImmichFailure;

export type ImmichMediaOutcome =
	{ ok: true; image: ImmichImage } | { ok: false; refusal: ImmichMediaRefusal };

export interface ImmichMediaDeps {
	links: Pick<ImmichLinkRepository, 'findForContactVisibleTo' | 'holdersOf'>;
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
	const admitted = await admitImmichMedia(deps, viewer, token);
	if (!admitted.ok) return admitted;
	const { media } = admitted;
	if (media.kind !== 'photo') return served(await deps.gateway.personThumbnail(media.personId));
	return served(await deps.gateway.assetImage(media.assetId, media.size));
}

/** Why a token is turned away before Immich is asked anything. */
export type ImmichMediaAdmissionRefusal = 'invalid' | 'expired' | 'notVisible' | 'notLinked';

/**
 * Whether a token still names something this viewer may have, asking Immich nothing: the
 * signature and its expiry; whether the viewer sees the contact, through the access layer; and,
 * for a photo, whether the contact is still linked to the person the photo was listed for. A
 * photo of two people together asks both questions of both. The proxy asks it before serving,
 * *Use as photo* before keeping a copy.
 */
export async function admitImmichMedia(
	deps: Pick<ImmichMediaDeps, 'links' | 'contacts' | 'signer'>,
	viewer: Viewer,
	token: string
): Promise<
	{ ok: true; media: SignedImmichMedia } | { ok: false; refusal: ImmichMediaAdmissionRefusal }
> {
	const verified = await deps.signer.verify(token);
	if (!verified.ok) return { ok: false, refusal: verified.reason };
	const { media } = verified;

	if (media.kind === 'newcomer') {
		// Not the viewer's household, or someone holds the face now — then it is that person's face,
		// shown through them to whoever sees them, and no longer anybody's to add.
		if (media.householdId !== viewer.householdId) return { ok: false, refusal: 'notVisible' };
		const held = await deps.links.holdersOf(viewer, [media.personId]);
		return held.size > 0 ? { ok: false, refusal: 'notVisible' } : { ok: true, media };
	}
	if (!(await deps.contacts.findByIdVisibleTo(viewer, media.contactId)))
		return { ok: false, refusal: 'notVisible' };
	if (media.kind === 'face') return { ok: true, media };

	const { together } = media;
	if (together && !(await deps.contacts.findByIdVisibleTo(viewer, together.contactId))) {
		return { ok: false, refusal: 'notVisible' };
	}
	const link = await deps.links.findForContactVisibleTo(viewer, media.contactId);
	if (link?.immichPersonId !== media.personId) return { ok: false, refusal: 'notLinked' };
	// A photo of two people together is theirs only while both links hold (concept §4.3).
	if (together) {
		const otherLink = await deps.links.findForContactVisibleTo(viewer, together.contactId);
		if (otherLink?.immichPersonId !== together.personId) return { ok: false, refusal: 'notLinked' };
	}
	return { ok: true, media };
}

function served(
	outcome: { ok: true; value: ImmichImage } | { ok: false; failure: ImmichFailure }
): ImmichMediaOutcome {
	return outcome.ok ? { ok: true, image: outcome.value } : { ok: false, refusal: outcome.failure };
}
