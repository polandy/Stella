import type { StoryItemView } from './item';

/** The items of one day, in the order the story hands them over. */
export interface StoryDay {
	day: string;
	items: StoryItemView[];
}

/**
 * Split an already-ordered story into consecutive days, one heading each.
 *
 * Consecutive, not keyed: the list arrives ordered from the server, and re-keying by day here
 * would let a broken order quietly file an item under a heading it does not belong to.
 */
export function groupStoryByDay(items: StoryItemView[]): StoryDay[] {
	const days: StoryDay[] = [];
	for (const item of items) {
		const current = days.at(-1);
		if (current === undefined || current.day !== item.day) {
			days.push({ day: item.day, items: [item] });
		} else {
			current.items.push(item);
		}
	}
	return days;
}
