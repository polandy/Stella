/*
 * The Activity card's inline spot on a person's page (docs/05 §5.5): *Write a moment* and *Log
 * contact* open their form at the top of the card, one at a time. Opening one folds the other
 * away; what was typed in it is kept by its owner until it is saved or cancelled.
 */

import type { MomentCapturePayload } from '../commands/commands';

/** What is typed in the moment composer, kept while it is folded away or offered back. */
export type MomentDraft = Pick<MomentCapturePayload, 'body' | 'visibility' | 'newPeople'>;

/** The forms that can open at the top of the Activity card. */
export type StoryForm = 'moment' | 'log';

export function withMomentAsked(current: StoryForm | null): { open: StoryForm; opened: boolean } {
	return { open: 'moment', opened: current !== 'moment' };
}

export function withLogAsked(current: StoryForm | null, wantOpen: boolean): StoryForm | null {
	if (wantOpen) return 'log';
	return current === 'log' ? null : current;
}

/** A cancelled draft worth offering back with *Undo*: one with words in it. */
export function draftWorthUndo<D extends { body: string }>(draft: D | null): D | null {
	return draft && draft.body.trim() ? draft : null;
}
