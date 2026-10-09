import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import {
	circleRepositoryWith,
	contactRepositoryWith,
	inMemoryCircleMemberships,
	membership
} from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type EdgeAnswer } from '$lib/server/testing';
import { circleActions as actions } from './circles';

/*
 * Leaving a circle from the person's profile card (docs/02 §2.4.2): only a membership the viewer
 * can see is ended (§3.7), and the page is shown again either way. The use-case has its own suite
 * (`circles.test.ts`); the ports here only answer the way the case needs.
 */

const en = createTranslator('en');
const BACK: EdgeAnswer = { kind: 'redirect', status: 303, location: '/contacts/anna' };

/** Anna, a member of the choir k1 the viewer sees; `person` false hides Anna herself. */
function household(person = true) {
	const removed: [string, string][] = [];
	const circles = circleRepositoryWith({
		removeMembership: async (circleId, contactId) => void removed.push([circleId, contactId])
	});
	const services = {
		people: {
			contactDeps: {
				contacts: contactRepositoryWith({
					findByIdVisibleTo: async (_viewer, id) =>
						person && id === 'anna' ? ({ id } as Contact) : null
				})
			}
		} as never,
		circles: {
			memberRemovalDeps: {
				circles,
				memberships: inMemoryCircleMemberships([membership('k1', 'anna')])
			}
		}
	};
	return { services, removed };
}

const leave = (services: object, form: FormData) =>
	answerOf(actions.leaveCircle(routeEvent({ services, params: { id: 'anna' }, form })));

describe('leaveCircle', () => {
	it('ends the membership the viewer sees and shows the person again', async () => {
		const { services, removed } = household();
		expect(await leave(services, formOf({ circleId: 'k1' }))).toEqual(BACK);
		expect(removed).toEqual([['k1', 'anna']]);
	});

	it('leaves a circle the viewer cannot see alone, and still shows the person', async () => {
		const { services, removed } = household();
		expect(await leave(services, formOf({ circleId: 'hidden' }))).toEqual(BACK);
		expect(removed).toEqual([]);
	});

	it('answers 404 for a person the viewer cannot see, and removes nothing', async () => {
		const { services, removed } = household(false);
		expect(await leave(services, formOf({ circleId: 'k1' }))).toEqual({
			kind: 'error',
			status: 404,
			message: en('errors.contact.notFound')
		});
		expect(removed).toEqual([]);
	});
});
