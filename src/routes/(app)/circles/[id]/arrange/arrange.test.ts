import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type {
	ArrangeMember,
	ArrangementPlan,
	RevertPlan
} from '$lib/server/domain/circles/arrange-people';
import {
	fixedClock,
	inMemoryCircleTree,
	sequentialIds,
	treeNode
} from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { actions, load } from './+page.server';

/*
 * The arrange screen's edge (docs/02 §2.4.2, ADR-127): what it loads, and how a post is read and
 * answered. The rules are `arrange-people.test.ts`'s; here a refusal must come back as the
 * reader's words with nothing written, which the recorded plans and reverts prove.
 */

const t = createTranslator('en');
const member = (
	circleId: string,
	contactId: string,
	role: string | null = null
): ArrangeMember => ({
	circleId,
	contactId,
	displayName: contactId,
	avatarPhotoId: null,
	role
});

/** The viewer sees `school` and `class` (inside it); `hidden` is not theirs. */
function household() {
	const plans: ArrangementPlan[] = [];
	const reverts: RevertPlan[] = [];
	const members = [member('school', 'keller'), member('class', 'lena', 'Pupil')];
	const services: FakeServices = {
		circles: {
			circleTreeDeps: {
				tree: inMemoryCircleTree([
					treeNode('school', null, { name: 'School' }),
					treeNode('class', 'school', { name: 'Class' })
				])
			},
			arrangePeopleDeps: {
				tree: inMemoryCircleTree([
					treeNode('school', null, { name: 'School' }),
					treeNode('class', 'school', { name: 'Class' })
				]),
				arrangement: {
					listMembersOfVisibleTo: async (_v, ids) =>
						members.filter((m) => ids.includes(m.circleId)),
					visibleContactIdsAmong: async (_v, ids) => new Set(ids)
				},
				circles: {
					arrange: async (plan) => {
						plans.push(plan);
						return { added: [], removed: [] };
					},
					revert: async (plan) => {
						reverts.push(plan);
						return { removed: 0, kept: 0, restored: 0, conflicts: 0 };
					}
				},
				ids: sequentialIds(),
				clock: fixedClock(1)
			}
		}
	};
	return { services, plans, reverts };
}

const run = (
	services: FakeServices,
	action: 'arrange' | 'undo',
	fields: Record<string, string>,
	page = 'school'
) =>
	answerOf(
		actions[action](
			routeEvent<Parameters<typeof actions.arrange>[0]>({
				services,
				params: { id: page },
				form: formOf(fields)
			})
		)
	);

const picks = (...p: [string, string][]) =>
	JSON.stringify(p.map(([circleId, contactId]) => ({ circleId, contactId })));

describe('load', () => {
	it('hands the cards of the circle and its sub-circles', async () => {
		const { services } = household();
		const answer = await answerOf(
			load(routeEvent<Parameters<typeof load>[0]>({ services, params: { id: 'school' } }))
		);
		if (answer.kind !== 'data') throw new Error(`answered ${answer.kind}`);
		expect(answer.data).toMatchObject({
			circle: { id: 'school', name: 'School' },
			nesting: { ancestors: [] }
		});
		expect((answer.data as { zones: { circleId: string }[] }).zones.map((z) => z.circleId)).toEqual(
			['school', 'class']
		);
	});

	it('is a 404 for a circle the viewer does not see', async () => {
		const { services } = household();
		const answer = await answerOf(
			load(routeEvent<Parameters<typeof load>[0]>({ services, params: { id: 'hidden' } }))
		);
		expect(answer).toMatchObject({ kind: 'error', status: 404 });
	});
});

