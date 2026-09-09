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
		'The map draws itself from people and how they are connected. Add someone to begin.',
	'graph.find': 'Find a person',
	'graph.findPlaceholder': 'Find a person…',
	'graph.filter.circles': 'Circles',
	'graph.filter.kinship': 'Kinship',
	'graph.connectionPath': 'Connection path',
	'graph.path.none': 'No connection found between those two.',
	'graph.path.pickSecond': 'Now pick the second person…',
	'graph.path.pickTwo': 'Pick two people to trace how they’re connected.',
	'graph.peek.sharedContext': 'Shared context',
	'graph.peek.person': 'Person',
	'graph.peek.deceased': 'deceased',
	'graph.peek.expand': 'Expand connections',
	'graph.peek.openProfile': 'Open profile',
	'graph.peek.tip':
		'Tip: click a selected node to expand it, or use the connection path to see how two people are linked.'
};

/** The key set every translation of this area has to provide. */
export type SearchMessages = typeof search;
