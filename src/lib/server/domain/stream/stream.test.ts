import { describe, expect, it } from 'bun:test';
import {
	assembleStream,
	buildStream,
	type InteractionRow,
	type MomentRow,
	type PersonRow,
	type RelationshipRow
} from './stream';

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

const touch = (id: string, at: number, actor = lena): InteractionRow => ({
	id,
	at,
	actor,
	subject: p('oma'),
	interactionKind: 'call',
	happenedAt: '2026-09-03',
	title: null,
	visibility: 'shared',
	participants: []
});

describe('assembleStream', () => {
	it('includes interactions and marks my own', () => {
		const items = assembleStream(
			{ moments: [], people: [], relationships: [], interactions: [touch('i1', 50, me), touch('i2', 60)] },
			'u1'
		);
		expect(items.map((i) => [i.kind, i.id, i.mine])).toEqual([
			['interaction', 'i2', false],
			['interaction', 'i1', true]
		]);
	});

	it('orders a tie moment → interaction → relationship → person', () => {
		const items = assembleStream(
			{ moments: [moment('m', 100)], people: [person('p', 100)], relationships: [rel('r', 100)], interactions: [touch('i', 100)] },
			'u1'
		);
		expect(items.map((i) => i.id)).toEqual(['m', 'i', 'r', 'p']);
	});

	it('merges all sources newest first and marks my own items', () => {
		const items = assembleStream(
			{ moments: [moment('m1', 300)], people: [person('c1', 100)], relationships: [rel('r1', 200)], interactions: [] },
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
				relationships: [rel('r', 100)],
				interactions: []
			},
			'u1'
		);
		expect(items.map((i) => i.id)).toEqual(['m', 'r', 'p1', 'p2']);
	});

	it('cuts to the limit after merging', () => {
		const items = assembleStream(
			{ moments: [moment('m1', 5), moment('m2', 4)], people: [person('p', 3)], relationships: [], interactions: [] },
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
					},
					async recentInteractions(_v, limit) {
						asked.push(limit);
						return [touch('i', 3)];
					}
				}
			},
			{ id: 'u1', householdId: 'h1' },
			7
		);
		expect(asked).toEqual([7, 7, 7, 7]);
		expect(items.map((i) => i.id)).toEqual(['i', 'm', 'p']);
	});
});
