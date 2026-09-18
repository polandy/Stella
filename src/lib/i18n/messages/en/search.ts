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
	'graph.filter': 'Filter',
	'graph.filter.summary': (p: { shown: number; total: number }) =>
		`Filter: ${p.shown} of ${p.total} kinds of line shown`,
	'graph.filter.circles': 'Circles',
	'graph.filter.kinship': 'Kinship',
	'graph.connectionPath': 'Connection path',
	'graph.labels': 'Labels',
	'graph.labels.hint': 'Name every line with its relationship',
	'graph.arrange': 'Arrange',
	'graph.arrange.current': (p: { name: string }) => `Arrange: ${p.name}`,
	'graph.arrange.force': 'Free',
	'graph.arrange.force.hint': 'Let the connections pull the map into shape',
	'graph.arrange.tree': 'Tree',
	'graph.arrange.tree.hint': 'One row per generation, the oldest at the top',
	'graph.arrange.circles': 'By circle',
	'graph.arrange.circles.hint': 'Each circle with its members around it',
	'graph.path.none': 'No connection found between those two.',
	'graph.path.pickSecond': 'Now pick the second person…',
	'graph.path.pickTwo': 'Pick two people to trace how they’re connected.',
	'graph.peek.sharedContext': 'Shared context',
	'graph.peek.person': 'Person',
	'graph.peek.deceased': 'deceased',
	'graph.peek.rolesToOpen': 'Roles to open up',
	'graph.peek.expand': 'Expand connections',
	'graph.peek.openProfile': 'Open profile',
	'graph.peek.openCircle': 'Open the circle',
	'graph.peek.tip':
		'Tip: click a selected node to expand it, or use the connection path to see how two people are linked.',
	// The map on a person's page reaches two steps and no further (docs/05 §5.5).
	// The way into the whole household, offered wherever a map stops (docs/05 §5.5, §5.8).
	'graph.openInGraph': 'Open in the graph',
	'graph.backToPerson': (p: { name: string }) => `Back to ${p.name}`,
	'graph.backToCircle': (p: { name: string }) => `Back to the ${p.name} circle`,
	'graph.peek.tipCompact': 'Tip: tap a selected person again to open up their own connections.',
	'graph.peek.edgeOfMap': 'This is as far as this map goes. The graph carries the rest.',
	'graph.onPerson.label': (p: { name: string }) => `The people around ${p.name}`,
	'graph.onPerson.loading': 'Drawing the map…'
};

/** The key set every translation of this area has to provide. */
export type SearchMessages = typeof search;
