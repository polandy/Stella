import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import { contactRepositoryWith, fixedClock, sequentialIds } from '$lib/server/domain/testing';
import {
	answerOf,
	formOf,
	routeEvent,
	type EdgeAnswer,
	type FakeServices
} from '$lib/server/testing';
import { storyActions as actions } from './story';

/*
 * Removing a touchpoint or a journal entry from the story (docs/02 §2.20). The remove is held
 * for the undo window and posted later; a 404 tells that post the item is already gone, which
 * counts as removed (docs/02 §2.23). Gone and someone else's are said alike, as on the journal
 * page, so a foreign id reveals nothing — and the story offers Remove only where the rule allows it.
 */

const t = createTranslator('en');
const BACK: EdgeAnswer = { kind: 'redirect', status: 303, location: '/contacts/anna' };

/** Anna, whom the viewer sees; `deleted` is what the store reports for the removal. */
function story(deleted: boolean): FakeServices {
	const found = deleted
		? {
				id: 'x1',
				contactId: 'anna',
				person: 'Anna',
				personVisibility: 'shared' as const,
				authorId: 'u1',
				authorName: 'Ana'
			}
		: null;
	return {
		people: {
			contactDeps: {
				contacts: contactRepositoryWith({
					findByIdVisibleTo: async (_viewer, id) => (id === 'anna' ? ({ id } as Contact) : null)
				})
			}
		} as never,
		story: {
			interactionDeps: {
				interactions: {
					findRemovableBy: async () => found,
					deleteRemovableBy: async () => deleted
				},
				ids: sequentialIds('activity'),
				clock: fixedClock(0)
			},
			journalDeps: {
				journal: {
					findRemovableBy: async () => found,
					deleteRemovableBy: async () => (deleted ? [] : null)
				},
				media: { delete: async () => {} },
				ids: sequentialIds('activity'),
				clock: fixedClock(0)
			}
		} as never
	};
}

const post = (action: (event: never) => Promise<unknown>, services: FakeServices) =>
	answerOf(action(routeEvent({ services, params: { id: 'anna' }, form: formOf({ id: 'x1' }) })));

describe('removeInteraction', () => {
	it('removes the touchpoint and returns to the profile', async () => {
		expect(await post(actions.removeInteraction, story(true))).toEqual(BACK);
	});

	it('answers 404 for one already gone', async () => {
		expect(await post(actions.removeInteraction, story(false))).toEqual({
			kind: 'fail',
			status: 404,
			data: { interactionError: t('errors.interaction.gone') }
		});
	});
});

describe('removeJournalEntry', () => {
	it('removes the entry and returns to the profile', async () => {
		expect(await post(actions.removeJournalEntry, story(true))).toEqual(BACK);
	});

	it('answers 404 for one already gone', async () => {
		expect(await post(actions.removeJournalEntry, story(false))).toEqual({
			kind: 'fail',
			status: 404,
			data: { interactionError: t('errors.journal.gone') }
		});
	});
});
