import { describe, expect, it } from 'bun:test';
import { commandDepsWith } from '#lib/server/domain/testing/index.js';
import { answerOf, formOf, routeEvent } from '#lib/server/testing/index.js';
import { actions } from './+page.server';

/* A tick on `/plans` (docs/dev/02 §2.27.9) names its person in the form and returns to the list. */

describe('donePlan on the list', () => {
	it('ticks the idea of the person the form names and returns to /plans', async () => {
		const ticked: unknown[] = [];
		const services = {
			offline: {
				commandDeps: commandDepsWith({
					'plan.done': async (_actor, payload) => {
						ticked.push(payload);
						return { planId: 'p-1' };
					}
				})
			}
		};
		const answer = await answerOf(
			actions.donePlan(
				routeEvent({ services, params: {}, form: formOf({ planId: 'p-1', contactId: 'c-1' }) })
			)
		);
		expect(answer).toEqual({ kind: 'redirect', status: 303, location: '/plans' });
		expect(ticked).toEqual([{ contactId: 'c-1', planId: 'p-1' }]);
	});
});
