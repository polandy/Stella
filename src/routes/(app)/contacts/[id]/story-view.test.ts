import { describe, expect, it } from 'bun:test';
import { toStoryItem, type StoryViewContext } from './story-view';
import type { StoryItem } from '$lib/server/domain/story/story';

/*
 * What the story timeline is handed (docs/02 §2.23). The merge decides the order; this decides
 * what each item says — including which of them offers a remove button, which is an
 * authorization statement rendered as a control.
 */

const VIEWER = 'user-1';

function context(overrides: Partial<StoryViewContext> = {}): StoryViewContext {
	return {
		userId: VIEWER,
		photosByEntry: new Map(),
		nameOf: () => null,
		nameOfAuthor: () => null,
		...overrides
	};
}

function journalItem(overrides: Record<string, unknown> = {}): StoryItem {
	return {
		kind: 'journal',
		day: '2026-08-05',
		recordedAt: 500,
		entry: {
			id: 'j1',
			contactId: 'c1',
			createdBy: VIEWER,
			visibility: 'shared',
			entryDate: '2026-08-05',
			title: null,
			body: 'Played the piece all the way through.',
			createdAt: 500,
			updatedAt: 500,
			...overrides
		}
	};
}

function interactionItem(overrides: Record<string, unknown> = {}): StoryItem {
	return {
		kind: 'interaction',
		day: '2026-08-04',
		recordedAt: 400,
		interaction: {
			id: 'i1',
			contactId: 'c1',
			createdBy: VIEWER,
			visibility: 'shared',
			kind: 'call',
			happenedAt: '2026-08-04',
			title: 'Quick call',
			description: null,
			participants: [],
			createdAt: 400,
			updatedAt: 400,
			...overrides
		}
	};
}

describe('toStoryItem, journal entries', () => {
	it('renders the body as safe HTML and keeps the day the entry is about', () => {
		const view = toStoryItem(journalItem(), context());

		expect(view.kind).toBe('journal');
		expect(view).toMatchObject({ id: 'j1', day: '2026-08-05', recordedAt: 500 });
		if (view.kind !== 'journal') throw new Error('expected a journal item');
		expect(view.bodyHtml).toContain('Played the piece all the way through.');
		expect(view.bodyHtml).not.toContain('<script');
	});

	it('resolves an @-mention token to the name the viewer is allowed to see', () => {
		const view = toStoryItem(
			journalItem({ body: 'Went with @{contact:lena} to the lake.' }),
			context({ nameOf: (id) => (id === 'lena' ? 'Lena Brunner' : null) })
		);

		if (view.kind !== 'journal') throw new Error('expected a journal item');
		expect(view.bodyHtml).toContain('Lena Brunner');
		expect(view.bodyHtml).toContain('/contacts/lena');
	});

	it('leaves a mention of someone the viewer may not see unnamed', () => {
		const view = toStoryItem(
			journalItem({ body: 'Saw @{contact:secret} at the lake.' }),
			context({ nameOf: () => null })
		);

		if (view.kind !== 'journal') throw new Error('expected a journal item');
		expect(view.bodyHtml).toContain('mention-unknown');
		expect(view.bodyHtml).not.toContain('secret');
	});

	it('attaches only the photos of that entry', () => {
		const view = toStoryItem(
			journalItem(),
			context({ photosByEntry: new Map([['j1', ['p1', 'p2']], ['j2', ['p9']]]) })
		);

		if (view.kind !== 'journal') throw new Error('expected a journal item');
		expect(view.photos).toEqual(['p1', 'p2']);
	});

	it('offers no photos for an entry that has none', () => {
		const view = toStoryItem(journalItem(), context({ photosByEntry: new Map([['other', ['p1']]]) }));

		if (view.kind !== 'journal') throw new Error('expected a journal item');
		expect(view.photos).toEqual([]);
	});
});

describe('toStoryItem, touchpoints', () => {
	it('carries the kind, title and participants the timeline draws', () => {
		const view = toStoryItem(
			interactionItem({
				kind: 'gift',
				participants: [{ contactId: 'c2', displayName: 'Markus', avatarPhotoId: null }]
			}),
			context()
		);

		expect(view.kind).toBe('interaction');
		if (view.kind !== 'interaction') throw new Error('expected an interaction item');
		expect(view.interactionKind).toBe('gift');
		expect(view.title).toBe('Quick call');
		expect(view.participants).toEqual([{ contactId: 'c2', displayName: 'Markus' }]);
	});
});

describe('toStoryItem, who wrote it', () => {
	it('names the viewer "you" on their own entry', () => {
		const view = toStoryItem(journalItem(), context({ nameOfAuthor: () => 'Markus Brunner' }));

		expect(view.author).toBe('you');
	});

	it('names the other member on an entry they wrote', () => {
		const view = toStoryItem(
			journalItem({ createdBy: 'user-2' }),
			context({ nameOfAuthor: (id) => (id === 'user-2' ? 'Lena Brunner' : null) })
		);

		expect(view.author).toBe('Lena');
	});

	it('names nobody when the author has left the household', () => {
		const view = toStoryItem(
			journalItem({ createdBy: 'gone' }),
			context({ nameOfAuthor: () => null })
		);

		expect(view.author).toBeNull();
	});

	it('names the author of a touchpoint the same way', () => {
		const view = toStoryItem(
			interactionItem({ createdBy: 'user-2' }),
			context({ nameOfAuthor: () => 'Lena Brunner' })
		);

		expect(view.author).toBe('Lena');
	});
});

describe('toStoryItem, who may remove what', () => {
	/*
	 * `mine` is what decides whether a remove button is drawn. The server refuses either way,
	 * but drawing a control that always fails is its own defect.
	 */
	it('marks the viewer’s own items as theirs, and other people’s as not', () => {
		expect(toStoryItem(journalItem(), context()).mine).toBe(true);
		expect(toStoryItem(journalItem({ createdBy: 'someone-else' }), context()).mine).toBe(false);
		expect(toStoryItem(interactionItem(), context()).mine).toBe(true);
		expect(toStoryItem(interactionItem({ createdBy: 'someone-else' }), context()).mine).toBe(false);
	});

	it('carries visibility through, so a private item can be marked as one', () => {
		expect(toStoryItem(journalItem({ visibility: 'private' }), context()).visibility).toBe('private');
		expect(toStoryItem(interactionItem({ visibility: 'private' }), context()).visibility).toBe(
			'private'
		);
	});
});
