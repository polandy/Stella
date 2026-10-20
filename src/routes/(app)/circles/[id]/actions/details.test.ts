import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { CircleDetails } from '$lib/server/domain/circles/circles';
import {
	circleRepositoryWith,
	fixedClock,
	inMemoryCircleNesting,
	someCircle
} from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { detailsActions as actions } from './details';

/*
 * Editing a circle's details from its header (docs/02 §2.4.2) as the edge answers it: the save,
 * the circle it belongs to, a refusal said in the reader's language under the form, a circle that
 * is gone, and a form the page did not make. `updateCircle` and `moveCircle` have their own
 * suites; the ports here only answer as the case needs.
 */

const t = createTranslator('en');
const NOW = 5000;

/**
 * The circle page's ports: the viewer sees `k1`, its sub-circle `group` and `school`, but not
 * `hidden`. The detail writes and the parent writes are kept.
 */
function household() {
	const visible = ['k1', 'school', 'group'];
	const written: CircleDetails[] = [];
	const parents: { circleId: string; parentId: string | null }[] = [];
	const circles = circleRepositoryWith({
		getVisibleTo: async (_viewer, id) => (visible.includes(id) ? someCircle(id, id) : null),
		update: async (_viewer, id, details) => visible.includes(id) && (written.push(details), true),
		setParent: async (_viewer, circleId, parentId) => (parents.push({ circleId, parentId }), true)
	});
	const nesting = inMemoryCircleNesting({ k1: null, school: null, group: 'k1' });
	const services: FakeServices = {
		circles: { updateCircleDeps: { circles, nesting, clock: fixedClock(NOW) } }
	};
	return { services, written, parents };
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

	it('puts the circle where Belongs to says, and takes it out with an empty one', async () => {
		const { services, parents } = household();
		expect(await post(services, formOf({ ...FULL, parent: 'school' }))).toMatchObject({
			kind: 'redirect'
		});
		expect(parents).toEqual([{ circleId: 'k1', parentId: 'school' }]);

		await post(services, formOf({ ...FULL, parent: '' }), 'group');
		expect(parents.at(-1)).toEqual({ circleId: 'group', parentId: null });
	});

	it('leaves the parent alone when the form sends none', async () => {
		const { services, parents } = household();
		await post(services, formOf(FULL));
		expect(parents).toEqual([]);
	});

	it('refuses a parent inside the circle itself under the field, saving nothing', async () => {
		const { services, written, parents } = household();
		expect(await post(services, formOf({ ...FULL, parent: 'group' }))).toEqual({
			kind: 'fail',
			status: 400,
			data: { parentError: t('errors.circle.loop', { name: 'k1' }) }
		});
		expect(written).toEqual([]);
		expect(parents).toEqual([]);
	});

	it('refuses a parent the viewer cannot see under the field', async () => {
		const { services, written } = household();
		expect(await post(services, formOf({ ...FULL, parent: 'hidden' }))).toEqual({
			kind: 'fail',
			status: 400,
			data: { parentError: t('errors.circle.parentNotFound') }
		});
		expect(written).toEqual([]);
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
