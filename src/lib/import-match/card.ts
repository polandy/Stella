import type { PartialDate } from '../dates/partial-date';
import type { ContactFieldKind } from '../people/contact-fields';

/*
 * The two sides of a matching review (docs/02 §2.16.2): a contact from
 * another address book, and a person already in Stella. Plain values, so the reader on the
 * server, the review step in the browser and the use-case all share them.
 */

/**
 * The address book a card came from: an exported file, read from the file itself (docs/02
 * §2.16), or the household's linked Nextcloud book (§2.16.3). Here, not beside the reader,
 * because the activity log and the review step name it too.
 */
export type ContactSource = VCardFileSource | NextcloudSource;

/** An exported file, by what it says it came from. */
export type VCardFileSource = 'vcard:google' | 'vcard:nextcloud' | 'vcard:other';

/** The household's linked Nextcloud address book, by the book's name. */
export type NextcloudSource = `nextcloud:${string}`;

export const isNextcloudSource = (source: ContactSource): source is NextcloudSource =>
	source.startsWith('nextcloud:');

/** A label every address book writes the same way; worded in the member's language on writing. */
export type KnownLabel = 'home' | 'work' | 'mobile';

/** A field's label: one of the shared ones, or the text someone typed (Google's `X-ABLabel`). */
export type CardLabel = { known: KnownLabel } | { typed: string };

/** One email, phone, address or website on a card. */
export interface CardField {
	value: string;
	label: CardLabel | null;
}

/**
 * Whether a card's picture can come in: `inline` is on the card itself, `link` only points at
 * one somewhere else (every Google export) and is never fetched.
 */
export type CardPhoto = 'inline' | 'link' | null;

/** A contact as another address book exported it. */
export interface IncomingCard {
	/** What the card is called from one export to the next (§1.4): its UID, or a stand-in. */
	key: string;
	/** A fingerprint of the whole card, so a re-run asks again only about a changed one. */
	hash: string;
	firstName: string | null;
	lastName: string | null;
	displayName: string;
	nickname: string | null;
	company: string | null;
	jobTitle: string | null;
	birthday: PartialDate | null;
	emails: CardField[];
	phones: CardField[];
	addresses: CardField[];
	urls: CardField[];
	/** The card's groups, without an address book's own (Google's `myContacts`, `starred`). */
	tags: string[];
	photo: CardPhoto;
}

/** A person already in Stella, as far as a card can agree or disagree with them. */
export interface StellaPerson {
	id: string;
	firstName: string | null;
	lastName: string | null;
	displayName: string;
	nickname: string | null;
	company: string | null;
	jobTitle: string | null;
	birthday: PartialDate | null;
	hasPhoto: boolean;
	fields: { kind: ContactFieldKind; value: string }[];
	/** The lines of the homes they live in, which count as their addresses (docs/03 §3.3). */
	homeLines: string[];
	tags: string[];
}

/** What matching needs of a person: who they are called and how they are reached. */
export type MatchablePerson = Pick<
	StellaPerson,
	'id' | 'firstName' | 'lastName' | 'displayName' | 'fields'
>;

/** The full name two spellings are compared by: first and last, else the display name. */
export const fullName = (p: {
	firstName: string | null;
	lastName: string | null;
	displayName: string;
}): string => [p.firstName, p.lastName].filter(Boolean).join(' ') || p.displayName;
