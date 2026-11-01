/* The share sheet: what another app shared, saved about one person (docs/02 §2.18.3). */

export const share = {
	'share.title': 'Share to Stella',
	'share.close': 'Close without saving',
	// Over the sheet when Stella cannot be reached: saving still works, it waits on the phone.
	'share.offline':
		'Stella can’t be reached right now. What you save stays on this phone and goes out once she’s back.',
	'share.shared': 'What was shared',
	'share.photo': (p: { n: number }) => `Shared photo ${p.n}`,
	'share.photoCount': (p: { count: number }) => (p.count === 1 ? '1 photo' : `${p.count} photos`),
	'share.photosDropped': (p: { max: number; dropped: number }) =>
		`Only the first ${p.max} are taken; ${p.dropped} left out.`,
	// The server took the share before the app's worker did: words come along, photos cannot.
	'share.photosLeftBehind':
		'The photos did not come along. Share them again once Stella is installed as an app on this phone.',
	'share.gone': 'This share was saved already, or has expired. Share it again from the other app.',
	'share.nothing': 'Nothing came along that Stella could save.',
	'share.who': 'About whom?',
	'share.search': 'Search for a person',
	'share.searchPlaceholder': 'Search a name',
	'share.recent': 'Recently viewed',
	'share.noMatch': 'Nobody by that name.',
	'share.as': 'As',
	'share.target.gallery': 'To the photos',
	'share.target.galleryHint': (p: { count: number }) =>
		p.count === 1 ? 'Without location data' : `All ${p.count} photos, without location data`,
	'share.target.avatar': 'As profile photo',
	'share.target.avatarHint': 'Replaces the current one',
	'share.target.moment': 'Moment',
	'share.target.momentHint': 'The link goes in the text',
	'share.target.gift': 'Gift idea',
	'share.target.giftHint': 'With the link as the idea’s link',
	'share.target.todo': 'To-do',
	'share.target.todoHint': 'Something to do',
	// Why a target cannot be picked.
	'share.blocked.severalPhotos': 'Only with a single photo',
	'share.blocked.offline': 'Needs a connection',
	'share.moment.label': (p: { name: string }) => `What happened? Today, about ${p.name}`,
	'share.gift.title': 'Idea',
	'share.gift.link': 'Link',
	'share.todo.label': 'What is there to do?',
	'share.todo.linkAdded': 'The link is added at the end.',
	'share.avatar.hint': 'Next you choose the crop, as for any profile photo.',
	'share.needsPerson': 'Pick who it is about first.',
	'share.save': 'Save',
	'share.saveForLater': 'Save for later',
	'share.saving': 'Saving…',
	'share.failed': 'That did not work. Try again.',
	// The toast on the person's page once it is saved.
	'share.saved.gallery': (p: { count: number }): string =>
		p.count === 1 ? 'Photo saved' : 'Photos saved',
	'share.saved.avatar': 'Profile photo set',
	'share.saved.moment': 'Moment saved',
	'share.saved.gift': 'Gift idea saved',
	'share.saved.todo': 'To-do saved',
	'share.keptForLater': 'Saved for later'
};

/** The key set every translation of this area has to provide. */
export type ShareMessages = typeof share;