describe('arrange', () => {
	it('answers the arrangement with its receipt and writes it', async () => {
		const { services, plans } = household();
		const answer = await run(services, 'arrange', {
			mode: 'move',
			target: 'school',
			picks: picks(['class', 'lena'])
		});
		expect(answer).toMatchObject({
			kind: 'data',
			data: { arranged: { mode: 'move', targetName: 'School', change: { added: [], removed: [] } } }
		});
		expect(plans).toHaveLength(1);
		expect(plans[0].removals).toEqual([{ circleId: 'class', contactId: 'lena' }]);
	});

	it.each([
		['an unknown mode', { mode: 'swap', target: 'school', picks: picks(['class', 'lena']) }],
		['no target', { mode: 'move', picks: picks(['class', 'lena']) }],
		['picks that are not JSON', { mode: 'move', target: 'school', picks: '{' }],
		['no picks', { mode: 'move', target: 'school', picks: '[]' }],
		['picks of the wrong shape', { mode: 'move', target: 'school', picks: '[{"circleId":1}]' }]
	])('refuses %s with nothing written', async (_name, fields) => {
		const { services, plans } = household();
		expect(await run(services, 'arrange', fields)).toEqual({
			kind: 'fail',
			status: 400,
			data: { arrangeError: t('errors.form.checkAndRetry') }
		});
		expect(plans).toEqual([]);
	});

	it('refuses too long a batch', async () => {
		const { services, plans } = household();
		const many = JSON.stringify(
			Array.from({ length: 501 }, (_, i) => ({ circleId: 'class', contactId: `c${i}` }))
		);
		const answer = await run(services, 'arrange', { mode: 'move', target: 'school', picks: many });
		expect(answer).toMatchObject({ kind: 'fail', status: 400 });
		expect(plans).toEqual([]);
	});

	it('says a circle outside the screen is gone, and writes nothing', async () => {
		const { services, plans } = household();
		expect(
			await run(services, 'arrange', {
				mode: 'copy',
				target: 'hidden',
				picks: picks(['class', 'lena'])
			})
		).toEqual({
			kind: 'fail',
			status: 400,
			data: { arrangeError: t('errors.circle.arrangeGone') }
		});
		expect(plans).toEqual([]);
	});

	it('says a person who moved meanwhile has changed, and writes nothing', async () => {
		const { services, plans } = household();
		expect(
			await run(services, 'arrange', {
				mode: 'move',
				target: 'school',
				picks: picks(['class', 'ghost'])
			})
		).toMatchObject({ kind: 'fail', data: { arrangeError: t('errors.circle.arrangeStale') } });
		expect(plans).toEqual([]);
	});

	it('says nothing changed when everyone is in the target already', async () => {
		const { services, plans } = household();
		expect(
			await run(services, 'arrange', {
				mode: 'move',
				target: 'class',
				picks: picks(['class', 'lena'])
			})
		).toMatchObject({ kind: 'fail', data: { arrangeError: t('errors.circle.arrangeNothing') } });
		expect(plans).toEqual([]);
	});
});

describe('undo', () => {
	const receipt = (circleId = 'class') =>
		JSON.stringify({
			added: [{ id: 'a1', circleId: 'school', contactId: 'lena', role: null, updatedAt: 1 }],
			removed: [
				{
					id: 'r1',
					circleId,
					contactId: 'lena',
					role: 'Pupil',
					startDate: null,
					endDate: null,
					note: null,
					createdBy: 'u',
					createdAt: 1,
					updatedAt: 1
				}
			]
		});

	it('takes the receipt back and answers what it did', async () => {
		const { services, reverts } = household();
		expect(await run(services, 'undo', { change: receipt() })).toEqual({
			kind: 'data',
			data: { undone: { removed: 0, kept: 0, restored: 0, conflicts: 0 } }
		});
		expect(reverts).toHaveLength(1);
	});

	it('refuses a receipt that names a circle the viewer does not see, and reverts nothing', async () => {
		const { services, reverts } = household();
		expect(await run(services, 'undo', { change: receipt('hidden') })).toEqual({
			kind: 'fail',
			status: 400,
			data: { arrangeError: t('errors.circle.arrangeGone') }
		});
		expect(reverts).toEqual([]);
	});

	it('refuses a post that is not a receipt', async () => {
		const { services, reverts } = household();
		expect(await run(services, 'undo', { change: '{"added":1}' })).toMatchObject({
			kind: 'fail',
			status: 400
		});
		expect(await run(services, 'undo', {})).toMatchObject({ kind: 'fail', status: 400 });
		expect(reverts).toEqual([]);
	});
});
