import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { CircleDetails } from '$lib/server/domain/circles/circles';
import { circleRepositoryWith, fixedClock, sequentialIds } from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { detailsActions as actions } from './details';

/*
 * Editing a circle's details from its header (docs/02 §2.4.2) as the edge answers it: the save,
 * a refusal said in the reader's language under the form, a circle that is gone, and a form the
 * page did not make. `updateCircle` has its own suite; the port here only answers as the case needs.
 */

const t = createTranslator('en');
const NOW = 5000;

/** The circle page's ports, with `k1` the one circle the viewer sees; the writes are kept. */
function household() {
	const written: CircleDetails[] = [];
	const circles = circleRepositoryWith({
		update: async (_viewer, id, details) => id === 'k1' && (written.push(details), true)
	});
	const services: FakeServices = {
		circles: { circleDeps: { circles, ids: sequentialIds(), clock: fixedClock(NOW) } }
	};
	return { services, written };
}

const post = (services: FakeServices, form: FormData, id = 'k1') =>
	answerOf(actions.updateCircle(routeEvent({ services, params: { id }, form })));

const FULL = {
	name: ' Class 2B ',
	kind: 'class',
	color: 'mauve',
	description: 'Primarschule',
	startDate: '2026-08-17',
	endDate: '2027-07-02'
};

describe('updateCircle', () => {
	it('saves the details and goes back to the circle', async () => {
		const { services, written } = household();
		expect(await post(services, formOf(FULL))).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/circles/k1'
		});
		expect(written).toEqual([
			{
				name: 'Class 2B',
				kind: 'class',
				color: 'mauve',
				description: 'Primarschule',
				startDate: '2026-08-17',
				endDate: '2027-07-02'
			}
		]);
	});

	it('refuses a blank name under the form', async () => {
		const { services, written } = household();
		expect(await post(services, formOf({ ...FULL, name: '  ' }))).toEqual({
			kind: 'fail',
			status: 400,
			data: { detailsError: t('errors.circle.needName') }
		});
		expect(written).toEqual([]);
	});

	it('refuses a period that ends before it starts', async () => {
		const { services } = household();
		expect(
			await post(services, formOf({ ...FULL, startDate: '2027-08-01', endDate: '2027-07-01' }))
		).toEqual({
			kind: 'fail',
			status: 400,
			data: { detailsError: t('errors.circle.periodBackwards') }
		});
	});

	it('answers 404 for a circle the viewer cannot see, or one that is gone', async () => {
		const { services } = household();
		expect(await post(services, formOf(FULL), 'k2')).toEqual({
			kind: 'error',
			status: 404,
			message: t('errors.circle.notFound')
		});
	});

	it('refuses a form without a name, which the page never sends', async () => {
		const { services } = household();
		const { name: _name, ...withoutName } = FULL;
		expect(await post(services, formOf(withoutName))).toEqual({
			kind: 'fail',
			status: 400,
			data: { detailsError: t('errors.form.checkAndRetry') }
		});
	});
});
