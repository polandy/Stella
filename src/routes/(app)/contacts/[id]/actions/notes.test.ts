import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { Remover } from '$lib/server/access/visibility';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import type { NoteRepository } from '$lib/server/domain/notes/notes';
import { contactRepositoryWith } from '$lib/server/domain/testing';
import {
	answerOf,
	formOf,
	MEMBER,
	routeEvent,
	type EdgeAnswer,
	type FakeServices
} from '$lib/server/testing';
import { noteActions as actions } from './notes';

/*
 * Removing a note (docs/02 §2.5, docs/03 §3.7). The remove is held for the undo window and
 * posted later; gone and not-yours are said alike with a 404, which that post reads as done
 * (docs/02 §2.23). The route only says who is asking — admin or not — and the domain decides.
 */

const t = createTranslator('en');
const BACK: EdgeAnswer = { kind: 'redirect', status: 303, location: '/contacts/anna' };

/** Anna, whom the viewer sees; the store removes `n1` for whoever asks, and remembers who. */
function notes(asked: Remover[]): FakeServices {
	const repo: Pick<NoteRepository, 'findRemovableBy' | 'deleteRemovableBy'> = {
		findRemovableBy: async (remover, id) => {
			asked.push(remover);
			return id === 'n1'
				? {
						id,
						contactId: 'anna',
						person: 'Anna',
						personVisibility: 'shared',
						authorId: remover.id,
						authorName: 'Me'
					}
				: null;
		},
		deleteRemovableBy: async (_remover, id) => id === 'n1'
	};
	return {
		people: {
			contactDeps: {
				contacts: contactRepositoryWith({
					findByIdVisibleTo: async (_viewer, id) => (id === 'anna' ? ({ id } as Contact) : null)
				})
			}
		} as never,
		notes: {
			noteDeps: { notes: repo, ids: { next: () => 'a1' }, clock: { now: () => 1 } }
		} as never
	};
}

const post = (services: FakeServices, id: string, user = MEMBER) =>
	answerOf(
		actions.removeNote(
			routeEvent({ services, user, params: { id: 'anna' }, form: formOf({ id }) }) as never
		)
	);

describe('removeNote', () => {
	it('removes the note and returns to the profile', async () => {
		expect(await post(notes([]), 'n1')).toEqual(BACK);
	});

	it('answers 404 for one gone or not the viewer’s to remove', async () => {
		expect(await post(notes([]), 'gone')).toEqual({
			kind: 'fail',
			status: 404,
			data: { noteError: t('errors.note.gone') }
		});
	});

	it('tells the domain whether the one asking is an admin', async () => {
		const asked: Remover[] = [];
		await post(notes(asked), 'n1');
		await post(notes(asked), 'n1', { ...MEMBER, role: 'admin' });
		expect(asked.map((r) => r.isAdmin)).toEqual([false, true]);
	});
});

/*
 * Editing a note (docs/02 §2.5): the author's alone, online only. Gone and not-yours are said
 * alike with a 404; the route only reads the form and says who is asking.
 */
function editable(written: { id: string; title: string | null; body: string }[]): FakeServices {
	const repo: Pick<NoteRepository, 'findOwn' | 'updateOwn' | 'replaceMentions'> = {
		findOwn: async (_author, id) =>
			id === 'n1' ? { id, contactId: 'anna', visibility: 'shared' } : null,
		updateOwn: async (_author, p) => {
			written.push({ id: p.id, title: p.title, body: p.body });
			return true;
		},
		replaceMentions: async () => {}
	};
	return {
		people: {
			contactDeps: {
				contacts: contactRepositoryWith({
					findByIdVisibleTo: async (_viewer, id) => (id === 'anna' ? ({ id } as Contact) : null)
				})
			},
			directory: { listVisibleTo: async () => [] },
			namesakeContextDeps: {}
		} as never,
		notes: {
			noteDeps: { notes: repo, ids: { next: () => 'a1' }, clock: { now: () => 1 } }
		} as never
	};
}

const edit = (services: FakeServices, fields: Record<string, string>, contact = 'anna') =>
	answerOf(
		actions.editNote(
			routeEvent({ services, user: MEMBER, params: { id: contact }, form: formOf(fields) }) as never
		)
	);

describe('editNote', () => {
	it('rewrites the note and returns to the profile', async () => {
		const written: { id: string; title: string | null; body: string }[] = [];
		expect(await edit(editable(written), { id: 'n1', title: ' T ', body: 'new' })).toEqual(BACK);
		expect(written).toEqual([{ id: 'n1', title: 'T', body: 'new' }]);
	});

	it('answers 404 for a note gone or not the viewer’s to edit', async () => {
		const written: { id: string; title: string | null; body: string }[] = [];
		expect(await edit(editable(written), { id: 'other', body: 'new' })).toEqual({
			kind: 'fail',
			status: 404,
			data: { noteError: t('errors.note.gone') }
		});
		expect(written).toEqual([]);
	});

	it('answers 404 for a person the viewer cannot see', async () => {
		expect(await edit(editable([]), { id: 'n1', body: 'new' }, 'hidden')).toEqual({
			kind: 'error',
			status: 404,
			message: t('errors.contact.notFound')
		});
	});

	it('says why an empty body is refused', async () => {
		expect(await edit(editable([]), { id: 'n1', body: '  ' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { noteError: t('errors.note.empty') }
		});
	});
});
