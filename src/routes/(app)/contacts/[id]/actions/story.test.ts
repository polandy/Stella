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

describe('editInteraction', () => {
	/** Anna, whom the viewer sees; `own` is whether the store finds the touchpoint theirs. */
	function editing(own: boolean) {
		const edits: unknown[] = [];
		const services: FakeServices = {
			people: {
				contactDeps: {
					contacts: contactRepositoryWith({
						findByIdVisibleTo: async (_viewer, id) => (id === 'anna' ? ({ id } as Contact) : null)
					})
				},
				contactNames: {
					listBrowsableNamesAmong: async (_viewer: unknown, ids: readonly string[]) =>
						ids.filter((id) => id === 'lea').map((id) => ({ id, displayName: 'Lea' }))
				}
			} as never,
			story: {
				interactionDeps: {
					interactions: {
						findOwn: async () => (own ? { id: 'x1', contactId: 'anna', participantIds: [] } : null),
						updateOwn: async (_author: unknown, edit: unknown) => {
							edits.push(edit);
							return true;
						}
					},
					ids: sequentialIds('i'),
					clock: fixedClock(7)
				}
			} as never
		};
		return { services, edits };
	}

	const fields = {
		id: 'x1',
		kind: 'call',
		happenedAt: '2026-10-09',
		title: ' Phoned ',
		description: '',
		participants: ['lea']
	};
	const send = (services: FakeServices, form: Record<string, string | string[]>, id = 'anna') =>
		answerOf(actions.editInteraction(routeEvent({ services, params: { id }, form: formOf(form) })));

	it('rewrites the touchpoint and returns to the story', async () => {
		const { services, edits } = editing(true);
		expect(await send(services, fields)).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/contacts/anna#section-story'
		});
		expect(edits).toEqual([
			{
				id: 'x1',
				kind: 'call',
				happenedAt: '2026-10-09',
				title: 'Phoned',
				description: null,
				participantIds: ['lea'],
				updatedAt: 7
			}
		]);
	});

	it('answers 404 for one that is gone or not theirs, alike', async () => {
		const { services, edits } = editing(false);
		expect(await send(services, fields)).toEqual({
			kind: 'fail',
			status: 404,
			data: { interactionError: t('errors.interaction.gone') }
		});
		expect(edits).toEqual([]);
	});

	it('says why it refuses a participant it cannot find', async () => {
		const { services, edits } = editing(true);
		expect(await send(services, { ...fields, participants: ['nobody'] })).toEqual({
			kind: 'fail',
			status: 400,
			data: { interactionError: t('errors.interaction.participantNotFound') }
		});
		expect(edits).toEqual([]);
	});

	it('asks for a kind and a day when either is missing', async () => {
		const { services } = editing(true);
		for (const missing of ['kind', 'happenedAt'] as const) {
			const form: Record<string, string | string[]> = { ...fields };
			delete form[missing];
			expect(await send(services, form)).toEqual({
				kind: 'fail',
				status: 400,
				data: { interactionError: t('errors.interaction.needKindAndDay') }
			});
		}
	});

	it('refuses a person the viewer cannot see', async () => {
		const { services, edits } = editing(true);
		expect(await send(services, fields, 'hidden')).toMatchObject({ kind: 'error', status: 404 });
		expect(edits).toEqual([]);
	});
});
