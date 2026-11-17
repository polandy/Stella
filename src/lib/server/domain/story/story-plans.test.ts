import { describe, expect, it } from 'bun:test';
import type { DonePlan } from '../plans/plans';
import type { StorySource } from './story';
import { mergeStory } from './story';

/*
 * Done outing ideas in a person's story (docs/dev/02 §2.23, §2.27.8): each stands on the day it
 * was ticked, recorded at the tick, and pages like the other sources.
 */

function outing(day: string, doneAt: number, momentId: string | null = null): DonePlan {
	return {
		id: `p-${day}-${doneAt}`,
		contactId: 'c1',
		createdBy: 'u1',
		visibility: 'shared',
		hiddenFromPerson: false,
		title: 'Climbing hall',
		note: null,
		url: null,
		when: null,
		bookedAt: null,
		bookedBy: null,
		doneAt,
		doneOn: day,
		doneBy: 'u1',
		momentId,
		createdAt: 0,
		updatedAt: doneAt
	};
}

const whole = <T>(items: T[]): StorySource<T> => ({ items, exhausted: true, resumeFrom: 'top' });
const none = <T>(): StorySource<T> => whole<T>([]);

describe('done outing ideas in the story', () => {
	it('reads a done idea on the day it was ticked, with the moment written about it', () => {
		const page = mergeStory({
			journal: none(),
			interactions: none(),
			gifts: none(),
			todos: none(),
			plans: whole([outing('2026-03-09', 9, 'entry-1'), outing('2026-03-01', 1)]),
			limit: 10
		});
		expect(page.items.map((i) => i.kind)).toEqual(['plan', 'plan']);
		expect(page.items[0]).toMatchObject({
			kind: 'plan',
			day: '2026-03-09',
			recordedAt: 9,
			plan: { momentId: 'entry-1' }
		});
		expect(page.nextCursor).toBeNull();
	});

	it('resumes the done ideas after the last one shown', () => {
		const page = mergeStory({
			journal: none(),
			interactions: none(),
			gifts: none(),
			todos: none(),
			plans: { ...whole([outing('2026-03-09', 9), outing('2026-03-01', 1)]), exhausted: false },
			limit: 1
		});
		expect(page.nextCursor).toEqual({
			journal: 'finished',
			interactions: 'finished',
			gifts: 'finished',
			todos: 'finished',
			plans: { day: '2026-03-09', recordedAt: 9 }
		});
	});
});
