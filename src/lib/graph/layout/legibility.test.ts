import { describe, expect, it } from 'bun:test';
import {
	EDGE_LABEL_LIMIT,
	edgeLabelsFit,
	labelsHint,
	linesDrawn,
	MAX_NODE_DIAMETER,
	MIN_NODE_DIAMETER,
	nodeDiameter
} from './legibility';

/*
 * What keeps a busy map readable (docs/05 §5.8): how many line names it can carry at once, and
 * how big a person is drawn for how connected they are.
 */

describe('edgeLabelsFit', () => {
	it('names every line while the map is small enough to read them', () => {
		expect(edgeLabelsFit(true, 0)).toBe(true);
		expect(edgeLabelsFit(true, EDGE_LABEL_LIMIT)).toBe(true);
	});

	it('stops naming them all once there are more lines than names fit', () => {
		expect(edgeLabelsFit(true, EDGE_LABEL_LIMIT + 1)).toBe(false);
	});

	it('never names them all when the reader switched names off', () => {
		expect(edgeLabelsFit(false, 1)).toBe(false);
	});

	it('sits around forty lines', () => {
		expect(EDGE_LABEL_LIMIT).toBe(40);
	});

	it('names no line at all where the family tree writes roles under the names instead', () => {
		expect(edgeLabelsFit(true, 1, true)).toBe(false);
		expect(edgeLabelsFit(true, 1, false)).toBe(true);
	});
});

describe('labelsHint', () => {
	it('says what the switch does while the names fit', () => {
		expect(labelsHint(true, true, false)).toBe('graph.labels.hint');
		expect(labelsHint(false, false, false)).toBe('graph.labels.hint');
	});

	it('says why the names paused once there are too many', () => {
		expect(labelsHint(true, false, false)).toBe('graph.labels.tooMany');
	});

	it('says the tree writes roles instead, whichever way the switch stands', () => {
		expect(labelsHint(true, false, true)).toBe('graph.labels.inTree');
		expect(labelsHint(false, false, true)).toBe('graph.labels.inTree');
	});
});

describe('linesDrawn', () => {
	const lines = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

	it('counts every line the map shows', () => {
		expect(linesDrawn(lines, [], 0)).toBe(5);
	});

	it('leaves out the lines held back until their person is selected', () => {
		// Left-off kinship and the lines a bundle tucks away are not drawn, so they cannot be
		// what crowds the names; one held back twice over is still one line.
		expect(linesDrawn(lines, [new Set(['a']), new Set(['b', 'a'])], 0)).toBe(3);
	});

	it('counts a bundle as the one line it draws', () => {
		expect(linesDrawn(lines, [new Set(['a', 'b', 'c'])], 1)).toBe(3);
	});
});

describe('nodeDiameter', () => {
	it('draws somebody with no lines at the smallest size', () => {
		expect(nodeDiameter(0)).toBe(MIN_NODE_DIAMETER);
	});

	it('grows with every line, but each line adds less than the one before', () => {
		const sizes = [1, 2, 3, 4, 5].map(nodeDiameter);
		for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
		const steps = sizes.slice(1).map((size, i) => size - sizes[i]);
		for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
	});

	it('still tells a hub of twenty from one of ten', () => {
		// The old linear scale stopped growing at ten lines, so every hub looked the same.
		expect(nodeDiameter(20)).toBeGreaterThan(nodeDiameter(10) + 4);
	});

	it('stops growing at a cap, so one hub cannot swallow its neighbours', () => {
		expect(nodeDiameter(200)).toBe(MAX_NODE_DIAMETER);
		expect(nodeDiameter(10_000)).toBe(MAX_NODE_DIAMETER);
		expect(MAX_NODE_DIAMETER).toBeLessThanOrEqual(72);
	});

	it('treats a negative count as none rather than drawing a dot', () => {
		expect(nodeDiameter(-3)).toBe(MIN_NODE_DIAMETER);
	});
});
