import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import {
	circleRepositoryWith,
	contactRepositoryWith,
	fixedClock,
	inMemoryCircleMemberships,
	membership
} from '$lib/server/domain/testing';
import type { Locale } from '$lib/i18n/locales';
import { answerOf, formOf, routeEvent, type EdgeAnswer } from '$lib/server/testing';
import { circleActions as actions } from './circles';

/*
 * Re-roling and leaving a circle from the person's profile card (docs/02 §2.4.2): only a
 * membership the viewer can see is changed or ended (§3.7), and the page is shown again either
 * way. The use-cases have their own suite (`circles.test.ts`); the ports here only answer the way
 * the case needs.
 */

const en = createTranslator('en');
const de = createTranslator('de');
const BACK: EdgeAnswer = { kind: 'redirect', status: 303, location: '/contacts/anna' };

/** Anna, a member of the choir k1 the viewer sees; `person` false hides Anna herself. */
function household(person = true) {
	const removed: [string, string][] = [];
	const reroled: [string, string[], string | null][] = [];
	const circles = circleRepositoryWith({
		removeMembership: async (circleId, contactId) => void removed.push([circleId, contactId]),
		setRoles: async (circleId, ids, role) => void reroled.push([circleId, [...ids], role])
	});
	const memberships = inMemoryCircleMemberships([membership('k1', 'anna')]);
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
			memberRemovalDeps: { circles, memberships },
			memberRoleDeps: { circles, memberships, clock: fixedClock(5000) }
		}
	};
	return { services, removed, reroled };
}

const leave = (services: object, form: FormData, locale: Locale = 'en') =>
	answerOf(actions.leaveCircle(routeEvent({ services, params: { id: 'anna' }, form, locale })));

const reRole = (services: object, form: FormData, locale: Locale = 'en') =>
	answerOf(actions.setCircleRole(routeEvent({ services, params: { id: 'anna' }, form, locale })));

/** The refusal shown under the circles card, with its status. */
const refused = (circleError: string): EdgeAnswer => ({
	kind: 'fail',
	status: 400,
	data: { circleError }
});

describe('setCircleRole', () => {
	it('gives the person the role in that circle and shows them again', async () => {
		const { services, reroled } = household();
		expect(await reRole(services, formOf({ circleId: 'k1', role: ' Alto ' }))).toEqual(BACK);
		expect(reroled).toEqual([['k1', ['anna'], 'Alto']]);
	});

	it('asks to check the form when it names no circle, in the reader’s words', async () => {
		const { services, reroled } = household();
		for (const [locale, t] of [
			['en', en],
			['de', de]
		] as const) {
			expect(await reRole(services, formOf({ role: 'Alto' }), locale)).toEqual(
				refused(t('errors.form.checkAndRetry'))
			);
		}
		expect(reroled).toEqual([]);
	});
});

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

	it('asks to check the form when it names no circle, in the reader’s words', async () => {
		const { services, removed } = household();
		for (const [locale, t] of [
			['en', en],
			['de', de]
		] as const) {
			expect(await leave(services, formOf({}), locale)).toEqual(
				refused(t('errors.form.checkAndRetry'))
			);
		}
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
