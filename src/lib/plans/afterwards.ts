import type { MomentDraft } from '../people/story-forms';

/** What of a done idea the moment told of it starts from. */
export interface DoneIdea {
	id: string;
	title: string;
	visibility: 'shared' | 'private';
	hiddenFromPerson: boolean;
	doneOn: string | null;
}

/**
 * The composer's start for a moment about a done outing idea (docs/dev/02 §2.27.8). A surprise
 * starts private: a shared moment would tell the member it was kept from; the writer may share it.
 */
export function momentDraftOf(idea: DoneIdea, today: string): MomentDraft {
	return {
		body: idea.title,
		visibility: idea.visibility === 'private' || idea.hiddenFromPerson ? 'private' : 'shared',
		newPeople: [],
		subjectIds: [],
		planId: idea.id,
		entryDate: idea.doneOn ?? today
	};
}
