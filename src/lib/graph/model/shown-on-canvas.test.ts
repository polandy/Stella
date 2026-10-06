import { describe, expect, test } from 'bun:test';
import { shownOnCanvas } from './shown-on-canvas';
import type { RoleGrouping } from './role-groups';
import type { GraphModel } from './types';

/*
 * What the canvas shows (docs/05 §5.8): the filtered map, less the derived lines that only
 * repeat a chain already drawn, plus the frames and bundles grouping adds.
 */

const shown: GraphModel = {
	nodes: [
		{ id: 'a', kind: 'person', label: 'A' },
		{ id: 'b', kind: 'person', label: 'B' }
	],
	edges: [
		{ id: 'ab', source: 'a', target: 'b', kind: 'relationship' },
		{ id: 'kin', source: 'a', target: 'b', kind: 'kinship', derived: true }
	]
};

describe('shownOnCanvas', () => {
	test('shows everybody and every line of the filtered map', () => {
		const ids = shownOnCanvas(shown, new Set(), null);
		expect([...ids.nodes]).toEqual(['a', 'b']);
		expect([...ids.edges]).toEqual(['ab', 'kin']);
	});

	test('leaves out the derived lines that only repeat a drawn chain', () => {
		expect([...shownOnCanvas(shown, new Set(['kin']), null).edges]).toEqual(['ab']);
	});

	test('adds the frame of every group and the bundles drawn in place of lines', () => {
		const grouping: RoleGrouping = {
			groups: [{ id: 'group:c:r', circleId: 'c', role: 'r', memberIds: ['a', 'b'] }],
			groupOf: new Map([
				['a', 'group:c:r'],
				['b', 'group:c:r']
			]),
			bundles: [
				{ id: 'bundle:1', source: 'c', target: 'group:c:r', kind: 'membership', edgeIds: [] }
			],
			tucked: new Set()
		};
		const ids = shownOnCanvas(shown, new Set(), grouping);
		expect([...ids.nodes]).toEqual(['a', 'b', 'group:c:r']);
		expect([...ids.edges]).toEqual(['ab', 'kin', 'bundle:1']);
	});
});
