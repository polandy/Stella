import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { Contact, ContactSummary } from '../contacts/contacts';
import type { NewNote } from './notes';
import { ContactGoneError } from '../contacts/require-visible';
import { AmbiguousMentionError } from '../mentions/resolve-for-audience';
import { writeNote, type WriteNoteDeps } from './write-note';

/*
 * Writing a note on a person (docs/02 §2.5, §2.20.1) as one use-case, so the person page and a
 * note kept on a phone (docs/02 §2.18.1) go through the same checks: the
 * person must be visible, @-mentions resolve only against the note's audience, and a note that
 * names its own subject does not list them as a mention.
 */

const author = { userId: 'u1', householdId: 'h1' };
const person = (
	id: string,
	visibility: 'shared' | 'private' = 'shared',
	createdBy = 'u2'
): ContactSummary & { createdBy: string } => ({
	id,
	displayName: id[0].toUpperCase() + id.slice(1),
	firstName: null,
	lastName: null,
	nickname: null,
	formerName: null,
	jobTitle: null,
	company: null,
	description: null,
	metPlace: null,
	metDate: null,
	visibility,
	avatarPhotoId: null,
	birthDate: null,
	createdBy
});

function fakes(people = [person('julia'), person('marco'), person('sam', 'private', 'u1')]) {
	const notes: NewNote[] = [];
	const mentions = new Map<string, string[]>();
	const visible = (v: Viewer) =>
		people.filter((p) => p.visibility === 'shared' || p.createdBy === v.id);
	const deps: WriteNoteDeps = {
		contacts: {
			async findByIdVisibleTo(v, id) {
				return (visible(v).find((p) => p.id === id) as unknown as Contact) ?? null;
			},
			async listVisibleTo(v) {
				return visible(v);
			}
		},
		notes: {
			insert: async (n) => void notes.push(n),
			listForContactVisibleTo: async () => [],
			replaceMentions: async (id, ids) => void mentions.set(id, ids),
			listMentionedContactIds: async () => []
		},
		ids: { next: () => 'n1' },
		clock: { now: () => 9 }
	};
	return { deps, notes, mentions };
}

describe('writeNote', () => {
	it('stores the note with mentions resolved, leaving out its own subject', async () => {
		const f = fakes();
		const { noteId } = await writeNote(f.deps, author, {
			contactId: 'julia',
			body: '@Julia said @Marco is moving',
			visibility: 'shared',
			isPinned: true
		});

		expect(noteId).toBe('n1');
		expect(f.notes[0]).toMatchObject({
			contactId: 'julia',
			createdBy: 'u1',
			isPinned: true,
			visibility: 'shared'
		});
		expect(f.notes[0].body).toBe('@{contact:julia} said @{contact:marco} is moving');
		expect(f.mentions.get('n1')).toEqual(['marco']);
	});

	it('lets a shared note name only household-visible people; a private one anyone the author sees', async () => {
		const shared = fakes();
		await writeNote(shared.deps, author, {
			contactId: 'julia',
			body: 'with @Sam and @Marco',
			visibility: 'shared',
			isPinned: false
		});
		expect(shared.mentions.get('n1')).toEqual(['marco']);

		const priv = fakes();
		await writeNote(priv.deps, author, {
			contactId: 'julia',
			body: 'with @Sam and @Marco',
			visibility: 'private',
			isPinned: false
		});
		expect(priv.mentions.get('n1')).toEqual(['sam', 'marco']);
	});

	it('asks which one when a typed handle is two people, storing nothing', async () => {
		const thomas = (id: string) => ({ ...person(id), displayName: 'Thomas' });
		const f = fakes([person('julia'), thomas('thomas-hut'), thomas('thomas-lenk')]);
		await expect(
			writeNote(f.deps, author, {
				contactId: 'julia',
				body: 'with @Thomas',
				visibility: 'shared',
				isPinned: false
			})
		).rejects.toBeInstanceOf(AmbiguousMentionError);
		expect(f.notes).toHaveLength(0);

		await writeNote(f.deps, author, {
			contactId: 'julia',
			body: 'with @{contact:thomas-lenk}',
			visibility: 'shared',
			isPinned: false
		});
		expect(f.mentions.get('n1')).toEqual(['thomas-lenk']);
	});

	it('refuses a note on someone the author cannot see (any more), storing nothing', async () => {
		const f = fakes([person('julia'), person('hidden', 'private', 'u2')]);
		await expect(
			writeNote(f.deps, author, {
				contactId: 'hidden',
				body: 'x',
				visibility: 'shared',
				isPinned: false
			})
		).rejects.toBeInstanceOf(ContactGoneError);
		await expect(
			writeNote(f.deps, author, {
				contactId: 'deleted',
				body: 'x',
				visibility: 'shared',
				isPinned: false
			})
		).rejects.toBeInstanceOf(ContactGoneError);
		expect(f.notes).toHaveLength(0);
	});
});
