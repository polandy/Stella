/*
 * What Stella asks of the household's Nextcloud address book (docs/02 §2.16.3, docs/04 §4.5).
 * Stella is a CardDAV *client* of it, never a server. The port is narrow and owned here;
 * `src/lib/server/nextcloud/http-gateway.ts` implements it over WebDAV and `fake-gateway.ts` in
 * memory. A card's text is another program's: it is read by the vCard reader, which refuses
 * what it cannot read.
 */

/** One card as the book holds it. */
export interface RemoteCard {
	/** Its path, absolute on the server (`/remote.php/dav/addressbooks/…/abc.vcf`). */
	href: string;
	/** Changes with every write; a write names it, so one made meanwhile is never overwritten. */
	etag: string;
	vcard: string;
}

/** What changed since a sync token (RFC 6578 `sync-collection`). */
export interface BookChanges {
	/** Where this answer stopped, for the next one. */
	token: string;
	/** Cards new or changed since; every card when `complete`. */
	changed: RemoteCard[];
	/** Paths of cards deleted since. */
	deleted: string[];
	/**
	 * The whole book, not a difference: there was no token, or the server no longer knew it.
	 * A card Stella holds that is not among `changed` is then gone.
	 */
	complete: boolean;
}

/** A write found the card changed meanwhile (`412`); the next sync reads it first. */
export type PutOutcome = { etag: string } | 'stale' | 'gone';

/** The address book, as the sync needs it. */
export interface AddressBookGateway {
	/** Changes since `token`, or the whole book when `token` is null or no longer known. */
	changesSince(token: string | null): Promise<BookChanges>;
	/** Replace a card, only if it is still at `etag`. */
	put(href: string, vcard: string, etag: string): Promise<PutOutcome>;
}

/** The book could not be reached, or answered something that is not CardDAV. */
export class AddressBookUnreachableError extends Error {
	constructor(reason: string) {
		super(`Nextcloud address book unreachable: ${reason}`);
		this.name = 'AddressBookUnreachableError';
	}
}
