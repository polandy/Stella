import { describe, expect, it } from 'bun:test';
import { groupStoryByDay } from './grouping';
import type { StoryItemView } from './item';

/*
 * The timeline draws one heading per day and a rail under it (docs/05 §5.5). The grouping is a
 * pure pass over an already-ordered list, so it lives here rather than inside the component:
 * a page appended after "Show earlier" must extend the last day rather than repeat its heading.
 */

const item = (id: string, day: string): StoryItemView => ({
	kind: 'interaction',
	id,
	day,
	recordedAt: 1,
	author: 'you',
	visibility: 'shared',
	mine: true,
	interactionKind: 'call',
	title: null,
	description: null,
	participants: []
});

describe('groupStoryByDay', () => {
	it('gives each day one heading, in the order the items arrive', () => {
		const groups = groupStoryByDay([
			item('a', '2026-08-05'),
			item('b', '2026-08-05'),
			item('c', '2026-08-03')
		]);

		expect(groups.map((g) => g.day)).toEqual(['2026-08-05', '2026-08-03']);
		expect(groups[0]!.items.map((i) => i.id)).toEqual(['a', 'b']);
		expect(groups[1]!.items.map((i) => i.id)).toEqual(['c']);
	});

	it('keeps a day that comes back later apart, rather than merging it into the earlier one', () => {
		// Only reachable if the order is ever broken; grouping must not paper over it by
		// silently reordering, which would put an item under a heading it does not belong to.
		const groups = groupStoryByDay([
			item('a', '2026-08-05'),
			item('b', '2026-08-03'),
			item('c', '2026-08-05')
		]);

		expect(groups.map((g) => g.day)).toEqual(['2026-08-05', '2026-08-03', '2026-08-05']);
	});

	it('has nothing to group for an empty story', () => {
		expect(groupStoryByDay([])).toEqual([]);
	});
});
