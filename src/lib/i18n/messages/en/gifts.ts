/* Gifts: ideas, gifts given and gifts received, on the person page (docs/02 §2.25). */

export const gifts = {
	'gifts.title': 'Gifts',
	// The card as one line, with nothing noted yet (docs/05 §5.5).
	'gifts.none': 'No gift ideas yet.',
	'gifts.addIdea': 'Idea',
	'gifts.addGiven': 'Given',
	'gifts.addReceived': 'Received',
	'gifts.menu': 'More for gifts',

	'gifts.tabs.label': 'Gifts by kind',
	'gifts.tab.ideas': 'Ideas',
	'gifts.tab.given': 'Given',
	'gifts.tab.received': 'Received',
	'gifts.ideas.empty': (p: { name: string }) =>
		`Got an idea for ${p.name}? Note it here, and it is here when the day comes.`,
	'gifts.given.empty': 'Nothing given yet.',

	'gifts.form.ideaFor': (p: { name: string }) => `Idea for ${p.name}`,
	'gifts.form.givenTo': (p: { name: string }) => `Given to ${p.name}`,
	'gifts.form.receivedFrom': (p: { name: string }) => `Received from ${p.name}`,
	'gifts.form.what': 'What?',
	'gifts.form.whatPlaceholder': 'e.g. a cast-iron teapot',
	'gifts.form.more': 'Note or link',
	'gifts.form.note': 'Note',
	'gifts.form.notePlaceholder': 'Size, colour, where they saw it',
	'gifts.form.link': 'Link',
	'gifts.form.on': 'On',
	'gifts.form.occasion': 'Occasion',
	'gifts.form.otherOccasion': 'Which occasion?',

	'gifts.occasion.birthday': 'Birthday',
	'gifts.occasion.christmas': 'Christmas',
	'gifts.occasion.anniversary': 'Anniversary',
	'gifts.occasion.other': 'Other…',

	'gifts.markGiven': 'Mark as given',
	// The row button opens the form; the form's submit says the whole thing.
	'gifts.markGiven.open': 'Mark as given…',
	'gifts.markGiven.title': (p: { title: string }) => `“${p.title}” given`,
	'gifts.notedBy': (p: { name: string }) => `noted by ${p.name}`,
	'gifts.notedByYou': 'noted by you',
	'gifts.link': 'Link',
	'gifts.openLink': (p: { title: string }) => `Open the link for “${p.title}”`,
	'gifts.edit': (p: { title: string }) => `Edit “${p.title}”`,
	'gifts.remove': (p: { title: string }) => `Remove “${p.title}”`,
	'gifts.removed': 'Gift removed',

	// In the story (docs/02 §2.23): what happened on the day.
	'gifts.story.given': 'Given',
	'gifts.story.received': 'Received'
};

/** The key set every translation of this area has to provide. */
export type GiftsMessages = typeof gifts;
