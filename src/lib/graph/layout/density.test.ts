import { describe, expect, it } from 'bun:test';
import { DEFAULT_DENSITY, DENSITIES, parseDensity, spacingFor } from './density';
import { NODE_LABEL_WIDTH } from './legibility';

/*
 * How close together the explorer sets people (docs/05 §5.8): a reader's choice between
 * Compact, Comfortable and Spacious, remembered per device. The canvas reads the spacing from
 * here, so these are the numbers the map is drawn at.
 */

describe('spacingFor', () => {
	it('sets people further apart the more room the reader asks for', () => {
		const [compact, comfortable, spacious] = DENSITIES.map(spacingFor);

		expect(compact.edgeLength).toBeLessThan(comfortable.edgeLength);
		expect(comfortable.edgeLength).toBeLessThan(spacious.edgeLength);
		expect(compact.repulsion).toBeLessThan(comfortable.repulsion);
		expect(comfortable.repulsion).toBeLessThan(spacious.repulsion);
	});

	it('never sets two people closer than their names are wide, even when compact', () => {
		// A fan sets its people one edge length apart; any closer and the names under them
		// run into each other.
		for (const density of DENSITIES) {
			expect(spacingFor(density).edgeLength).toBeGreaterThan(NODE_LABEL_WIDTH);
		}
	});

	it('leaves a gap between two names side by side at the default', () => {
		expect(spacingFor(DEFAULT_DENSITY).edgeLength).toBeGreaterThanOrEqual(NODE_LABEL_WIDTH + 20);
	});
});

describe('parseDensity', () => {
	it('reads back every density it can be set to', () => {
		for (const density of DENSITIES) expect(parseDensity(density)).toBe(density);
	});

	it('falls back to the default for nothing stored, or for something it does not know', () => {
		expect(DEFAULT_DENSITY).toBe('comfortable');
		expect(parseDensity(null)).toBe(DEFAULT_DENSITY);
		expect(parseDensity('cosy')).toBe(DEFAULT_DENSITY);
		expect(parseDensity('')).toBe(DEFAULT_DENSITY);
	});
});
