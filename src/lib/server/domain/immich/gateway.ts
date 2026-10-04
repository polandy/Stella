/*
 * What Stella asks of Immich, and how Immich's answers are read (docs/concepts/immich.md §2,
 * §6). The port is narrow and owned here; `src/lib/server/immich/http-gateway.ts` implements it
 * over HTTP and `fake-gateway.ts` in memory. Every answer is untrusted — another program wrote
 * it — so it is read by a pure parser below and anything that is not what it claims is refused.
 */

/** A server version, as `GET /api/server/version` reports it. */
export interface ImmichVersion {
	major: number;
	minor: number;
	patch: number;
}

/** The Immich account the API key belongs to (`GET /api/users/me`). */
export interface ImmichOwner {
	name: string;
	email: string;
}

/** A person in the key owner's library — a face Immich grouped, and maybe named. */
export interface ImmichPerson {
	id: string;
	/** Empty when nobody has named the face yet. */
	name: string;
	/** Hidden in Immich: never offered by Stella (concept §5). */
	hidden: boolean;
}

/** One page of `GET /api/people`. */
export interface ImmichPeoplePage {
	people: ImmichPerson[];
	hasNextPage: boolean;
}

/** How many photos a person is in (`GET /api/people/{id}/statistics`). */
export interface ImmichStatistics {
	assets: number;
}

/** An image Immich sent, read whole: a face thumbnail is a few kilobytes. */
export interface ImmichImage {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
}

/**
 * Why a call did not answer. The three statuses Immich uses for a key that cannot do what was
 * asked are outcomes, not exceptions — Settings has a sentence for each (concept §4.1):
 * - `unauthorized`: the key was refused outright (revoked, or mistyped) — 401;
 * - `forbidden`: the key is valid but lacks the scope this call needs — 403;
 * - `notFound`: the person asked for is not (any more) in the library;
 * - `unreachable`: no usable answer at all — down, timed out, a 5xx, or a body we cannot read.
 */
export type ImmichFailure = 'unauthorized' | 'forbidden' | 'notFound' | 'unreachable';

/** A call's answer, or the reason there is none. */
export type ImmichOutcome<T> = { ok: true; value: T } | { ok: false; failure: ImmichFailure };

/** The calls slice 1 needs (concept §8.1). Implemented at the edge; faked in tests. Never throws. */
export interface ImmichGateway {
	/** The server's version; needs no scope. */
	version(): Promise<ImmichOutcome<ImmichVersion>>;
	/** Whose library the key reads (`user.read`). */
	owner(): Promise<ImmichOutcome<ImmichOwner>>;
	/** A page of the library's people, 1-based (`person.read`). */
	listPeople(page: number, size: number): Promise<ImmichOutcome<ImmichPeoplePage>>;
	/** The people whose name matches (`person.read`). */
	searchPeople(name: string): Promise<ImmichOutcome<ImmichPerson[]>>;
	/** One person by id (`person.read`). */
	person(id: string): Promise<ImmichOutcome<ImmichPerson>>;
	/** How many photos one person is in (`person.statistics`). */
	personStatistics(id: string): Promise<ImmichOutcome<ImmichStatistics>>;
	/** One person's face (`person.read`). */
	personThumbnail(id: string): Promise<ImmichOutcome<ImmichImage>>;
}

/**
 * The image types a face may be passed on as. SVG is not among them: it can carry script, and
 * these bytes are served from Stella's own origin.
 */
const SERVABLE_IMAGE_TYPES: ReadonlySet<string> = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/gif'
]);

/** Whether an image Immich sent may be served from Stella's origin as it is. */
export function isServableImageType(contentType: string): boolean {
	return SERVABLE_IMAGE_TYPES.has(contentType);
}

/** The read scopes the key needs in slice 1, named as Immich names them (concept §2). */
export type ImmichScope = 'user.read' | 'person.read' | 'person.statistics';

type Payload = Record<string, unknown>;

const objectOf = (value: unknown): Payload | null =>
	typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Payload) : null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value is an Immich id. Ids travel into URL paths — Immich's and Stella's own
 * thumbnail route — so anything but a UUID is refused rather than escaped: a `..` must never
 * reach `/api/people/{id}`.
 */
export function isImmichId(value: unknown): value is string {
	return typeof value === 'string' && UUID.test(value);
}

const count = (value: unknown): number | null =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

/** The server version, or null when the body is not one. */
export function readVersion(payload: unknown): ImmichVersion | null {
	const body = objectOf(payload);
	if (!body) return null;
	const [major, minor, patch] = [count(body.major), count(body.minor), count(body.patch)];
	if (major === null || minor === null || patch === null) return null;
	return { major, minor, patch };
}

/** The key's owner, or null without an email — the email is how Stella recognises them. */
export function readOwner(payload: unknown): ImmichOwner | null {
	const body = objectOf(payload);
	if (!body || typeof body.email !== 'string' || body.email === '') return null;
	return { name: typeof body.name === 'string' ? body.name : '', email: body.email };
}

/** One person, or null when the id is not an Immich id. */
export function readPerson(payload: unknown): ImmichPerson | null {
	const body = objectOf(payload);
	if (!body || !isImmichId(body.id)) return null;
	return {
		id: body.id,
		name: typeof body.name === 'string' ? body.name.trim() : '',
		hidden: body.isHidden === true
	};
}

/** The people of a search answer (a bare list); unreadable entries are dropped. */
export function readPersonList(payload: unknown): ImmichPerson[] | null {
	if (!Array.isArray(payload)) return null;
	return payload.map(readPerson).filter((person): person is ImmichPerson => person !== null);
}

/** A page of the people listing, or null when the body is not one. */
export function readPeoplePage(payload: unknown): ImmichPeoplePage | null {
	const body = objectOf(payload);
	if (!body) return null;
	const people = readPersonList(body.people);
	if (!people) return null;
	return { people, hasNextPage: body.hasNextPage === true };
}

/** A person's photo count, or null when the body is not one. */
export function readStatistics(payload: unknown): ImmichStatistics | null {
	const body = objectOf(payload);
	const assets = body ? count(body.assets) : null;
	return assets === null ? null : { assets };
}
