import type { JsonCommand } from '$lib/commands/commands';

/*
 * The command a share is saved with (docs/02 §2.18.3): the same ones the person page sends,
 * so the outbox keeps and sends a share exactly as it would a moment, an idea, a to-do or
 * photos added there. The profile photo is not one: it is cropped and posted on its own.
 */

/** What the sheet holds for the target picked, as the writer left it. */
export type ShareDraft =
	| { target: 'moment'; body: string }
	| { target: 'gift'; title: string; url: string }
	| { target: 'todo'; title: string }
	| { target: 'gallery' };

/** Who it is about, who may see it, and the writer's day. */
export interface ShareAbout {
	contactId: string;
	visibility: 'shared' | 'private';
	day: string;
}

/** The command for `draft`, or null when what it needs to say was cleared away. */
export function commandFor(
	draft: ShareDraft,
	{ contactId, visibility, day }: ShareAbout,
	{ id, issuedAt }: { id: string; issuedAt: number }
): JsonCommand | null {
	switch (draft.target) {
		case 'moment': {
			const body = draft.body.trim();
			if (!body) return null;
			return {
				id,
				type: 'moment.capture',
				payload: { body, entryDate: day, visibility, newPeople: [], anchorId: contactId },
				issuedAt
			};
		}
		case 'gift': {
			const title = draft.title.trim();
			if (!title) return null;
			return {
				id,
				type: 'gift.add',
				payload: {
					contactId,
					state: 'idea',
					title,
					note: null,
					url: draft.url.trim() || null,
					givenOn: null,
					occasion: null,
					visibility
				},
				issuedAt
			};
		}
		case 'todo': {
			const title = draft.title.trim();
			if (!title) return null;
			return {
				id,
				type: 'todo.add',
				payload: { contactId, title, dueOn: null, visibility },
				issuedAt
			};
		}
		case 'gallery':
			return { id, type: 'gallery.add', payload: { contactId, visibility }, issuedAt };
	}
}
