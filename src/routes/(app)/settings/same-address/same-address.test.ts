import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { sameAddressKey } from '$lib/people/same-address-check';
import type { HomeChange } from '$lib/server/domain/homes/homes';
import type { SameAddressDeps } from '$lib/server/domain/homes/same-address';
import { fixedClock, sequentialIds } from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { actions, load } from './+page.server';

/*
 * *Settings → Data quality → Same address* as the edge answers it (docs/02 §2.17): nothing read
 * until the check is asked for, the posted finding handed to the use-case, a finding gone since
 * the screen was drawn turned into a 404. The use-cases have their own suite; here Lea and Reto
 * share a line.
 */

const t = createTranslator('en');
const LINE = 'Seestrasse 12, 8002 Zürich';
const FOLDED = 'seestrasse 12 8002 zürich';

function household() {
	const applied: HomeChange[] = [];
	const keys: string[] = [];
	let reads = 0;
	const sameAddressDeps: SameAddressDeps = {
		sameAddress: {
			loadVisibleTo: async () => {
				reads += 1;
				return {
					people: [
						{ id: 'lea', displayName: 'Lea Widmer' },
						{ id: 'reto', displayName: 'Reto Widmer' }
					],
					ownLines: ['lea', 'reto'].map((id) => ({
						contactId: id,
						fieldId: `f-${id}`,
						value: LINE,
						label: null,
						meta: null
					})),
					homes: []
				};
			}
		},
		dismissals: {
			listForHousehold: async () => [...keys],
			dismiss: async (entry) => void keys.push(entry.key),
			restore: async (_v, key) => keys.splice(keys.indexOf(key), 1).length === 1
		},
		homes: { apply: async (change) => void applied.push(change) },
		ids: sequentialIds('home-1', 'd-1'),
		clock: fixedClock(5)
	};
	const services: FakeServices = { records: { sameAddressDeps } };
	return { services, applied, keys, reads: () => reads };
}

type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<(typeof actions)['makeOneHome']>[0];

const post = (services: FakeServices, fields: Parameters<typeof formOf>[0]) =>
	routeEvent<ActionEvent>({ services, form: formOf(fields) });

describe('load', () => {
	it('reads nothing until the check is asked for', async () => {
		const h = household();
		const answer = await answerOf(load(routeEvent<LoadEvent>({ services: h.services })));
		expect(answer).toEqual({ kind: 'data', data: { checked: false } });
		expect(h.reads()).toBe(0);
	});

	it('with ?check, lists Lea and Reto at one line', async () => {
		const h = household();
		const answer = await answerOf(
			load(routeEvent<LoadEvent>({ services: h.services, url: '/settings/same-address?check' }))
		);
		expect(answer).toMatchObject({
			kind: 'data',
			data: { checked: true, open: [{ line: LINE, people: [{ id: 'lea' }, { id: 'reto' }] }] }
		});
	});
});

describe('makeOneHome', () => {
	it('makes the posted finding one home', async () => {
		const h = household();
		const answer = await answerOf(
			actions.makeOneHome(
				post(h.services, { folded: FOLDED, contactIds: ['lea', 'reto'], homeId: '' })
			)
		);
		expect(answer).toEqual({ kind: 'data', data: { homeId: 'home-1' } });
		expect(h.applied[0]!.join.map((m) => m.contactId)).toEqual(['lea', 'reto']);
	});

	it('answers 404 for a finding gone since, and writes nothing', async () => {
		const h = household();
		const answer = await answerOf(
			actions.makeOneHome(post(h.services, { folded: 'elsewhere 1', contactIds: ['lea', 'reto'] }))
		);
		expect(answer).toEqual({ kind: 'error', status: 404, message: t('errors.home.notFound') });
		expect(h.applied).toEqual([]);
	});

	it('refuses a post without people', async () => {
		const answer = await answerOf(
			actions.makeOneHome(post(household().services, { folded: FOLDED }))
		);
		expect(answer).toEqual({ kind: 'error', status: 400, message: t('errors.form.checkAndRetry') });
	});
});

describe('Not the same and Ask again', () => {
	it('keeps the answer, and Ask again takes it back', async () => {
		const h = household();
		const declined = await answerOf(
			actions.declineSameAddress(post(h.services, { folded: FOLDED, contactIds: ['lea', 'reto'] }))
		);
		expect(declined).toEqual({ kind: 'data', data: { declined: FOLDED } });
		const key = sameAddressKey(FOLDED, ['lea', 'reto']);
		expect(h.keys).toEqual([key]);

		const back = await answerOf(actions.askAgainSameAddress(post(h.services, { key })));
		expect(back).toEqual({ kind: 'data', data: { askedAgain: key } });
		expect(h.keys).toEqual([]);
	});

	it('answers 404 for an answer the viewer cannot see', async () => {
		const answer = await answerOf(
			actions.askAgainSameAddress(
				post(household().services, { key: sameAddressKey('other 1', ['x', 'y']) })
			)
		);
		expect(answer).toEqual({ kind: 'error', status: 404, message: t('errors.home.notFound') });
	});
});
