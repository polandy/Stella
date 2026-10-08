import type { GiftState } from '../../../gifts/gifts';
import { foundByFormerName } from '../../../people/former-name';
import { foundByJob } from '../../../people/job';
import type { Viewer } from '../../access/visibility';
import { toFtsQuery } from './query';

/*
 * Global search (docs/02 §2.9). Turns input into a safe FTS query and delegates to the
 * repository port, which applies the central visibility scoping. Results are grouped by type:
 * people, notes and gifts.
 */

export interface ContactHit {
	id: string;
	displayName: string;
	description: string | null;
	/** So a result shows the person's face rather than their initials (docs/02 §2.9). */
	avatarPhotoId: string | null;
	/** An earlier name, which the index matches too (docs/02 §2.2). */
	formerName: string | null;
	/** What they do and where, which the index matches too and the row shows (docs/02 §2.2). */
	jobTitle: string | null;
	company: string | null;
}

/**
 * A person found, the former name the query found them by if it was that, and whether only
 * their job explains the match (§2.9).
 */
export interface FoundContact extends ContactHit {
	formerly: string | null;
	foundByJob: boolean;
}

export interface NoteHit {
	noteId: string;
	title: string | null;
	snippet: string;
	contactId: string;
	contactName: string;
}

/** A gift found by its title or note, with the person it is for (docs/02 §2.25.5). */
export interface GiftHit {
	giftId: string;
	title: string;
	state: GiftState;
	/** ISO YYYY-MM-DD; null while an idea. */
	givenOn: string | null;
	contactId: string;
	contactName: string;
}

export interface SearchResults {
	contacts: FoundContact[];
	notes: NoteHit[];
	gifts: GiftHit[];
}

export interface SearchRepository {
	searchContacts(viewer: Viewer, ftsQuery: string, limit: number): Promise<ContactHit[]>;
	searchNotes(viewer: Viewer, ftsQuery: string, limit: number): Promise<NoteHit[]>;
	searchGifts(viewer: Viewer, ftsQuery: string, limit: number): Promise<GiftHit[]>;
}

export interface SearchDeps {
	search: SearchRepository;
}

const RESULT_LIMIT = 20;

export async function search(
	deps: SearchDeps,
	viewer: Viewer,
	input: string
): Promise<SearchResults> {
	const ftsQuery = toFtsQuery(input);
	if (ftsQuery === '') {
		return { contacts: [], notes: [], gifts: [] };
	}

	const [contacts, notes, gifts] = await Promise.all([
		deps.search.searchContacts(viewer, ftsQuery, RESULT_LIMIT),
		deps.search.searchNotes(viewer, ftsQuery, RESULT_LIMIT),
		deps.search.searchGifts(viewer, ftsQuery, RESULT_LIMIT)
	]);
	return {
		contacts: contacts.map((hit) => ({
			...hit,
			formerly: foundByFormerName(hit, input),
			foundByJob: foundByJob(hit, input)
		})),
		notes,
		gifts
	};
}
