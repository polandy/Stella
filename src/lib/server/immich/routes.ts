import { isWholeDay } from '../../dates/calendar';
import type { MessageKey } from '../../i18n/translate';
import type { GlimpseScope } from '../../immich/strip';
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
import { readLibraryDay, searchLibrary, type ImmichLibraryDeps } from '../domain/immich/library';
import { findImmichFaces, type ImmichLinkDeps } from '../domain/immich/links';
import { findLikelyMatchFor, type PersonMatchDeps } from '../domain/immich/person-match';
import type { ImmichMediaSigner } from '../domain/immich/signed-media';

/*
 * What the Immich routes answer (docs/02 §2.24.3, §2.24.4), decided here so
 * it can be tested without a server; `src/routes/media/immich/[token]` and
 * `src/routes/(app)/contacts/[id]/immich/{faces,match,photos}` only wire the services and say a
 * refusal in the reader's language.
 *
 * Every image from Immich — a face in the picker, a photo in the strip or the viewer — comes
 * through one proxy, and only for a token Stella signed after the access layer let the viewer
 * see the contact (docs/04 ADR-097). Nothing from it is kept: not by the browser, not by the
 * service worker (docs/04 ADR-099).
 */

/**
 * Nothing from Immich is kept on a device (docs/04 ADR-099): Immich owns the photos and may delete,
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

/** The strip's `?with=` and `?of=`, as the request names them; at most one may be given. */
export interface GlimpseQuery {
	with: string | null;
	of: string | null;
}

const OWN_PHOTOS: GlimpseQuery = { with: null, of: null };

/** Whose photos a query asks for, or `invalid` for one that asks two questions at once. */
function glimpseScope(query: GlimpseQuery): GlimpseScope | 'invalid' {
	if (query.with !== null && query.of !== null) return 'invalid';
	if (query.with !== null) return { with: query.with };
	if (query.of !== null) return { of: query.of };
	return null;
}

/**
 * `GET /contacts/{id}/immich/photos?cursor=&with=&of=`: a page of the strip under a linked
 * person's gallery, with signed URLs — with `with`, of the photos they are in together with that
 * other person (docs/02 §2.24.8); with `of`, of that other, linked person's own photos, listed
 * for this person's page so one can become their picture (§2.24.2). Only for people the member
 * can see and who are linked as the case needs; a failure in Immich is said in the body — the
 * strip then quietly is not there — rather than failing the request.
 */
export async function answerGlimpse(
	deps: ImmichGlimpseDeps | null,
	viewer: Viewer | null,
	contactId: string,
	cursor: string | null,
	query: GlimpseQuery = OWN_PHOTOS
): Promise<Response | RouteRefusal> {
	if (!viewer) return NOT_SIGNED_IN;
	if (!deps) return NOT_FOUND;
	const scope = glimpseScope(query);
	if (scope === 'invalid') return NOT_FOUND;
	const glimpse = await readImmichGlimpse(deps, viewer, contactId, cursor, scope);
	if (!glimpse) return NOT_FOUND;
	return Response.json(glimpse, { headers: { 'Cache-Control': IMMICH_MEDIA_CACHE_CONTROL } });
}

/** The library picker's `?day=` and `?q=`: exactly one is given. */
export interface LibraryQuery {
	day: string | null;
	q: string | null;
}

/**
 * `GET /immich/library?day=` or `?q=`: a day of the whole library, or a search of it, for the
 * picker beside a photo upload (docs/02 §2.24.9) — for any member, every photo signed for their
 * household. A failure in Immich is said in the body; the picker shows it.
 */
export async function answerLibrary(
	deps: ImmichLibraryDeps | null,
	viewer: Viewer | null,
	query: LibraryQuery
): Promise<Response | RouteRefusal> {
	if (!viewer) return NOT_SIGNED_IN;
	if (!deps) return NOT_FOUND;
	if ((query.day === null) === (query.q === null)) return NOT_FOUND;
	if (query.day !== null && !isWholeDay(query.day)) return NOT_FOUND;
	const view =
		query.day !== null
			? await readLibraryDay(deps, viewer, query.day)
			: await searchLibrary(deps, viewer, query.q ?? '');
	return Response.json(view, { headers: { 'Cache-Control': IMMICH_MEDIA_CACHE_CONTROL } });
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

/**
 * `GET /contacts/{id}/immich/match`: the face the Photos card suggests for an unlinked person —
 * the one *Find your people* would link in one tap (docs/02 §2.24.7) — or `null`. Only for a
 * person the member can see. Immich not answering is no suggestion rather than an error: the
 * card simply offers nothing, and *Find in Immich* says what is wrong when asked.
 */
export async function answerMatchHint(
	deps: PersonMatchDeps | null,
	viewer: Viewer | null,
	contactId: string
): Promise<Response | RouteRefusal> {
	if (!viewer) return NOT_SIGNED_IN;
	if (!deps) return NOT_FOUND;
	const outcome = await findLikelyMatchFor(deps, viewer, contactId);
	if (outcome.kind === 'notVisible') return { status: 404, message: 'errors.contact.notFound' };
	const match = outcome.kind === 'answered' ? outcome.match : null;
	return Response.json({ match }, { headers: { 'Cache-Control': IMMICH_MEDIA_CACHE_CONTROL } });
}
