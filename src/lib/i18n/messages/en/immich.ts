/* People's photos from Immich: the connection, the link on a person, the face picker (docs/02 §2.24). */

export const immich = {
	// Why a link was refused, or a call failed (docs/concepts/immich.md §4.5).
	'immich.error.personGone': 'This person is no longer in Immich.',
	'immich.error.linkedTo': (p: { name: string }) => `This face is already linked to ${p.name}.`,
	'immich.error.contactLinked': (p: { name: string }) => `${p.name} is linked already.`,
	'immich.error.linkedElsewhere': 'This face is already linked to another person in Stella.',
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
	'immich.settings.scope.asset.read': 'The key cannot list photos — it needs asset.read.',
	'immich.settings.scope.asset.view': 'The key cannot show photos — it needs asset.view.',
	'immich.settings.tooOld': (p: { version: string }) =>
		`This Immich is version ${p.version}. Stella needs Immich 3.2 or newer.`,
	'immich.settings.sharing':
		'Everyone in the household can see the photos of the people linked from this library.',
	'immich.settings.howToLink': 'Link a person from the menu of the Photos card on their page.',

	// Settings → Immich → Find your people: the matching list (§4.2).
	'immich.match.title': 'Find your people',
	'immich.match.blurb': 'Link the people in Stella to their faces in Immich.',
	'immich.match.intro':
		'Faces named in Immich, next to the people in Stella with the same name. Link the ones that are the same person — the face tells you.',
	'immich.match.asking': 'Asking Immich for its people…',
	'immich.match.linkAll': (p: { count: number }) => `Link all likely (${p.count})`,
	'immich.match.maybeOne': (p: { name: string }) => `Could this be ${p.name}?`,
	'immich.match.maybeMany': (p: { name: string }) => `Which of these is ${p.name}?`,
	'immich.match.link': 'Link',
	'immich.match.face': (p: { name: string }) => `${p.name} in Immich`,
	'immich.match.inImmich': (p: { name: string }) => `In Immich: ${p.name}`,
	'immich.match.photos': (p: { count: number; shown: string }) => `${p.shown} ${p.count === 1 ? 'photo' : 'photos'}`,
	'immich.match.skip': 'Not now',
	'immich.match.skipLabel': (p: { name: string }) => `Not now: ${p.name}`,
	'immich.match.linked': (p: { count: number }) =>
		p.count === 1 ? '1 person linked.' : `${p.count} people linked.`,
	'immich.match.done': 'That’s everyone for now.',
	'immich.match.doneHint': 'Name more faces in Immich, then look again.',
	'immich.match.again': 'Look again',
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

	// The strip of their latest photos, and the viewer it opens (§4.3).
	'immich.strip.label': 'Latest photos in Immich',
	'immich.strip.loading': 'Loading photos from Immich…',
	'immich.strip.photo': (p: { date: string }) => `Photo from ${p.date}, in Immich`,
	'immich.strip.undated': 'Photo in Immich',
	'immich.strip.showMore': 'Show more',
	'immich.viewer.dialog': 'Photo from Immich',
	'immich.viewer.position': (p: { at: number; count: number }) => `${p.at} of ${p.count}`,
	'immich.viewer.previous': 'Previous photo',
	'immich.viewer.next': 'Next photo',
	'immich.viewer.use': 'Use as photo',
	'immich.viewer.useFailed': 'Couldn’t keep this photo. Reload the page and try again.',

	// The face picker (§4.3).
	'immich.picker.title': (p: { name: string }) => `Find ${p.name} in Immich`,
	'immich.picker.search': 'Name in Immich',
	'immich.picker.searching': 'Searching Immich…',
	'immich.picker.none': 'No face in Immich has this name. Try another spelling, or name the face in Immich first.',
	'immich.picker.hint': 'Pick the face that is this person.',
	'immich.picker.linkedTo': (p: { name: string }) => `Linked to ${p.name}`,
	'immich.picker.linkedElsewhere': 'Linked to someone else',
	'immich.picker.link': (p: { immichName: string; name: string }) => `Link ${p.immichName} to ${p.name}`
};

/** The key set every translation of this area has to provide. */
export type ImmichMessages = typeof immich;
