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
