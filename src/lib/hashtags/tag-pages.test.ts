import { describe, expect, it } from 'bun:test';
import type { KnownTag } from './picker';
import { HOME_TAG_LIMIT, homeTagChips, tagNarrowing, tagSummary } from './tag-pages';

/*
 * Where a tag is read across the household (docs/02 §2.20.2): Home's Tags row and the line under
 * it, and the head of a tag's own page. The tags come scoped and counted from the shell, most
 * used first; nothing here widens what the viewer may see.
 */

const tag = (name: string, count: number, onlyPrivate = false): KnownTag => ({
	name,
	key: name.toLowerCase(),
	count,
	onlyPrivate
});
const tags = Array.from({ length: 10 }, (_, i) => tag(`T${i}`, 20 - i));

describe('homeTagChips', () => {
	it('offers the most used tags, up to the limit, in the order they come', () => {
		expect(homeTagChips(tags, null).map((t) => t.name)).toEqual(
			tags.slice(0, HOME_TAG_LIMIT).map((t) => t.name)
		);
		expect(HOME_TAG_LIMIT).toBe(8);
	});

	it('keeps the chosen tag in the row even when it is not among the most used', () => {
		const chips = homeTagChips(tags, 't9');
		expect(chips).toHaveLength(HOME_TAG_LIMIT + 1);
		expect(chips.at(-1)?.key).toBe('t9');
	});

	it('offers nothing while the household has no tags', () => {
		expect(homeTagChips([], null)).toEqual([]);
	});
});

describe('tagNarrowing', () => {
	const walk = tag('Walk', 5);

	it("names the chosen tag in the household's spelling, with how many moments carry it", () => {
		expect(tagNarrowing('walk', null, [walk], 3)).toEqual({ key: 'walk', name: 'Walk', count: 5 });
	});

	it('counts the moments shown once the stream is also narrowed to a member', () => {
		expect(tagNarrowing('walk', 'u1', [walk], 3)?.count).toBe(3);
	});

	it('reads a tag the viewer cannot see as none of their moments, under its key', () => {
		expect(tagNarrowing('nowhere', null, [walk], 0)).toEqual({
			key: 'nowhere',
			name: 'nowhere',
			count: 0
		});
	});

	it('is null without a tag', () => {
		expect(tagNarrowing(null, null, [walk], 0)).toBeNull();
	});
});

describe('tagSummary', () => {
	const moment = (id: string, anchorId: string) => ({ id, anchor: { id: anchorId } });

	it('counts the moments and the people they are about', () => {
		const summary = tagSummary(
			'walk',
			[tag('Walk', 3)],
			[moment('m1', 'anna'), moment('m2', 'ben'), moment('m3', 'anna')]
		);
		expect(summary).toEqual({
			key: 'walk',
			name: 'Walk',
			onlyPrivate: false,
			moments: 3,
			people: 2
		});
	});

	it('carries the private mark of a tag only on the viewer’s private moments', () => {
		expect(tagSummary('walk', [tag('Walk', 1, true)], [moment('m1', 'anna')])?.onlyPrivate).toBe(
			true
		);
	});

	it('is null for a tag the viewer has no moment of — unknown, or on others’ private moments', () => {
		expect(tagSummary('walk', [], [])).toBeNull();
	});
});
