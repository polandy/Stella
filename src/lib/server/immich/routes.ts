import type { MessageKey } from '../../i18n/translate';
import type { Viewer } from '../access/visibility';
import { isServableImageType, type ImmichFailure } from '../domain/immich/gateway';
import {
	faceUrlFor,
	openImmichMedia,
	readImmichGlimpse,
	type ImmichGlimpseDeps,
	type ImmichMediaDeps,
	type ImmichMediaRefusal
} from '../domain/immich/glimpse';
import { findImmichFaces, type ImmichLinkDeps } from '../domain/immich/links';
import type { ImmichMediaSigner } from '../domain/immich/signed-media';

/*
 * What the Immich routes answer (docs/concepts/immich.md §5, §6, docs/02 §2.24), decided here so
 * it can be tested without a server; `src/routes/media/immich/[token]` and
 * `src/routes/(app)/contacts/[id]/immich/{faces,photos}` only wire the services and say a
 * refusal in the reader's language.
 *
 * Every image from Immich — a face in the picker, a photo in the strip or the viewer — comes
 * through one proxy, and only for a token Stella signed after the access layer let the viewer
 * see the contact (concept §9.10). Nothing from it is kept: not by the browser, not by the
 * service worker (concept §4.5).
 */

/**
 * Nothing from Immich is kept on a device (concept §4.5): Immich owns the photos and may delete,
 * archive or lock one away at any moment, and a signed URL is only ever meant for the page that
 * received it.
 */
export const IMMICH_MEDIA_CACHE_CONTROL = 'private, no-store';

/** A request turned away: the status, and what to say, still as a message key. */
export interface RouteRefusal {
	status: 401 | 404 | 502;
	message: MessageKey;
}

const NOT_SIGNED_IN: RouteRefusal = { status: 401, message: 'errors.notSignedIn' };
const NOT_FOUND: RouteRefusal = { status: 404, message: 'errors.notFound' };
const IMMICH_FAILED: RouteRefusal = { status: 502, message: 'errors.notFound' };

/**
 * A refusal says as little as it can: a bad token, an expired one, a person out of reach and a
 * photo Immich no longer has all read as "not found", so the proxy cannot be used to learn which.
 */
const MEDIA_REFUSAL: Record<ImmichMediaRefusal, RouteRefusal> = {
	invalid: NOT_FOUND,
	expired: NOT_FOUND,
	notVisible: NOT_FOUND,
	notLinked: NOT_FOUND,
	notFound: NOT_FOUND,
	unauthorized: IMMICH_FAILED,
	forbidden: IMMICH_FAILED,
	unreachable: IMMICH_FAILED
};

/** `GET /media/immich/{token}`: the one image a signed token names, through Stella. */
export async function answerImmichMedia(
	deps: ImmichMediaDeps | null,
	viewer: Viewer | null,
	token: string
): Promise<Response | RouteRefusal> {
	if (!viewer) return NOT_SIGNED_IN;
	if (!deps) return NOT_FOUND;

	const outcome = await openImmichMedia(deps, viewer, token);
	if (!outcome.ok) return MEDIA_REFUSAL[outcome.refusal];
	// Checked again here, whatever adapter is wired: these bytes are served from Stella's origin.
	if (!isServableImageType(outcome.image.contentType)) return IMMICH_FAILED;

	return new Response(outcome.image.bytes, {
		headers: {
			'Content-Type': outcome.image.contentType,
			'Content-Length': String(outcome.image.bytes.byteLength),
			'Cache-Control': IMMICH_MEDIA_CACHE_CONTROL,
			// The type is the one checked above; the browser must not guess another.
			'X-Content-Type-Options': 'nosniff'
		}
	});
}

/**
 * `GET /contacts/{id}/immich/photos?cursor=&with=`: a page of the strip under a linked person's
 * gallery, with signed URLs — with `with`, of the photos they are in together with that other
 * person (concept §4.3). Only for people the member can see and who are linked; a failure in
 * Immich is said in the body — the strip then quietly is not there — rather than failing the
 * request.
 */
export async function answerGlimpse(
	deps: ImmichGlimpseDeps | null,
	viewer: Viewer | null,
	contactId: string,
	cursor: string | null,
	togetherWith: string | null = null
): Promise<Response | RouteRefusal> {
	if (!viewer) return NOT_SIGNED_IN;
	if (!deps) return NOT_FOUND;
	const glimpse = await readImmichGlimpse(deps, viewer, contactId, cursor, togetherWith);
	if (!glimpse) return NOT_FOUND;
	return Response.json(glimpse, { headers: { 'Cache-Control': IMMICH_MEDIA_CACHE_CONTROL } });
}

/** What the picker says when Immich did not give it faces. */
const FAILURE_MESSAGE: Record<ImmichFailure, MessageKey> = {
	unauthorized: 'immich.error.keyRejected',
	forbidden: 'immich.settings.scope.person.read',
	notFound: 'immich.error.unreachable',
	unreachable: 'immich.error.unreachable'
};

export interface FaceSearchDeps {
	/** Immich, the links and the signer for the faces' URLs, or null when this instance has no Immich. */
	immich: (Pick<ImmichLinkDeps, 'gateway' | 'links'> & { signer: ImmichMediaSigner }) | null;
	/** Whether the member may see the person the picker is for. */
	isContactVisible(viewer: Viewer, contactId: string): Promise<boolean>;
	/** A message in the reader's language. */
	say(key: MessageKey): string;
}

/**
 * `GET /contacts/{id}/immich/faces?q=`: the faces *Find in Immich* offers, each marked when it
 * is already another person's, each with a URL signed for this person's picker. Only for a person the member can see, so the picker is never a
 * way to probe the library from a page the member could not open. A failure in Immich is said
 * in the body — the picker shows it — rather than failing the request.
 */
export async function answerFaceSearch(
	deps: FaceSearchDeps,
	viewer: Viewer | null,
	contactId: string,
	query: string
): Promise<Response | RouteRefusal> {
	if (!viewer) return NOT_SIGNED_IN;
	if (!deps.immich) return NOT_FOUND;
	if (!(await deps.isContactVisible(viewer, contactId)))
		return { status: 404, message: 'errors.contact.notFound' };

	const found = await findImmichFaces(deps.immich, viewer, query);
	if (!found.ok)
		return Response.json({ faces: [], error: deps.say(FAILURE_MESSAGE[found.failure]) });
	const { signer } = deps.immich;
	const faces = await Promise.all(
		found.faces.map(async (face) => ({
			...face,
			faceUrl: await faceUrlFor(signer, contactId, face.id)
		}))
	);
	return Response.json({ faces, error: null });
}
