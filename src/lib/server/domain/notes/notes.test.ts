import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import {
	createNote,
	setNoteMentions,
	type NewNote,
	type NoteCreator,
	type NoteRepository
} from './notes';

/*
 * The createNote use-case: require a body, apply the creator's default visibility,
 * normalise the title, and persist via the port. Pure orchestration with fakes.
 */

const NOW = 1_700_000_000_000;
const clock: Clock = { now: () => NOW };
const idGen = (v: string): IdGenerator => ({ next: () => v });

function fakeRepo() {
	let inserted: NewNote | null = null;
	let mentions: { noteId: string; contactIds: string[] } | null = null;
	const repo: NoteRepository = {
		insert: async (note) => {
			inserted = note;
		},
		listForContactVisibleTo: async () => [],
		replaceMentions: async (noteId, contactIds) => {
			mentions = { noteId, contactIds };
		},
		listMentionedContactIds: async () => mentions?.contactIds ?? []
	};
	return {
		repo,
		get inserted() {
			return inserted;
		},
		get mentions() {
			return mentions;
		}
	};
}

const creator: NoteCreator = { userId: 'user-1', householdId: 'household-1', defaultVisibility: 'shared' };
const deps = (repo: NoteRepository) => ({ notes: repo, ids: idGen('note-1'), clock });

describe('createNote', () => {
	it('persists a note on a contact with default visibility and timestamps', async () => {
		const f = fakeRepo();
		const id = await createNote(deps(f.repo), creator, {
			contactId: 'contact-1',
			title: 'First meeting',
			body: 'Met at the lake.'
		});
		expect(id).toBe('note-1');
		expect(f.inserted).toMatchObject({
			id: 'note-1',
			contactId: 'contact-1',
			createdBy: 'user-1',
			visibility: 'shared',
			title: 'First meeting',
			body: 'Met at the lake.',
			isPinned: false,
			createdAt: NOW
		});
	});

	it('rejects an empty body', async () => {
		const f = fakeRepo();
		await expect(createNote(deps(f.repo), creator, { contactId: 'c', body: '   ' })).rejects.toThrow();
	});

	it('respects an explicit visibility and pin', async () => {
		const f = fakeRepo();
		await createNote(deps(f.repo), creator, {
			contactId: 'c',
			body: 'secret',
			visibility: 'private',
			isPinned: true
		});
		expect(f.inserted).toMatchObject({ visibility: 'private', isPinned: true });
	});

	it('normalises a blank title to null', async () => {
		const f = fakeRepo();
		await createNote(deps(f.repo), creator, { contactId: 'c', title: '  ', body: 'x' });
		expect(f.inserted?.title).toBeNull();
	});
});

describe('setNoteMentions', () => {
	it('replaces the links with the unique ids it was given', async () => {
		const f = fakeRepo();
		await setNoteMentions({ notes: f.repo }, 'note-1', ['c-a', 'c-b', 'c-a']);
		expect(f.mentions).toEqual({ noteId: 'note-1', contactIds: ['c-a', 'c-b'] });
	});

	it('clears the links when nobody is referenced any more', async () => {
		const f = fakeRepo();
		await setNoteMentions({ notes: f.repo }, 'note-1', []);
		expect(f.mentions).toEqual({ noteId: 'note-1', contactIds: [] });
	});
});
