import type { GiftState } from '../../../gifts/gifts';
import { foundByFormerName } from '../../../people/former-name';
import { foundByJob } from '../../../people/job';
import type { Viewer, Visibility } from '../../access/visibility';
import { searchedTag, toFtsQuery } from './query';

/*
 * Global search (docs/02 §2.9). Turns input into a safe FTS query and delegates to the
 * repository port, which applies the central visibility scoping. Results are grouped by type:
 * people, notes, gifts, moments and to-dos. A query that is one `#tag` asks for that tag alone, so it
 * finds only the moments carrying it (docs/02 §2.20.2).
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
	/** A private one's snippet stays blurred on its author's screen (docs/02 §2.10.1). */
	visibility: Visibility;
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

/** A moment found by its words or its tag, with the person it is on (docs/02 §2.20.2). */
export interface MomentHit {
	entryId: string;
	title: string | null;
	snippet: string;
	/** A private one's snippet stays blurred on its author's screen, as a note's does. */
	visibility: Visibility;
	/** ISO YYYY-MM-DD. */
	entryDate: string;
	contactId: string;
	contactName: string;
}

/** A to-do found by its title, open or done, with the person it is about (docs/02 §2.26). */
export interface TodoHit {
	todoId: string;
	title: string;
	/** Ticked — the result's *done* mark. */
	done: boolean;
	/** ISO YYYY-MM-DD, the household's day it was ticked; null while open, and on one ticked before the day was kept. */
	doneOn: string | null;
	contactId: string;
	contactName: string;
}

export interface SearchResults {
	contacts: FoundContact[];
	notes: NoteHit[];
	gifts: GiftHit[];
	moments: MomentHit[];
	todos: TodoHit[];
	/** The tag key when the query was one `#tag`: then only the moments carrying it are found. */
	tag: string | null;
}

export interface SearchRepository {
	searchContacts(viewer: Viewer, ftsQuery: string, limit: number): Promise<ContactHit[]>;
	searchNotes(viewer: Viewer, ftsQuery: string, limit: number): Promise<NoteHit[]>;
	searchGifts(viewer: Viewer, ftsQuery: string, limit: number): Promise<GiftHit[]>;
	searchMoments(viewer: Viewer, ftsQuery: string, limit: number): Promise<MomentHit[]>;
	/** Open ones first, then by rank. */
	searchTodos(viewer: Viewer, ftsQuery: string, limit: number): Promise<TodoHit[]>;
	/** The moments carrying the tag of this key — matched by the tag, not the word. */
	searchMomentsByTag(viewer: Viewer, tagKey: string, limit: number): Promise<MomentHit[]>;
}

export interface SearchDeps {
	search: SearchRepository;
}

const RESULT_LIMIT = 20;

export const NOTHING_FOUND: SearchResults = {
	contacts: [],
	notes: [],
	gifts: [],
	moments: [],
	todos: [],
	tag: null
};

export async function search(
	deps: SearchDeps,
	viewer: Viewer,
	input: string
): Promise<SearchResults> {
	const tag = searchedTag(input);
	if (tag !== null) {
		const moments = await deps.search.searchMomentsByTag(viewer, tag, RESULT_LIMIT);
		return { ...NOTHING_FOUND, moments, tag };
	}
	const ftsQuery = toFtsQuery(input);
	if (ftsQuery === '') return NOTHING_FOUND;

	const [contacts, notes, gifts, moments, todos] = await Promise.all([
		deps.search.searchContacts(viewer, ftsQuery, RESULT_LIMIT),
		deps.search.searchNotes(viewer, ftsQuery, RESULT_LIMIT),
		deps.search.searchGifts(viewer, ftsQuery, RESULT_LIMIT),
		deps.search.searchMoments(viewer, ftsQuery, RESULT_LIMIT),
		deps.search.searchTodos(viewer, ftsQuery, RESULT_LIMIT)
	]);
	return {
		contacts: contacts.map((hit) => ({
			...hit,
			formerly: foundByFormerName(hit, input),
			foundByJob: foundByJob(hit, input)
		})),
		notes,
		gifts,
		moments,
		todos,
		tag: null
	};
}
