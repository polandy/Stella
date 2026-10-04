import {
	isImmichId,
	readOwner,
	readPeoplePage,
	readPerson,
	readPersonList,
	readStatistics,
	readVersion,
	type ImmichFailure,
	type ImmichGateway,
	type ImmichImage,
	type ImmichOutcome
} from '../domain/immich/gateway';
import { readCapped } from '../http/read-capped';

/*
 * The Immich adapter (docs/concepts/immich.md §6): Immich's REST API over `fetch`, with the
 * household's key in the `x-api-key` header. The only file that knows Immich's paths; the
 * use-cases see the port.
 *
 * Nothing here throws. A refused key, a missing scope and a missing person are answers the
 * screens have sentences for; everything else — Immich down, slow, answering 5xx or with a body
 * that is not what it should be — is "unreachable", and logged here, at the one place that knows
 * what really happened. The key is never part of a log line.
 */

/** How long Stella waits for Immich. Short: a person page never waits on it, but a picker does. */
const TIMEOUT_MS = 5_000;

/** Most bytes read from a JSON answer — a 1000-person page is well under this. */
const MAX_JSON_BYTES = 2 * 1024 * 1024;

/** Most bytes read from a face thumbnail; Immich's are a few kilobytes. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * The image types a thumbnail may be passed on as. SVG is not among them: it can carry script,
 * and these bytes are served from Stella's own origin.
 */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

export interface HttpImmichGatewayOptions {
	/** How the server reaches Immich (`IMMICH_URL`), without a trailing slash. */
	baseUrl: string;
	apiKey: string;
	/** Overridable for tests; defaults to the platform's `fetch`. */
	fetch?: typeof globalThis.fetch;
	/** Where a failure is reported; defaults to the server log. */
	log?: (message: string) => void;
}

const failed = (failure: ImmichFailure): { ok: false; failure: ImmichFailure } => ({ ok: false, failure });

export function createHttpImmichGateway({
	baseUrl,
	apiKey,
	fetch = globalThis.fetch,
	log = (message) => console.warn(message)
}: HttpImmichGatewayOptions): ImmichGateway {
	/**
	 * One request, with its non-answers mapped. `byId` marks a call about one person: Immich's
	 * access check answers an id it no longer has with 400, which means "not found" there.
	 */
	async function ask<T>(
		path: string,
		read: (response: Response) => Promise<T | null>,
		byId = false
	): Promise<ImmichOutcome<T>> {
		try {
			const response = await fetch(`${baseUrl}${path}`, {
				headers: { 'x-api-key': apiKey, accept: 'application/json' },
				// A redirect is never Immich's answer to an API call: it is a gateway in front of it
				// sending Stella to a login page. Seen as such, rather than followed to that page.
				redirect: 'manual',
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});
			if (response.status === 401) return failed('unauthorized');
			if (response.status === 403) return failed('forbidden');
			if (response.status === 404 || (byId && response.status === 400)) return failed('notFound');
			if (response.status >= 300 && response.status < 400) {
				log(
					`[immich] ${path.split('?')[0]} was redirected (${response.status}); a forward-auth gateway in front of IMMICH_URL must let /api through`
				);
				return failed('unreachable');
			}
			if (!response.ok) {
				log(`[immich] ${path.split('?')[0]} answered ${response.status}`);
				return failed('unreachable');
			}
			const value = await read(response);
			if (value === null) {
				log(`[immich] ${path.split('?')[0]} answered with something Stella cannot read`);
				return failed('unreachable');
			}
			return { ok: true, value };
		} catch (error) {
			const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
			log(`[immich] ${path.split('?')[0]} could not be reached (${reason})`);
			return failed('unreachable');
		}
	}

	/** A JSON answer read through one of the domain's parsers. */
	const json =
		<T>(parse: (payload: unknown) => T | null) =>
		async (response: Response): Promise<T | null> => {
			const text = new TextDecoder().decode(await readCapped(response, MAX_JSON_BYTES));
			try {
				return parse(JSON.parse(text));
			} catch {
				return null; // Not JSON at all — a login page, say: reported as unreadable.
			}
		};

	async function image(response: Response): Promise<ImmichImage | null> {
		const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
		if (!IMAGE_TYPES.has(contentType)) return null;
		return { bytes: await readCapped(response, MAX_IMAGE_BYTES), contentType };
	}

	/** A call about one person; an id that is not Immich's never leaves Stella. */
	function aboutPerson<T>(id: string, suffix: string, read: (response: Response) => Promise<T | null>) {
		if (!isImmichId(id)) return Promise.resolve(failed('notFound'));
		return ask(`/api/people/${id}${suffix}`, read, true);
	}

	return {
		version: () => ask('/api/server/version', json(readVersion)),
		owner: () => ask('/api/users/me', json(readOwner)),
		listPeople: (page, size) =>
			ask(`/api/people?${new URLSearchParams({ page: String(page), size: String(size), withHidden: 'false' })}`, json(readPeoplePage)),
		searchPeople: (name) =>
			ask(`/api/search/person?${new URLSearchParams({ name, withHidden: 'false' })}`, json(readPersonList)),
		person: (id) => aboutPerson(id, '', json(readPerson)),
		personStatistics: (id) => aboutPerson(id, '/statistics', json(readStatistics)),
		personThumbnail: (id) => aboutPerson(id, '/thumbnail', image)
	};
}
