import { describe, expect, test } from 'bun:test';
import { FILTER_KEYS, graphFiltersFor, openingFilterKeys } from './view-filters';

/*
 * The Filter menu's kinds of line, and what the switched-on ones ask of `applyFilters`
 * (docs/05 §5.8). The menu draws them; which lines they keep is decided here.
 */

describe('FILTER_KEYS', () => {
	test('lists the four relationship categories, then circles, then derived kinship', () => {
		expect([...FILTER_KEYS]).toEqual([
			'family',
			'romantic',
			'social',
			'professional',
			'circles',
			'kinship'
		]);
	});
});

describe('openingFilterKeys', () => {
	test('opens the explorer route with every kind of line on', () => {
		expect([...openingFilterKeys(false)]).toEqual([...FILTER_KEYS]);
	});

	test('leaves circles off on a person page, where they would double the nodes', () => {
		const opening = openingFilterKeys(true);
		expect(opening.has('circles')).toBe(false);
		expect(opening.size).toBe(FILTER_KEYS.length - 1);
	});
});

describe('graphFiltersFor', () => {
	test('keeps relationships of the categories that are on, in a fixed order', () => {
		const filters = graphFiltersFor(new Set(['social', 'family']), 'mara');
		expect(filters.categories).toEqual(['family', 'social']);
		expect(filters.edgeKinds).toEqual(['relationship']);
	});

	test('drops relationship lines altogether when no category is on', () => {
		const filters = graphFiltersFor(new Set(['circles', 'kinship']), 'mara');
		expect(filters.categories).toEqual([]);
		expect(filters.edgeKinds).toEqual(['membership', 'kinship']);
	});

	test('keeps nothing when every kind is off', () => {
		expect(graphFiltersFor(new Set(), 'mara').edgeKinds).toEqual([]);
	});

	test('never drops the centre, and keeps nobody in particular without one', () => {
		expect(graphFiltersFor(new Set(FILTER_KEYS), 'mara').keepNodeId).toBe('mara');
		expect(graphFiltersFor(new Set(FILTER_KEYS), null).keepNodeId).toBeUndefined();
	});
});
