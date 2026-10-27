import type { PartialDate } from '../../../dates/partial-date';
import type { NextcloudSource } from '../../../import-match/card';
import type { ContactFieldKind } from '../../../people/contact-fields';
import type { Viewer } from '../../access/visibility';
import type { SyncConflict, SyncConflictKind } from './sync-plan';

/*
 * What the Nextcloud sync keeps (docs/02 §2.16.3, docs/03 §3.3): where the last sync stopped,
 * every card of the book as it was then, and the conflicts waiting for an answer. The links
 * themselves are the matching review's (`contact_source_link`), written through its writer.
 */

/** A card of the book as Stella last saw it. */
export interface MirroredCard {
	href: string;
	/** Its key, as `readContactCards` gives it. */
	uid: string;
	etag: string;
	vcard: string;
	/** The linked person's facts when last in step (`stellaHash`); null writes them out. */
	stellaHash: string | null;
}

/** A shared person linked to a card of the book, with what the sync reads and writes of them. */
export interface LinkedPerson {
	id: string;
	firstName: string | null;
	lastName: string | null;
	displayName: string;
	nickname: string | null;
	company: string | null;
	jobTitle: string | null;
	birthday: PartialDate | null;
	/** Their contact fields in order, each with the label as a member wrote it. */
	fields: { kind: ContactFieldKind; value: string; label: string | null }[];
	/** The lines of the homes they live in. */
	homeLines: string[];
	tags: string[];
	hasPhoto: boolean;
	/** Their avatar's file, when it is a shared picture; null when they have none. */
	avatar: { photoId: string; path: string; mime: string } | null;
}

/** A conflict as it waits, with the person it is about. */
export interface StoredConflict {
	contactId: string;
	conflict: SyncConflict;
	foundAt: number;
}

export interface NextcloudStore {
	/** Where the last sync stopped; null before the first. */
	syncToken(householdId: string, source: NextcloudSource): Promise<string | null>;
	saveSyncToken(
		householdId: string,
		source: NextcloudSource,
		token: string,
		at: number
	): Promise<void>;
	/** When the last sync finished; null before the first. */
	syncedAt(householdId: string, source: NextcloudSource): Promise<number | null>;

	/** Every card Stella holds of the book. */
	cards(householdId: string, source: NextcloudSource): Promise<MirroredCard[]>;
	/** Hold a card as the book now has it; a card held already keeps its `stellaHash`. */
	saveCard(
		householdId: string,
		source: NextcloudSource,
		card: Omit<MirroredCard, 'stellaHash'>
	): Promise<void>;
	setStellaHash(
		householdId: string,
		source: NextcloudSource,
		href: string,
		hash: string | null
	): Promise<void>;
	/**
	 * Forget a card gone from the book, with its link and its person's conflicts: the person
	 * stays as they are. Returns whether it was linked.
	 */
	dropCard(householdId: string, source: NextcloudSource, href: string): Promise<boolean>;
	/** Forget every link of the book that names a private person, and their conflicts. */
	unlinkPrivate(householdId: string, source: NextcloudSource): Promise<number>;

	/** The people `viewer` may browse that are linked to a card of the book, by card key. */
	linkedPeople(viewer: Viewer, source: NextcloudSource): Promise<Map<string, LinkedPerson>>;

	/** Keep a person's conflicts, each replacing the one of the same kind waiting before. */
	putConflicts(
		householdId: string,
		source: NextcloudSource,
		contactId: string,
		conflicts: readonly SyncConflict[],
		at: number
	): Promise<void>;
	/** The conflicts waiting about people `viewer` may browse, oldest first. */
	conflicts(viewer: Viewer): Promise<StoredConflict[]>;
	/** Forget one answered conflict; false when it was not waiting. */
	removeConflict(viewer: Viewer, contactId: string, kind: SyncConflictKind): Promise<boolean>;
}
