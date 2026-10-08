/* Full search across people and notes (docs/02 §2.22), and the graph screen. */

export const search = {
	'search.title': 'Search',
	'search.placeholder': 'Search people and notes…',
	'search.noResults': (p: { query: string }) => `No results for “${p.query}”.`,
	'search.noResultsHint':
		'Nobody by that name, and no note that says it. If they are new, add them.',
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
	'graph.views': 'Saved views',
	'graph.views.save': 'Save this view…',
	'graph.views.name': 'Name of the view',
	'graph.views.namePlaceholder': 'e.g. Family only',
	'graph.views.confirm': 'Save',
	'graph.views.replaces': (p: { name: string }) => `Replaces “${p.name}”`,
	'graph.views.delete': (p: { name: string }) => `Delete the view “${p.name}”`,
	'graph.connectionPath': 'Connection path',
	'graph.labels': 'Labels',
	'graph.labels.hint': 'Name every line with its relationship',
	'graph.labels.tooMany': (p: { count: number }) =>
		`Paused while more than ${p.count} lines are shown — point at a line or select someone to read theirs`,
	'graph.labels.inTree':
		'Off at first in the tree, where each person’s role stands under their name — switch on to name the lines too',
	'graph.density': 'Spacing',
	'graph.density.compact': 'Compact',
	'graph.density.comfortable': 'Comfortable',
	'graph.density.spacious': 'Spacious',
	'graph.allKinship': 'All kinship lines',
	'graph.allKinship.hint': 'Also the ones the entered links already explain',
	'graph.groupByRole': 'Group by role',
	'graph.groupByRole.hint':
		'Everyone with the same role in a circle stands in one group, on one line to the circle',
	'graph.innerLinks': 'Links within groups',
	'graph.innerLinks.hint': 'Show family, friends and colleagues among the people of a group',
	'graph.group.label': (p: { role: string; count: number }) => `${p.role} · ${p.count}`,
	'graph.bundle.count': (p: { count: number }) => `${p.count} links`,
	'graph.arrange': 'Arrange',
	'graph.arrange.current': (p: { name: string }) => `Arrange: ${p.name}`,
	'graph.arrange.force': 'Free',
	'graph.arrange.force.hint': 'Let the connections pull the map into shape',
	'graph.arrange.tree': 'Tree',
	'graph.arrange.tree.hint': 'One row per generation, the oldest at the top',
	'graph.tree.outsideFamily': 'Outside the family',
	// Under somebody on the shelf: what they are to the person they hang off.
	'graph.tree.tieOf': (p: { role: string; name: string }) => `${p.role} of ${p.name}`,
	// A household's own type, by its own words ("Godparent of") and the person.
	'graph.tree.ownWords': (p: { words: string; name: string }) => `${p.words} ${p.name}`,
	'graph.tree.namePair': (p: { first: string; second: string }) => `${p.first}, ${p.second}`,
	'graph.tree.andMore': (p: { text: string; count: number }) => `${p.text} +${p.count}`,
	'graph.arrange.circles': 'By circle',
	'graph.arrange.circles.hint': 'Each circle with its members around it',
	'graph.loading': 'Loading the graph…',
	// Walking the map from the keyboard (docs/05 §5.8).
	'graph.canvas': 'Relationship map',
	'graph.keyboard.hint':
		'Arrow keys move between people. Enter selects, and pressed again opens up their connections. Home goes back to the selected person or the centre, Escape lets go.',
	'graph.keyboard.selected': (p: { name: string }) => `${p.name}, selected`,
	'graph.keyboard.more': (p: { name: string; count: number }) =>
		`${p.name}, ${p.count} more to open up`,
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
	'graph.peek.roleGroup': 'Role in the circle',
	'graph.peek.inCircle': (p: { name: string }) => `in ${p.name}`,
	'graph.peek.showIndividually': 'Show individually',
	'graph.peek.tip':
		'Tip: click a selected node to expand it, or use the connection path to see how two people are linked.',
	// The map on a person's page reaches two steps and no further (docs/05 §5.5).
	// The way into the whole household, offered wherever a map stops (docs/05 §5.5, §5.8).
	'graph.openInGraph': 'Open in the graph',
	'graph.backToPerson': (p: { name: string }) => `Back to ${p.name}`,
	'graph.backToCircle': (p: { name: string }) => `Back to the ${p.name} circle`,
	'graph.peek.tipCompact': 'Tip: tap a selected person again to open up their own connections.',
	'graph.peek.edgeOfMap': 'This is as far as this map goes. The graph carries the rest.',
	'graph.peek.allShown': 'Everything linked here is already on the map.',
	// A centre with no links at all (docs/02 §2.7): an invitation instead of a lone dot.
	'graph.alone.title': (p: { name: string }) => `${p.name} is not linked to anyone yet`,
	'graph.alone.hint':
		'Add a parent, a partner, a friend or a colleague, and the map grows from there.',
	'graph.alone.add': 'Add a relationship',
	'graph.aloneCircle.title': (p: { name: string }) => `Nobody is in ${p.name} yet`,
	'graph.aloneCircle.hint': 'Add the people who share this circle, and the map grows from there.',
	'graph.onPerson.label': (p: { name: string }) => `The people around ${p.name}`,
	'graph.onPerson.loading': 'Drawing the map…',
	// A phone's small preview of a person's map, grown inside the People card and back
	// (docs/05 §5.5) — not full screen, which is `graph.fullscreen.enter` on the same preview.
	'graph.onPerson.enlarge': 'Enlarge map',
	'graph.onPerson.shrink': 'Shrink map',
	'graph.fullscreen.enter': 'Full screen',
	'graph.fullscreen.exit': 'Leave full screen'
};

/** The key set every translation of this area has to provide. */
export type SearchMessages = typeof search;
