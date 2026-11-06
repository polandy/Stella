import { extractMentionIds } from '$lib/mentions/mentions';
import { matchSnippet } from '$lib/mentions/snippet';
import type { Viewer } from '$lib/server/access/visibility';
import {
	listContactNamesAmong,
	type ContactNameDeps
} from '$lib/server/domain/contacts/contact-names';
import type { SearchResults } from '$lib/server/domain/search/search';

/*
 * Search results as the page shows them (docs/02 §2.9): a note's or moment's body cut to a
 * snippet around what was searched, its mentions named as the chip names them — so the person
 * the search found stays in the line — and only as far as the viewer may see them.
 */

export async function searchForView(
	deps: ContactNameDeps,
	viewer: Viewer,
	results: SearchResults,
	query: string
) {
	const bodies = [...results.notes, ...results.moments].map((hit) => hit.body);
	const names = await listContactNamesAmong(deps, viewer, bodies.flatMap(extractMentionIds));
	const nameById = new Map(names.map((c) => [c.id, c.displayName]));
	const nameOf = (id: string) => nameById.get(id) ?? null;
	const snippetOf = <Hit extends { body: string }>({ body, ...hit }: Hit) => ({
		...hit,
		snippet: matchSnippet(body, nameOf, query)
	});
	return {
		...results,
		notes: results.notes.map(snippetOf),
		moments: results.moments.map(snippetOf)
	};
}
