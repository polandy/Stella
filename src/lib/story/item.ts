import type { InteractionKind } from '$lib/interactions/kinds';

/*
 * What the story timeline renders (docs/02 §2.23). Client-safe: the type lives here so the
 * component and the two server routes that build it agree on one shape, without dragging the
 * server's Markdown renderer into the browser bundle.
 */

/** Fields every story item carries, whoever wrote it. */
interface StoryItemBase {
	id: string;
	/** The day it is about, ISO `YYYY-MM-DD`. */
	day: string;
	recordedAt: number;
	visibility: 'shared' | 'private';
	/** Whether the viewer wrote it — only then is removing it offered. */
	mine: boolean;
}

/** A journal entry: someone wrote about this person on that day. */
export interface StoryJournalItem extends StoryItemBase {
	kind: 'journal';
	title: string | null;
	/** Server-rendered, already-safe Markdown (docs/02 §2.5). */
	bodyHtml: string;
	photos: string[];
}

/** An interaction: someone was in touch with this person on that day. */
export interface StoryInteractionItem extends StoryItemBase {
	kind: 'interaction';
	interactionKind: InteractionKind;
	title: string | null;
	description: string | null;
	participants: { contactId: string; displayName: string }[];
}

export type StoryItemView = StoryJournalItem | StoryInteractionItem;

/** Where each source resumes; mirrors the domain's `StoryResume` across the wire. */
export type StoryResumeView = { day: string; recordedAt: number } | 'top' | 'finished';

export interface StoryCursorView {
	journal: StoryResumeView;
	interactions: StoryResumeView;
}

export interface StoryPageView {
	items: StoryItemView[];
	nextCursor: StoryCursorView | null;
}
