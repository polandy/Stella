import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { CircleDeletionFacts } from '$lib/server/domain/circles/delete-circle';
import { circleRepositoryWith } from '$lib/server/domain/testing';
import { answerOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { GET } from './+server';

/*
 * What deleting a circle would take (docs/02 §2.4.2), read only when its confirm step opens:
 * the counts as JSON, or 404 for a circle the viewer may not delete, cannot see, or that is
 * gone. `circleDeletionPreview` has its own suite; the port here answers as the case needs.
 */

const en = createTranslator('en');

const facts: CircleDeletionFacts = {
	name: 'Class 1B',
	visibleMembers: 24,
	photoIds: ['p1', 'p2'],
	cuts: [{ id: 'c1', contactId: 'anna', groupPhotoId: 'p1' }],
	children: [{ id: 'k2', name: 'Reading group', visible: true }]
};

const services: FakeServices = {
	circles: {
		circleDeletionDeps: {
			circles: circleRepositoryWith({
				readDeletion: async (_remover, id) => (id === 'k1' ? facts : null)
			})
		}
	}
};

const read = (id: string) =>
	answerOf(GET(routeEvent<Parameters<typeof GET>[0]>({ services, params: { id } })));

describe('GET /circles/[id]/deletion', () => {
	it('answers what the deletion would take', async () => {
		const answer = await read('k1');
		if (answer.kind !== 'data') throw new Error(`answered ${answer.kind}`);
		expect(await (answer.data as Response).json()).toEqual({
			name: 'Class 1B',
			members: 24,
			photos: 2,
			wornPhotos: 1,
			wearers: 1,
			children: { named: [{ id: 'k2', name: 'Reading group' }], unnamed: 0 }
		});
	});

	it('answers 404 for a circle the viewer may not delete, or one that is gone', async () => {
		expect(await read('k9')).toEqual({
			kind: 'error',
			status: 404,
			message: en('errors.circle.notFound')
		});
	});
});
