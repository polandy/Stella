import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { NewCircle } from '$lib/server/domain/circles/circles';
import {
	circleRepositoryWith,
	fixedClock,
	sequentialIds,
	someCircle
} from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { actions } from './+page.server';
import { actions as circlePageActions } from './[id]/+page.server';

/*
 * Making a circle from a screen (docs/02 §2.4.2) as the edge answers it: the list's *New circle*
 * and the sub-circles card's *New sub-circle*, each with an optional *Belongs to*. The checks are
 * `createCircle`'s; the ports here only answer as the case needs.
 */

const t = createTranslator('en');

/** The viewer sees `school` only; every insert is kept. */
function household() {
	const inserted: NewCircle[] = [];
	const circles = circleRepositoryWith({
		getVisibleTo: async (_viewer, id) => (id === 'school' ? someCircle(id, 'School') : null),
		insert: async (row) => {
			inserted.push(row);
		}
	});
	const services: FakeServices = {
		circles: { circleDeps: { circles, ids: sequentialIds('new'), clock: fixedClock(1) } }
	};
	return { services, inserted };
}

const create = (services: FakeServices, fields: Record<string, string>) =>
	answerOf(actions.create(routeEvent({ services, form: formOf(fields) })));

const createSub = (services: FakeServices, fields: Record<string, string>) =>
	answerOf(
		circlePageActions.createSubCircle(
			routeEvent({ services, params: { id: 'school' }, form: formOf(fields) })
		)
	);

describe('create', () => {
	it('makes a circle that stands for itself when Belongs to is left at none', async () => {
		const { services, inserted } = household();
		expect(await create(services, { name: 'Book club', parent: '' })).toMatchObject({
			kind: 'redirect',
			location: `/circles/${inserted[0]?.id}`
		});
		expect(inserted).toMatchObject([{ name: 'Book club', parentCircleId: null }]);
	});

	it('makes a circle inside the one Belongs to names', async () => {
		const { services, inserted } = household();
		await create(services, { name: 'Class 3a', kind: 'class', parent: 'school' });
		expect(inserted).toMatchObject([{ name: 'Class 3a', kind: 'class', parentCircleId: 'school' }]);
	});

	it('refuses a parent the viewer cannot see, creating nothing', async () => {
		const { services, inserted } = household();
		expect(await create(services, { name: 'Class 3a', parent: 'secret' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: t('errors.circle.parentNotFound') }
		});
		expect(inserted).toEqual([]);
	});

	it('refuses a circle without a name', async () => {
		const { services, inserted } = household();
		expect(await create(services, { name: ' ' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: t('errors.circle.needCircleName') }
		});
		expect(inserted).toEqual([]);
	});
});

describe('createSubCircle', () => {
	it('makes the sub-circle and opens it', async () => {
		const { services, inserted } = household();
		const answer = await createSub(services, { name: 'Class 3a', kind: 'class', parent: 'school' });
		expect(inserted).toMatchObject([{ name: 'Class 3a', parentCircleId: 'school' }]);
		expect(answer).toEqual({
			kind: 'redirect',
			status: 303,
			location: `/circles/${inserted[0]?.id}`
		});
	});

	it('says a refusal under the card, not over the members', async () => {
		const { services, inserted } = household();
		expect(await createSub(services, { name: 'Class 3a', parent: 'secret' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { createError: t('errors.circle.parentNotFound') }
		});
		expect(inserted).toEqual([]);
	});
});
