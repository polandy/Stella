/* People's photos from Immich: the connection, the link on a person, the face picker (docs/02 §2.24). */

export const immich = {
	// Why a link was refused, or a call failed (docs/concepts/immich.md §4.5).
	'immich.error.personGone': 'This person is no longer in Immich.',
	'immich.error.unreachable': 'Immich didn’t answer. Try again in a moment.',
	'immich.error.keyRejected': 'Immich refused Stella’s key. An admin needs to check it.',
	'immich.error.missingScope': (p: { scope: string }) =>
		`Stella’s key may not do this in Immich — it needs ${p.scope}.`,

	// Settings → Immich: one line for every member, and what the key means for the admin (§4.1).
	'immich.settings.heading': 'Immich',
	'immich.settings.checking': 'Asking Immich…',
	'immich.settings.connected': (p: { owner: string; version: string }) =>
		`Connected to ${p.owner}’s Immich · ${p.version}`,
	'immich.settings.unreachable': 'Immich didn’t answer. Stella tries again shortly.',
	'immich.settings.keyRejected': 'Immich refused the key — it may have been deleted or mistyped.',
	'immich.settings.scope.user.read': 'The key cannot tell whose account it is — it needs user.read.',
	'immich.settings.scope.person.read': 'The key cannot read people — it needs person.read.',
	'immich.settings.scope.person.statistics': 'The key cannot count photos — it needs person.statistics.',
	'immich.settings.tooOld': (p: { version: string }) =>
		`This Immich is version ${p.version}. Stella needs Immich 3.2 or newer.`,
	'immich.settings.sharing':
		'Everyone in the household can see the photos of the people linked from this library.',
	'immich.settings.howToLink': 'Link a person from the menu of the Photos card on their page.',

	// The person page's Photos card (§4.3).
	// Without the person's name: the page heading already names them, and a second control
	// carrying it would make "the button called Anna" ambiguous.
	'immich.menu.label': 'Immich options',
	'immich.menu.trigger': 'Immich',
	'immich.menu.find': 'Find in Immich',
	'immich.menu.unlink': 'Unlink from Immich',
	'immich.row.label': 'In Immich',
	'immich.row.photos': (p: { count: number; shown: string }) =>
		`In Immich · ${p.shown} ${p.count === 1 ? 'photo' : 'photos'}`,
	'immich.row.asking': 'Asking Immich…',
	'immich.row.unreachable': 'Immich didn’t answer.',
	'immich.row.gone': 'This person is no longer in Immich.',
	'immich.row.unlinkQuestion': 'Unlink?',
	'immich.row.open': 'Open in Immich',

	// The face picker (§4.3).
	'immich.picker.title': (p: { name: string }) => `Find ${p.name} in Immich`,
	'immich.picker.search': 'Name in Immich',
	'immich.picker.searching': 'Searching Immich…',
	'immich.picker.none': 'No face in Immich has this name. Try another spelling, or name the face in Immich first.',
	'immich.picker.hint': 'Pick the face that is this person.',
	'immich.picker.link': (p: { immichName: string; name: string }) => `Link ${p.immichName} to ${p.name}`
};

/** The key set every translation of this area has to provide. */
export type ImmichMessages = typeof immich;
