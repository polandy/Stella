/* A person's story: the journal entries and interactions on their page (docs/02 §2.23). */

export const story = {
	'story.empty': 'Nothing written down yet — calls, visits and moments land here.',
	'story.journal': 'Moment',
	'story.removeEntry': 'Remove moment',
	'story.removeInteraction': 'Remove interaction',
	'story.editInteraction': 'Edit interaction',
	'story.saveFailed': 'Could not save the changes. Try again.',
	'story.entryRemoved': 'Moment removed',
	'story.interactionRemoved': 'Interaction removed',
	'story.showEarlier': 'Show earlier',
	'story.loadFailed': 'Could not load earlier activity. Try again.'
};

/** The key set every translation of this area has to provide. */
export type StoryMessages = typeof story;
