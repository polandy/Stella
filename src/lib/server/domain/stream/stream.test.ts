import { describe, expect, it } from 'bun:test';
import { assembleStream, buildStream, type MomentRow, type PersonRow, type RelationshipRow } from './stream';

/*
 * Household stream assembly (docs/02 §2.22.2): merge scoped sources newest-first, stable on
 * ties, mark the viewer's own items, respect the limit.
 */

const me = { id: 'u1', name: 'Andy' };
const lena = { id: 'u2', name: 'Lena' };
const p = (id: string) => ({ id, name: id, avatarPhotoId: null });

const moment = (id: string, at: number, actor = me): MomentRow => ({
	id,
	at,
	actor,
	anchor: p('julia'),
	entryDate: '2026-09-03',
	visibility: 'shared',
	body: 'hi',
	mentions: [],
	photoIds: []
});
const person = (id: string, at: number, actor = lena): PersonRow => ({
	id,
	at,
	actor,
	person: p(id),
	description: null,
	visibility: 'shared'
});
const rel = (id: string, at: number): RelationshipRow => ({
	id,
	at,
	actor: lena,
	from: p('a'),
	to: p('b'),
	label: 'sister'
});

describe('assembleStream', () => {
	it('merges all sources newest first and marks my own items', () => {
		const items = assembleStream(
			{ moments: [moment('m1', 300)], people: [person('c1', 100)], relationships: [rel('r1', 200)] },
			'u1'
		);
		expect(items.map((i) => [i.kind, i.id, i.mine])).toEqual([
			['moment', 'm1', true],
			['relationship', 'r1', false],
			['person', 'c1', false]
		]);
	});

	it('orders a tie moment → relationship → person, then by id', () => {
		const items = assembleStream(
			{
				moments: [moment('m', 100)],
				people: [person('p2', 100), person('p1', 100)],
				relationships: [rel('r', 100)]
			},
			'u1'
		);
		expect(items.map((i) => i.id)).toEqual(['m', 'r', 'p1', 'p2']);
	});

	it('cuts to the limit after merging', () => {
		const items = assembleStream(
			{ moments: [moment('m1', 5), moment('m2', 4)], people: [person('p', 3)], relationships: [] },
			'u1',
			2
		);
		expect(items.map((i) => i.id)).toEqual(['m1', 'm2']);
	});
});

describe('buildStream', () => {
	it('asks each source for the limit and merges the results', async () => {
		const asked: number[] = [];
		const items = await buildStream(
			{
				stream: {
					async recentMoments(_v, limit) {
						asked.push(limit);
						return [moment('m', 2)];
					},
					async recentPeople(_v, limit) {
						asked.push(limit);
						return [person('p', 1)];
					},
					async recentRelationships(_v, limit) {
						asked.push(limit);
						return [];
					}
				}
			},
			{ id: 'u1', householdId: 'h1' },
			7
		);
		expect(asked).toEqual([7, 7, 7]);
		expect(items.map((i) => i.id)).toEqual(['m', 'p']);
	});
});
