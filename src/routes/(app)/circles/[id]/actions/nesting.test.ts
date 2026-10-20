import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import {
	circleRepositoryWith,
	fixedClock,
	inMemoryCircleNesting,
	someCircle
} from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { nestingActions as actions } from './nesting';

/*
 * Moving a circle from the sub-circles card (docs/02 §2.4.2): *Add existing*, *Detach*, and the
 * *Undo* of each — and of the edit form's *Belongs to* — all post here. The answer carries the
 * move, so the toast's *Undo* puts back exactly what was there; `moveCircle` has its own suite.
 */

const t = createTranslator('en');

/** The viewer sees `school`, `class` (inside `school`), `team` and `group` (inside `class`). */
function household() {
	const visible = ['school', 'class', 'team', 'group'];
	const writes: { circleId: string; parentId: string | null }[] = [];
	const circles = circleRepositoryWith({
		getVisibleTo: async (_viewer, id) => (visible.includes(id) ? someCircle(id, id) : null),
		setParent: async (_viewer, circleId, parentId) => (writes.push({ circleId, parentId }), true)
	});
	const nesting = inMemoryCircleNesting({
		school: null,
		class: 'school',
		team: null,
		group: 'class',
		hidden: null
	});
	const services: FakeServices = {
		circles: { circleNestingDeps: { circles, nesting, clock: fixedClock(1) } }
	};
	return { services, writes };
}

const post = (services: FakeServices, fields: Record<string, string>, page = 'school') =>
	answerOf(
		actions.moveCircle(routeEvent({ services, params: { id: page }, form: formOf(fields) }))
	);

describe('moveCircle', () => {
	it('adds an existing circle, moving it out of its old parent, and answers the move', async () => {
		const { services, writes } = household();
		expect(await post(services, { circle: 'group', parent: 'school' })).toEqual({
			kind: 'data',
			data: { move: { circleId: 'group', name: 'group', from: 'class', to: 'school' } }
		});
		expect(writes).toEqual([{ circleId: 'group', parentId: 'school' }]);
	});

	it('detaches a sub-circle with an empty parent', async () => {
		const { services, writes } = household();
		expect(await post(services, { circle: 'class', parent: '' })).toMatchObject({
			kind: 'data',
			data: { move: { from: 'school', to: null } }
		});
		expect(writes).toEqual([{ circleId: 'class', parentId: null }]);
	});

	it('refuses a loop, naming the moved circle only', async () => {
		const { services, writes } = household();
		expect(await post(services, { circle: 'school', parent: 'group' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { moveError: t('errors.circle.loop', { name: 'school' }) }
		});
		expect(writes).toEqual([]);
	});

	it('refuses a parent the viewer cannot see', async () => {
		const { services, writes } = household();
		expect(await post(services, { circle: 'team', parent: 'hidden' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { moveError: t('errors.circle.parentNotFound') }
		});
		expect(writes).toEqual([]);
	});

	it('answers 404 for a circle the viewer cannot see', async () => {
		const { services, writes } = household();
		expect(await post(services, { circle: 'hidden', parent: 'school' })).toEqual({
			kind: 'error',
			status: 404,
			message: t('errors.circle.notFound')
		});
		expect(writes).toEqual([]);
	});

	it('refuses a form without a circle, which the page never sends', async () => {
		const { services } = household();
		expect(await post(services, { parent: 'school' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { moveError: t('errors.form.checkAndRetry') }
		});
	});
});
