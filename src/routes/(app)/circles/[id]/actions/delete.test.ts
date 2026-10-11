import { describe, expect, it } from 'bun:test';
import type { Circle } from '$lib/server/domain/circles/circles';
import { circleRepositoryWith, fixedClock, sequentialIds } from '$lib/server/domain/testing';
import {
	answerOf,
	MEMBER,
	routeEvent,
	type EdgeAnswer,
	type FakeServices
} from '$lib/server/testing';
import { deleteActions as actions } from './delete';

/*
 * Deleting a circle from its header (docs/02 §2.4.2) as the edge answers it: a deletion lands
 * on the circles list, and so does one whose circle is already gone — a gone item is never a
 * failure (§2.23). Who may is `deleteCircle`'s and the repository's; the port here answers as
 * that condition would.
 */

const mine: Circle = {
	id: 'k1',
	householdId: MEMBER.householdId,
	createdBy: MEMBER.id,
	visibility: 'shared',
	name: 'Class 1B',
	description: null,
	kind: 'class',
	color: 'blue',
	startDate: null,
	endDate: null
};

/** `k1` is the viewer's own circle; the deletions the write made are kept. */
function household() {
	const deleted: string[] = [];
	const unlinked: string[] = [];
	const circles = circleRepositoryWith({
		getVisibleTo: async (_viewer, id) => (id === 'k1' ? mine : null),
		deleteDeletable: async (_remover, id) =>
			id === 'k1' && !deleted.includes(id)
				? (deleted.push(id), [{ filePath: 'p1.jpg', thumbPath: 'p1_t.jpg', viewPath: null }])
				: null
	});
	const services: FakeServices = {
		circles: {
			deleteCircleDeps: {
				circles,
				media: { delete: async (path) => void unlinked.push(path) },
				ids: sequentialIds(),
				clock: fixedClock(5000)
			}
		}
	};
	return { services, deleted, unlinked };
}

const post = (services: FakeServices, id = 'k1') =>
	answerOf(actions.deleteCircle(routeEvent({ services, params: { id }, form: new FormData() })));

const TO_LIST: EdgeAnswer = { kind: 'redirect', status: 303, location: '/circles' };

describe('deleteCircle', () => {
	it('deletes the circle with its photos and lands on the circles list', async () => {
		const { services, deleted, unlinked } = household();
		expect(await post(services)).toEqual(TO_LIST);
		expect(deleted).toEqual(['k1']);
		expect(unlinked).toEqual(['p1.jpg', 'p1_t.jpg']);
	});

	it('reads a circle that is already gone as done, and lands on the list too', async () => {
		const { services, deleted } = household();
		await post(services);
		// A second tab, or a second tap after the first went through.
		expect(await post(services)).toEqual(TO_LIST);
		expect(await post(services, 'k2')).toEqual(TO_LIST);
		expect(deleted).toEqual(['k1']);
	});

	it('sends nobody signed in to the login', async () => {
		const { services } = household();
		const answer = await answerOf(
			actions.deleteCircle(
				routeEvent({ services, user: null, params: { id: 'k1' }, form: new FormData() })
			)
		);
		expect(answer.kind).toBe('redirect');
		expect(answer).not.toEqual(TO_LIST);
	});
});
