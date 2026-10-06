/* A person's story: the journal entries and interactions on their page (docs/02 §2.23). */

export const story = {
	'story.empty.title': 'Nothing written down yet.',
	'story.empty.hint': 'Log a call or a visit, or write what happened — it all lands here.',
	'story.journal': 'Moment',
	'story.removeEntry': 'Remove moment',
	'story.removeInteraction': 'Remove interaction',
	'story.entryRemoved': 'Moment removed',
	'story.interactionRemoved': 'Interaction removed',
	'story.showEarlier': 'Show earlier',
	'story.loadFailed': 'Could not load earlier activity. Try again.'
};

/** The key set every translation of this area has to provide. */
export type StoryMessages = typeof story;
