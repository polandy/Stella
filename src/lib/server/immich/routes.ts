import type { MessageKey } from '../../i18n/translate';
import type { Viewer } from '../access/visibility';
import { isImmichId, isServableImageType, type ImmichFailure, type ImmichGateway } from '../domain/immich/gateway';
import { findImmichFaces, type ImmichLinkDeps } from '../domain/immich/links';

/*
 * What the two Immich routes answer (docs/concepts/immich.md §6, docs/02 §2.24.4), decided here
 * so it can be tested without a server; `src/routes/media/immich/people/[personId]/thumbnail`
 * and `src/routes/(app)/contacts/[id]/immich/faces` only wire the services and say a refusal
 * in the reader's language.
 *
 * Both are open to every signed-in member (docs/concepts/immich.md §9.9): the picker shows every member the
 * library's named faces, so a face thumbnail is served unsigned until slice 2 brings the signed
 * proxy for photos. What keeps that narrow is the shape: one Immich id, one face, nothing else.
 */

/** A face may change in Immich — renamed, merged, deleted — so a day, privately, never `immutable`. */
export const FACE_CACHE_CONTROL = 'private, max-age=86400';

/** A request turned away: the status, and what to say, still as a message key. */
export interface RouteRefusal {
	status: 401 | 404 | 502;
	message: MessageKey;
}

const NOT_SIGNED_IN: RouteRefusal = { status: 401, message: 'errors.notSignedIn' };
const NOT_FOUND: RouteRefusal = { status: 404, message: 'errors.notFound' };

/** `GET /media/immich/people/{id}/thumbnail`: one face, through Stella. */
export async function answerFaceThumbnail(
	immich: { gateway: Pick<ImmichGateway, 'personThumbnail'> } | null,
	viewer: Viewer | null,
	personId: string
): Promise<Response | RouteRefusal> {
	if (!viewer) return NOT_SIGNED_IN;
	if (!immich || !isImmichId(personId)) return NOT_FOUND;

	const face = await immich.gateway.personThumbnail(personId);
	if (!face.ok) return face.failure === 'notFound' ? NOT_FOUND : { status: 502, message: 'errors.notFound' };
	// Checked again here, whatever adapter is wired: these bytes are served from Stella's origin.
	if (!isServableImageType(face.value.contentType)) return { status: 502, message: 'errors.notFound' };

	return new Response(face.value.bytes, {
		headers: {
			'Content-Type': face.value.contentType,
			'Content-Length': String(face.value.bytes.byteLength),
			'Cache-Control': FACE_CACHE_CONTROL,
			// The type is the one checked above; the browser must not guess another.
			'X-Content-Type-Options': 'nosniff'
		}
	});
}

/** What the picker says when Immich did not give it faces. */
const FAILURE_MESSAGE: Record<ImmichFailure, MessageKey> = {
	unauthorized: 'immich.error.keyRejected',
	forbidden: 'immich.settings.scope.person.read',
	notFound: 'immich.error.unreachable',
	unreachable: 'immich.error.unreachable'
};

export interface FaceSearchDeps {
	/** Immich and the links, or null when this instance has no Immich. */
	immich: Pick<ImmichLinkDeps, 'gateway' | 'links'> | null;
	/** Whether the member may see the person the picker is for. */
	isContactVisible(viewer: Viewer, contactId: string): Promise<boolean>;
	/** A message in the reader's language. */
	say(key: MessageKey): string;
}

/**
 * `GET /contacts/{id}/immich/faces?q=`: the faces *Find in Immich* offers, each marked when it
 * is already another person's. Only for a person the member can see, so the picker is never a
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
	if (!(await deps.isContactVisible(viewer, contactId))) return { status: 404, message: 'errors.contact.notFound' };

	const found = await findImmichFaces(deps.immich, viewer, query);
	return Response.json(
		found.ok ? { faces: found.faces, error: null } : { faces: [], error: deps.say(FAILURE_MESSAGE[found.failure]) }
	);
}
