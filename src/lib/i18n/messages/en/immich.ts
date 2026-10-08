/* People's photos from Immich: the connection, the link on a person, the face picker (docs/02 §2.24). */

export const immich = {
	// Why a link was refused, or a call failed (docs/02 §2.24.2, §2.24.3).
	'immich.error.personGone': 'This person is no longer in Immich.',
	'immich.error.linkedTo': (p: { name: string }) => `This face is already linked to ${p.name}.`,
	'immich.error.contactLinked': (p: { name: string }) => `${p.name} is linked already.`,
	'immich.error.linkedElsewhere': 'This face is already linked to another person in Stella.',
	'immich.error.unreachable': 'Immich didn’t answer. Try again in a moment.',
	'immich.error.keyRejected': 'Immich refused Stella’s key. An admin needs to check it.',
	'immich.error.missingScope': (p: { scope: string }) =>
		`Stella’s key may not do this in Immich — it needs ${p.scope}.`,

	// Settings → Immich: one line for every member, and what the key means for the admin (§2.24.1).
	'immich.settings.heading': 'Immich',
	'immich.settings.checking': 'Asking Immich…',
	'immich.settings.connected': (p: { owner: string; version: string }) =>
		`Connected to ${p.owner}’s Immich · ${p.version}`,
	'immich.settings.unreachable': 'Immich didn’t answer. Stella tries again shortly.',
	'immich.settings.keyRejected': 'Immich refused the key — it may have been deleted or mistyped.',
	'immich.settings.scope.user.read':
		'The key cannot tell whose account it is — it needs user.read.',
	'immich.settings.scope.person.read': 'The key cannot read people — it needs person.read.',
	'immich.settings.scope.person.statistics':
		'The key cannot count photos — it needs person.statistics.',
	'immich.settings.scope.asset.read': 'The key cannot list photos — it needs asset.read.',
	'immich.settings.scope.asset.view': 'The key cannot show photos — it needs asset.view.',
	'immich.settings.tooOld': (p: { version: string }) =>
		`This Immich is version ${p.version}. Stella needs Immich 3.2 or newer.`,
	'immich.settings.sharing':
		'Everyone in the household can see the photos of the people linked from this library.',
	'immich.settings.howToLink': 'Link a person from the menu of the Photos card on their page.',

	// Settings → Immich → Find your people: the matching list (§2.24.7).
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
	'immich.match.photos': (p: { count: number; shown: string }) =>
		`${p.shown} ${p.count === 1 ? 'photo' : 'photos'}`,
	'immich.match.skip': 'Not now',
	'immich.match.skipLabel': (p: { name: string }) => `Not now: ${p.name}`,
	'immich.match.linked': (p: { count: number }) =>
		p.count === 1 ? '1 person linked.' : `${p.count} people linked.`,
	'immich.match.ignore': 'Ignore',
	'immich.match.ignoreLabel': (p: { name: string }) => `Ignore the proposal for ${p.name}`,
	'immich.match.ignoredToast': 'Proposal ignored',
	'immich.match.ignoredHeading': (p: { count: number }) => `Ignored (${p.count})`,
	'immich.match.ignoredBy': (p: { name: string; date: string }) =>
		`Ignored by ${p.name} on ${p.date}`,
	'immich.match.formerMember': 'a former member',
	'immich.match.unnamedFace': 'no longer named in Immich',
	'immich.match.proposeAgain': 'Propose again',
	'immich.match.proposeAgainLabel': (p: { name: string }) => `Propose again: ${p.name}`,
	'immich.match.proposedAgainToast': 'Proposed again',
	'immich.match.done': 'That’s everyone for now.',
	'immich.match.doneHint': 'Name more faces in Immich, then look again.',
	'immich.match.again': 'Look again',

	// The Photos card's suggestion for an unlinked person: the list's likely match (§2.24.7).
	'immich.hint.label': (p: { name: string }) => `Suggestion from Immich for ${p.name}`,
	'immich.hint.question': (p: { name: string }) => `Is this ${p.name}?`,
	'immich.hint.has': (p: { immichName: string; count: number; shown: string }) =>
		`Immich has “${p.immichName}” with ${p.shown} ${p.count === 1 ? 'photo' : 'photos'}.`,
	'immich.hint.hasUncounted': (p: { immichName: string }) => `Immich has “${p.immichName}”.`,
	'immich.hint.choose': 'Choose another',
	// The second tab of Find your people: named faces nobody in Stella holds yet.
	'immich.tabs.label': 'What to look through',
	'immich.tabs.matching': 'Matching',
	'immich.tabs.new': 'New from Immich',
	'immich.new.intro': 'Faces named in Immich that have no linked person in Stella yet.',
	'immich.new.summary': (p: { count: number; shown: string }) =>
		`${p.shown} ${p.count === 1 ? 'name' : 'names'} from Immich, most photos first`,
	'immich.new.assign': 'Assign…',
	'immich.new.assignLabel': (p: { name: string }) => `Assign ${p.name}`,
	'immich.new.ignoreLabel': (p: { name: string }) => `Ignore ${p.name}`,
	'immich.new.ignoredToast': (p: { name: string }) => `${p.name} ignored`,
	'immich.new.compareOne': 'Someone in Stella has a similar name. Is it the same person?',
	'immich.new.compareMany': 'People in Stella have a similar name. Is one of them the same person?',
	'immich.new.openInImmich': 'Open in Immich',
	'immich.new.theirPhoto': (p: { name: string }) => `${p.name} in Stella`,
	'immich.new.thisIsThem': 'This is the person',
	'immich.new.thisIsThemLabel': (p: { immichName: string; name: string }) =>
		`${p.immichName} is ${p.name}`,
	'immich.new.linkedTo': (p: { name: string }) => `Linked to “${p.name}” in Immich already`,
	'immich.new.linkedToUnnamed': 'Linked to another face in Immich already',
	'immich.new.replaceQuestion': (p: { name: string }) =>
		`${p.name} is linked to another face. Link this one instead?`,
	'immich.new.replace': 'Link this one instead',
	'immich.new.createInstead': 'No, add a new person',
	'immich.new.back': 'Back to the comparison',
	'immich.new.kinHint': (p: { nickname: string }) => `“${p.nickname}” suggested as nickname.`,
	'immich.new.usePhoto': 'Use the face from Immich as photo',
	'immich.new.add': 'Add and link',
	'immich.new.findInStella': 'Already in Stella? Find person',
	'immich.new.findPlaceholder': 'Search people in Stella',
	'immich.new.added': (p: { name: string }) => `${p.name} added`,
	'immich.new.open': 'Open',
	'immich.new.assigned': (p: { immichName: string; name: string }) =>
		`${p.immichName} linked to ${p.name}`,
	'immich.new.photoFailed': 'The person was added, but the face could not be kept as their photo.',
	'immich.new.done': 'Every named face is in Stella.',
	'immich.new.showMore': (p: { count: number }) => `Show ${p.count} more`,
	// The person page's Photos card (§2.24.2, §2.24.3).
	// Without the person's name: the page heading already names them, and a second control
	// carrying it would make "the button called Anna" ambiguous.
	'immich.menu.label': 'Photo library options',
	'immich.menu.trigger': 'Photo library',
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

	// Their latest photos on the Photos card, and the lightbox's Immich actions (§2.24.3).
	'immich.strip.label': 'Latest photos in Immich',
	'immich.strip.loading': 'Loading photos from Immich…',
	'immich.strip.photo': (p: { date: string }) => `Photo from ${p.date}, in Immich`,
	'immich.strip.undated': 'Photo in Immich',
	'immich.strip.showMore': 'Show more',
	'immich.viewer.use': 'Use as photo',
	'immich.viewer.useFailed': 'Couldn’t keep this photo. Reload the page and try again.',

	// Photos of two people together: the Immich tab's chips and a relationship row's (§2.24.8).
	'immich.together.label': 'Whose photos',
	'immich.together.own': (p: { name: string }) => p.name,
	'immich.together.withYou': (p: { name: string }) => `You and ${p.name}`,
	'immich.together.pair': (p: { first: string; second: string }) => `${p.first} and ${p.second}`,
	// Said of the pair as an object, so "you" is not capitalised mid-sentence.
	'immich.together.stripWithYou': (p: { name: string }) =>
		`Photos of you and ${p.name} together, in Immich`,
	'immich.together.stripPair': (p: { first: string; second: string }) =>
		`Photos of ${p.first} and ${p.second} together, in Immich`,
	'immich.together.none': 'No photos of the two of them together in Immich yet.',
	'immich.together.row': 'Together',
	'immich.together.rowLabelWithYou': (p: { name: string }) =>
		`Show photos of you and ${p.name} together`,
	'immich.together.rowLabelPair': (p: { first: string; second: string }) =>
		`Show photos of ${p.first} and ${p.second} together`,

	// The face picker (§2.24.2).
	'immich.picker.title': (p: { name: string }) => `Find ${p.name} in Immich`,
	'immich.picker.search': 'Name in Immich',
	'immich.picker.searching': 'Searching Immich…',
	'immich.picker.none':
		'No face in Immich has this name. Try another spelling, or name the face in Immich first.',
	'immich.picker.hint': 'Pick the face that is this person.',
	'immich.picker.linkedTo': (p: { name: string }) => `Linked to ${p.name}`,
	'immich.picker.linkedElsewhere': 'Linked to someone else',
	'immich.picker.link': (p: { immichName: string; name: string }) =>
		`Link ${p.immichName} to ${p.name}`
};

/** The key set every translation of this area has to provide. */
export type ImmichMessages = typeof immich;
