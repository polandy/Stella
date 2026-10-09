import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import type {
	NewSurnameDismissal,
	SurnameListPerson
} from '$lib/server/domain/contacts/last-names';
import { fixedClock, inMemoryKinshipGraph, sequentialIds } from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { actions, load } from './+page.server';

/*
 * *Settings → Data quality → Last names* as the edge answers it (docs/02 §2.2.4.2): the list
 * and its two drawers, *Not this name* and *No last name* with their ways back, each refusal
 * turned into a status. The use-cases have their own suites; the household here is Markus
 * Brunner, his son Ben, and Jonas, whom nothing names.
 */

const t = createTranslator('en');

const listed = (
	id: string,
	lastName: string | null,
	withoutLastNameAt: number | null = null
): SurnameListPerson => ({
	id,
	displayName: lastName ? `${id} ${lastName}` : id,
	firstName: id,
	lastName,
	nickname: null,
	formerName: null,
	avatarPhotoId: null,
	isDeceased: false,
	archived: false,
	withoutLastNameAt
});

function household(
	people: SurnameListPerson[] = [
		listed('markus', 'Brunner'),
		listed('ben', null),
		listed('jonas', null)
	]
) {
	const marks: { id: string; at: number | null }[] = [];
	const dismissed: NewSurnameDismissal[] = [];
	const contacts = {
		findByIdVisibleTo: async (_v: unknown, id: string) => {
			const p = people.find((candidate) => candidate.id === id);
			return p ? ({ id: p.id, lastName: p.lastName, displayName: p.displayName } as Contact) : null;
		},
		markWithoutLastName: async (id: string, at: number | null) => {
			marks.push({ id, at });
		}
	};
	const surnameDismissals = {
		listForHousehold: async () => dismissed.map(({ contactId, folded }) => ({ contactId, folded })),
		dismiss: async (entry: NewSurnameDismissal) => {
			dismissed.push(entry);
		},
		restore: async () => true
	};
	const services: FakeServices = {
		people: {
			surnameReviewDeps: {
				surnames: { loadSurnameFactsVisibleTo: async () => ({ people, familyCircles: [] }) },
				kinship: inMemoryKinshipGraph({
					people: people.map((p) => ({ id: p.id, displayName: p.displayName })),
					parentEdges: [{ parentId: 'markus', childId: 'ben' }]
				}),
				surnameDismissals
			},
			surnameDismissalDeps: {
				names: { ...contacts, writeNames: async () => {} },
				surnameDismissals,
				ids: sequentialIds('d'),
				clock: fixedClock(7)
			},
			withoutLastNameDeps: { withoutLastName: contacts, clock: fixedClock(7) }
		}
	};
	return { services, marks, dismissed };
}

type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<(typeof actions)['settleWithoutLastName']>[0];

const post = (services: FakeServices, fields: Record<string, string>) =>
	routeEvent<ActionEvent>({ services, form: formOf(fields) });

describe('load', () => {
	it('lists Ben under Brunner and Jonas with a field, and an empty drawer (control)', async () => {
		const answer = await answerOf(load(routeEvent<LoadEvent>({ services: household().services })));
		expect(answer).toMatchObject({
			kind: 'data',
			data: {
				groups: [{ name: 'Brunner', rows: [{ person: { id: 'ben' } }] }],
				none: [{ id: 'jonas' }],
				settled: []
			}
		});
	});

	it('takes a settled person off the list and into the drawer', async () => {
		const h = household([
			listed('markus', 'Brunner'),
			listed('ben', null),
			listed('jonas', null, 3)
		]);
		const answer = await answerOf(load(routeEvent<LoadEvent>({ services: h.services })));
		expect(answer).toMatchObject({
			kind: 'data',
			data: { none: [], settled: [{ contactId: 'jonas', personName: 'jonas' }] }
		});
	});
});

describe('settleWithoutLastName', () => {
	it('settles a person the viewer may see', async () => {
		const h = household();
		const answer = await answerOf(
			actions.settleWithoutLastName(post(h.services, { contactId: 'jonas' }))
		);
		expect(answer).toEqual({ kind: 'data', data: { settled: 'jonas' } });
		expect(h.marks).toEqual([{ id: 'jonas', at: 7 }]);
	});

	it('answers 404 for a person the viewer may not see, and writes nothing', async () => {
		const h = household();
		const answer = await answerOf(
			actions.settleWithoutLastName(post(h.services, { contactId: 'nobody' }))
		);
		expect(answer).toEqual({ kind: 'error', status: 404, message: t('errors.contact.notFound') });
		expect(h.marks).toEqual([]);
	});

	it('refuses a post without a person', async () => {
		const answer = await answerOf(actions.settleWithoutLastName(post(household().services, {})));
		expect(answer).toEqual({ kind: 'error', status: 400, message: t('errors.form.checkAndRetry') });
	});
});

describe('askAgainForLastName', () => {
	it('takes the mark back for a person the viewer may see', async () => {
		const h = household();
		const answer = await answerOf(
			actions.askAgainForLastName(post(h.services, { contactId: 'jonas' }))
		);
		expect(answer).toEqual({ kind: 'data', data: { askedAgain: 'jonas' } });
		expect(h.marks).toEqual([{ id: 'jonas', at: null }]);
	});

	it('answers 404 for a person the viewer may not see', async () => {
		const h = household();
		const answer = await answerOf(
			actions.askAgainForLastName(post(h.services, { contactId: 'nobody' }))
		);
		expect(answer).toEqual({ kind: 'error', status: 404, message: t('errors.contact.notFound') });
		expect(h.marks).toEqual([]);
	});
});

describe('dismissLastName', () => {
	it('keeps the household’s *no* for that person and that name', async () => {
		const h = household();
		const answer = await answerOf(
			actions.dismissLastName(post(h.services, { contactId: 'ben', lastName: 'Brunner' }))
		);
		expect(answer).toEqual({ kind: 'data', data: { dismissed: 'ben' } });
		expect(h.dismissed.map((d) => [d.contactId, d.folded])).toEqual([['ben', 'brunner']]);
	});

	it('answers 404 for a person the viewer may not see', async () => {
		const h = household();
		const answer = await answerOf(
			actions.dismissLastName(post(h.services, { contactId: 'nobody', lastName: 'Brunner' }))
		);
		expect(answer).toEqual({ kind: 'error', status: 404, message: t('errors.contact.notFound') });
		expect(h.dismissed).toEqual([]);
	});
});
