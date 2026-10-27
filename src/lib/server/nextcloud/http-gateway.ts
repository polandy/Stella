import {
	AddressBookUnreachableError,
	type AddressBookGateway,
	type BookChanges,
	type RemoteCard
} from '../domain/nextcloud/address-book';
import { readCapped } from '../http/read-capped';

/*
 * The Nextcloud adapter (docs/04 §4.5): one CardDAV address book over WebDAV, as a client —
 * `sync-collection` (RFC 6578) for what changed, `addressbook-multiget` (RFC 6352) for the
 * cards themselves, and `PUT` with `If-Match` for a write that never overwrites a newer card.
 * The only file that knows the protocol. The app password goes in a Basic header and nowhere
 * else, never into a log line or an error.
 */

/** How long a sync waits for Nextcloud; it runs beside a page load, never in front of one. */
const TIMEOUT_MS = 15_000;

/** Most bytes read from one answer: a family's book with photos is a few megabytes. */
const MAX_BYTES = 32 * 1024 * 1024;

/** Cards fetched per multiget, so a first sync of a large book is a handful of requests. */
const MULTIGET_BATCH = 100;

export interface HttpAddressBookOptions {
	/** The address book's collection, ending in a slash (`NEXTCLOUD_ADDRESS_BOOK_URL`). */
	url: string;
	user: string;
	appPassword: string;
	/** Overridable for tests; defaults to the platform's `fetch`. */
	fetch?: typeof globalThis.fetch;
	log?: (message: string) => void;
}

const xmlEscape = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Undo XML's escapes — the five named ones and numeric references — or take a CDATA as is. */
function xmlText(raw: string): string {
	const cdata = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/.exec(raw);
	if (cdata) return cdata[1]!;
	return raw.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
		const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
		if (entity[0] !== '#') return named[entity.toLowerCase()]!;
		const hex = entity[1] === 'x' || entity[1] === 'X';
		return String.fromCodePoint(parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
	});
}

/** The elements of one local name, whatever prefix the server gave its namespace. */
function elements(xml: string, name: string): string[] {
	const pattern = new RegExp(
		`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>)`,
		'g'
	);
	return [...xml.matchAll(pattern)].map((m) => m[1] ?? '');
}

const first = (xml: string, name: string): string | null => elements(xml, name)[0] ?? null;

interface Entry {
	href: string;
	/** The response's own status, or its propstat's when it has none. */
	status: number;
	etag: string | null;
	vcard: string | null;
}

/** A `207 Multi-Status` body as its responses. */
function readMultistatus(xml: string): { entries: Entry[]; token: string | null } {
	const entries = elements(xml, 'response').map((response): Entry => {
		const statusLine =
			first(response.replace(/<(?:[\w-]+:)?propstat[\s\S]*?propstat>/g, ''), 'status') ??
			first(response, 'status') ??
			'';
		const etag = first(response, 'getetag');
		const data = first(response, 'address-data');
		return {
			href: xmlText(first(response, 'href') ?? '').trim(),
			status: Number(/\s(\d{3})\s?/.exec(statusLine)?.[1] ?? 0),
			etag: etag ? xmlText(etag).trim() : null,
			vcard: data ? xmlText(data) : null
		};
	});
	const token = first(xml, 'sync-token');
	return { entries, token: token === null ? null : xmlText(token).trim() };
}

const syncBody = (token: string | null) =>
	`<?xml version="1.0" encoding="utf-8"?>` +
	`<d:sync-collection xmlns:d="DAV:"><d:sync-token>${xmlEscape(token ?? '')}</d:sync-token>` +
	`<d:sync-level>1</d:sync-level><d:prop><d:getetag/></d:prop></d:sync-collection>`;

const multigetBody = (hrefs: string[]) =>
	`<?xml version="1.0" encoding="utf-8"?>` +
	`<card:addressbook-multiget xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">` +
	`<d:prop><d:getetag/><card:address-data/></d:prop>` +
	hrefs.map((h) => `<d:href>${xmlEscape(h)}</d:href>`).join('') +
	`</card:addressbook-multiget>`;

export function createHttpAddressBookGateway({
	url,
	user,
	appPassword,
	fetch = globalThis.fetch,
	log = (message) => console.warn(message)
}: HttpAddressBookOptions): AddressBookGateway {
	const authorization = `Basic ${btoa(`${user}:${appPassword}`)}`;
	const collectionPath = new URL(url).pathname;

	async function request(
		method: string,
		target: string,
		init: { body: string; headers: Record<string, string> }
	): Promise<{ status: number; text: string; etag: string | null }> {
		try {
			const response = await fetch(target, {
				method,
				body: init.body,
				headers: { authorization, ...init.headers },
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});
			const text = new TextDecoder().decode(await readCapped(response, MAX_BYTES));
			return { status: response.status, text, etag: response.headers.get('etag') };
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			log(`Nextcloud ${method} failed: ${reason}`);
			throw new AddressBookUnreachableError(reason);
		}
	}

	const report = (body: string, depth: '0' | '1') =>
		request('REPORT', url, {
			body,
			headers: { depth, 'content-type': 'application/xml; charset=utf-8' }
		});

	function refused(what: string, status: number): never {
		log(`Nextcloud ${what} answered ${status}`);
		throw new AddressBookUnreachableError(`${what} answered ${status}`);
	}

	async function sync(token: string | null): Promise<BookChanges> {
		const answer = await report(syncBody(token), '0');
		// A token the server no longer keeps is refused with `valid-sync-token` (RFC 6578 §3.2).
		if (token !== null && (answer.status === 403 || answer.status === 409)) return sync(null);
		if (answer.status !== 207) refused('sync-collection', answer.status);
		const { entries, token: next } = readMultistatus(answer.text);
		if (next === null) refused('sync-collection without a token', answer.status);

		const own = (e: Entry) => e.href.replace(/\/?$/, '/') === collectionPath;
		const deleted = entries.filter((e) => !own(e) && e.status === 404).map((e) => e.href);
		const hrefs = entries.filter((e) => !own(e) && e.status === 200).map((e) => e.href);
		const changed: RemoteCard[] = [];
		for (let i = 0; i < hrefs.length; i += MULTIGET_BATCH) {
			const got = await report(multigetBody(hrefs.slice(i, i + MULTIGET_BATCH)), '1');
			if (got.status !== 207) refused('addressbook-multiget', got.status);
			for (const e of readMultistatus(got.text).entries) {
				// A card deleted between the two requests is simply not there; the next sync says so.
				if (e.status === 200 && e.etag !== null && e.vcard !== null) {
					changed.push({ href: e.href, etag: e.etag, vcard: e.vcard });
				}
			}
		}
		return { token: next, changed, deleted, complete: token === null };
	}

	return {
		changesSince: sync,

		async put(href, vcard, etag) {
			const answer = await request('PUT', new URL(href, url).href, {
				body: vcard,
				headers: { 'if-match': etag, 'content-type': 'text/vcard; charset=utf-8' }
			});
			if (answer.status === 412) return 'stale';
			if (answer.status === 404) return 'gone';
			if (answer.status < 200 || answer.status >= 300) refused('PUT', answer.status);
			// Without an ETag the next sync reports the card as changed and reads it again.
			return { etag: answer.etag ?? '' };
		}
	};
}
