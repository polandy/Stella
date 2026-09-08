/* Full search across people and notes (docs/02 §2.22), and the graph screen. */

export const search = {
	'search.title': 'Search',
	'search.placeholder': 'Search people and notes…',
	'search.noResults': (p: { query: string }) => `No results for “${p.query}”.`,
	'search.prompt': 'Type to search across people and notes.',
	'search.people': 'People',
	'search.notes': 'Notes',
	'search.noteOn': (p: { name: string }) => `on ${p.name}`,
	'graph.title': 'Graph · Stella',
	'graph.hint': 'Click to focus · click again to expand · trace a connection path',
	'graph.empty.title': 'Nothing to explore yet',
	'graph.empty.hint':
		'The map draws itself from people and how they are connected. Add someone to begin.'
};

/** The key set every translation of this area has to provide. */
export type SearchMessages = typeof search;
