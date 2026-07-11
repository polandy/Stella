import type { Viewer } from '../../access/visibility';
import { toFtsQuery } from './query';

/*
 * Global search (docs/02 §2.9). Turns input into a safe FTS query and delegates to the
 * repository port, which applies the central visibility scoping. Results are grouped by type.
 */

export interface ContactHit {
	id: string;
	displayName: string;
	description: string | null;
}

export interface NoteHit {
	noteId: string;
	title: string | null;
	snippet: string;
	contactId: string;
	contactName: string;
}

export interface SearchResults {
	contacts: ContactHit[];
	notes: NoteHit[];
}

export interface SearchRepository {
	searchContacts(viewer: Viewer, ftsQuery: string, limit: number): Promise<ContactHit[]>;
	searchNotes(viewer: Viewer, ftsQuery: string, limit: number): Promise<NoteHit[]>;
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
		return { contacts: [], notes: [] };
	}

	const [contacts, notes] = await Promise.all([
		deps.search.searchContacts(viewer, ftsQuery, RESULT_LIMIT),
		deps.search.searchNotes(viewer, ftsQuery, RESULT_LIMIT)
	]);
	return { contacts, notes };
}
