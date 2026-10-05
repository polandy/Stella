import type { Clock } from '../../clock';
import { isTakenAt } from '../../../image/taken-at';
import { isImmichId, type ImmichImageSize } from './gateway';

/*
 * The signature on every Immich image URL Stella hands out (docs/concepts/immich.md §5, §9.10).
 * The proxy never takes a bare Immich id: it takes a token Stella issued after the access layer
 * let the viewer see a contact, naming that contact, the Immich person and — for a photo — the
 * asset and its size, with an expiry. Guessing ids, or reusing ones seen elsewhere, gets nothing.
 *
 * A token is `payload.mac`: the payload is the signed fields as JSON in base64url, the MAC an
 * HMAC-SHA256 over it with the server's secret (`SESSION_SECRET`). The proxy still checks the
 * viewer and the link on every request; the signature is what keeps the request to something
 * Stella itself chose to show.
 */

/** What a token may name. */
export type SignableImmichMedia =
	| {
			/** A photo of a linked contact, from their Immich person's latest. */
			kind: 'photo';
			contactId: string;
			/** The Immich person the contact was linked to when the token was issued. */
			personId: string;
			assetId: string;
			size: ImmichImageSize;
			/**
			 * When Immich says it was taken, signed into a preview so *Use as photo* dates the copy
			 * by what Immich said rather than by what a browser sends (concept §4.3). Absent when
			 * Immich does not say, and on a thumbnail, where nothing reads it.
			 */
			takenAt?: string;
			/**
			 * For a photo of two people together (concept §4.3, *You and Julia*): the other person
			 * and the Immich person they were linked to when the photo was listed. The photo is then
			 * served only while the viewer sees both and both links still hold.
			 */
			together?: ImmichCompanion;
	  }
	| {
			/** A face the picker offers while linking `contactId`. */
			kind: 'face';
			contactId: string;
			personId: string;
	  };

/** The second person of a together photo. */
export interface ImmichCompanion {
	contactId: string;
	personId: string;
}

/** What a token names, and until when it does. */
export type SignedImmichMedia = SignableImmichMedia & { expiresAt: number };

export type VerifiedImmichMedia =
	{ ok: true; media: SignedImmichMedia } | { ok: false; reason: 'invalid' | 'expired' };

export interface ImmichMediaSigner {
	/** A token for `media`, valid for `IMMICH_MEDIA_TTL_MS` from now. */
	sign(media: SignableImmichMedia): Promise<string>;
	/** What the token was signed for, or why it is refused. Never throws. */
	verify(token: string): Promise<VerifiedImmichMedia>;
}

/**
 * How long a token works: a day, as concept §5 set it. The proxy answers `no-store`, so a URL is
 * only ever used by the page that received it; the expiry bounds a page left open, and a URL
 * that escaped the page, not a cache.
 */
export const IMMICH_MEDIA_TTL_MS = 24 * 60 * 60 * 1000;

/** Longer than any token Stella issues; anything longer is refused before it is decoded. */
const MAX_TOKEN_LENGTH = 1024;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Separates this use of the secret from any other it may be put to (sessions, later). */
const PURPOSE = 'stella.immich-media.v1.';

const IMAGE_SIZES: ReadonlySet<string> = new Set<ImmichImageSize>(['thumbnail', 'preview']);

/**
 * A bound on the contact id's length, not on its shape: an imported contact keeps its source's id
 * (`monica:contact:3`), and the signature already vouches for whatever was signed. Whether the
 * contact exists, and is the viewer's to see, is the access layer's question.
 */
const MAX_CONTACT_ID_LENGTH = 128;

const isSignedContactId = (value: unknown): value is string =>
	typeof value === 'string' && value.length > 0 && value.length <= MAX_CONTACT_ID_LENGTH;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

/** The signed fields, or null when the decoded payload is not exactly a token's. */
function readPayload(payload: string): SignedImmichMedia | null {
	let body: unknown;
	try {
		body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
	const { k, c, p, a, s, e, t, w, q } = body as Record<string, unknown>;
	if (!isSignedContactId(c) || !isImmichId(p)) return null;
	if (typeof e !== 'number' || !Number.isSafeInteger(e)) return null;
	if (k === 'f') return { kind: 'face', contactId: c, personId: p, expiresAt: e };
	if (k !== 'p' || !isImmichId(a) || typeof s !== 'string' || !IMAGE_SIZES.has(s)) return null;
	if (t !== undefined && (typeof t !== 'string' || !isTakenAt(t))) return null;
	if ((w !== undefined || q !== undefined) && (!isSignedContactId(w) || !isImmichId(q))) return null;
	return {
		kind: 'photo',
		contactId: c,
		personId: p,
		assetId: a,
		size: s as ImmichImageSize,
		...(t === undefined ? {} : { takenAt: t }),
		...(w === undefined ? {} : { together: { contactId: w as string, personId: q as string } }),
		expiresAt: e
	};
}

/** The payload's JSON: short keys, because it travels in every image URL. */
function writePayload(media: SignedImmichMedia): string {
	const fields =
		media.kind === 'face'
			? { k: 'f', c: media.contactId, p: media.personId, e: media.expiresAt }
			: {
					k: 'p',
					c: media.contactId,
					p: media.personId,
					a: media.assetId,
					s: media.size,
					t: media.takenAt,
					w: media.together?.contactId,
					q: media.together?.personId,
					e: media.expiresAt
				};
	return toBase64Url(encoder.encode(JSON.stringify(fields)));
}

export function createImmichMediaSigner({
	secret,
	clock
}: {
	secret: string;
	clock: Clock;
}): ImmichMediaSigner {
	// Imported once and reused; Web Crypto's verify compares in constant time.
	const key = crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
	const signed = (payload: string) => encoder.encode(PURPOSE + payload);

	return {
		async sign(media) {
			const payload = writePayload({ ...media, expiresAt: clock.now() + IMMICH_MEDIA_TTL_MS });
			const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await key, signed(payload)));
			return `${payload}.${toBase64Url(mac)}`;
		},

		async verify(token) {
			const invalid = { ok: false, reason: 'invalid' } as const;
			if (token.length > MAX_TOKEN_LENGTH) return invalid;
			const parts = token.split('.');
			if (parts.length !== 2 || !parts.every((part) => BASE64URL.test(part))) return invalid;
			const [payload, mac] = parts;

			const genuine = await crypto.subtle.verify(
				'HMAC',
				await key,
				Buffer.from(mac, 'base64url'),
				signed(payload)
			);
			if (!genuine) return invalid;
			const media = readPayload(payload);
			if (!media) return invalid;
			if (clock.now() >= media.expiresAt) return { ok: false, reason: 'expired' };
			return { ok: true, media };
		}
	};
}
