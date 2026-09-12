/* A person's story: the journal entries and interactions on their page (docs/02 §2.23). */

export const story = {
	'story.empty.title': 'Nothing written down yet.',
	'story.empty.hint': 'Log a call or a visit, or write what happened — it all lands here.',
	'story.journal': 'Journal',
	'story.removeEntry': 'Remove entry',
	'story.removeInteraction': 'Remove interaction',
	'story.entryRemoved': 'Entry removed',
	'story.interactionRemoved': 'Interaction removed',
	'story.showEarlier': 'Show earlier',
	'story.loadFailed': 'Could not load the earlier entries. Try again.'
};

/** The key set every translation of this area has to provide. */
export type StoryMessages = typeof story;
