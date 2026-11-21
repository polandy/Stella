import { describe, expect, it } from 'bun:test';
import type { GraphModel } from '../graph/model/types';
import { PARENT_CHILD_TYPE_KEY } from '../relationships/type-keys';
import { giverSuggestions, householdGivers, livingAmong } from './giver-suggestions';

/* Whom *Wer schenkt?* suggests (docs/dev/02 §2.25.12). */

const person = (id: string, deceased = false) => ({
	id,
	kind: 'person' as const,
	label: id.toUpperCase(),
	deceased
});
const parentOf = (source: string, target: string) => ({
	id: `${source}-${target}`,
	source,
	target,
	kind: 'relationship' as const,
	typeKey: PARENT_CHILD_TYPE_KEY
});

describe('householdGivers', () => {
	const graph: Pick<GraphModel, 'nodes' | 'edges'> = {
		nodes: [person('andy'), person('julia'), person('tomy'), person('lea'), person('opa', true)],
		edges: [
			parentOf('andy', 'tomy'),
			parentOf('julia', 'tomy'),
			parentOf('julia', 'lea'),
			parentOf('opa', 'andy')
		]
	};

	it('lists the members’ own people, then their children, each once', () => {
		expect(householdGivers(['andy', 'julia'], graph).map((p) => p.id)).toEqual([
			'andy',
			'julia',
			'tomy',
			'lea'
		]);
	});

	it('leaves out whoever the viewer may not see, and the dead', () => {
		expect(householdGivers(['hidden', 'opa'], graph)).toEqual([]);
	});
});

describe('livingAmong', () => {
	it('keeps the living people, each once, and drops the dead and the unseen', () => {
		const graph = { nodes: [person('sandra'), person('opa', true)] };
		expect(livingAmong(['sandra', 'opa', 'ghost', 'sandra'], graph)).toEqual(['sandra']);
	});
});

describe('giverSuggestions', () => {
	const of = (id: string) => ({ id, name: id, hint: null });

	it('puts the person’s links first and names nobody twice, the person never', () => {
		expect(
			giverSuggestions('tomy', [of('sandra'), of('andy')], [of('andy'), of('tomy'), of('lea')])
		).toEqual({
			ties: [of('sandra'), of('andy')],
			household: [of('lea')]
		});
	});
});
