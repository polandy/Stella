import { describe, expect, it } from 'bun:test';
import {
	assembleStream,
	buildStream,
	type InteractionRow,
	type NoticeRow,
	type MomentRow,
	type PersonRow,
	type RelationshipRow,
	type StreamQuery,
	type StreamRepository
} from './stream';
import { NO_FILTER } from '../../../stream/filter';

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
	label: 'sister',
	typeKey: 'sibling'
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

const removal = (id: string, at: number, actor = lena): NoticeRow => ({
	id,
	at,
	actor,
	summary: 'removed Someone Gone'
});

describe('assembleStream', () => {
	it('includes interactions and marks my own', () => {
		const items = assembleStream(
			{ moments: [], people: [], relationships: [], interactions: [touch('i1', 50, me), touch('i2', 60)], notices: [] },
			'u1'
		);
		expect(items.map((i) => [i.kind, i.id, i.mine])).toEqual([
			['interaction', 'i2', false],
			['interaction', 'i1', true]
		]);
	});

	it('orders a tie moment → interaction → relationship → person → removal', () => {
		const items = assembleStream(
			{ moments: [moment('m', 100)], people: [person('p', 100)], relationships: [rel('r', 100)], interactions: [touch('i', 100)], notices: [removal('x', 100)] },
			'u1'
		);
		expect(items.map((i) => i.id)).toEqual(['m', 'i', 'r', 'p', 'x']);
	});

	it('merges all sources newest first and marks my own items', () => {
		const items = assembleStream(
			{ moments: [moment('m1', 300)], people: [person('c1', 100)], relationships: [rel('r1', 200)], interactions: [], notices: [] },
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
				interactions: [], notices: []
			},
			'u1'
		);
		expect(items.map((i) => i.id)).toEqual(['m', 'r', 'p1', 'p2']);
	});

	it('cuts to the limit after merging', () => {
		const items = assembleStream(
			{ moments: [moment('m1', 5), moment('m2', 4)], people: [person('p', 3)], relationships: [], interactions: [], notices: [] },
			'u1',
			2
		);
		expect(items.map((i) => i.id)).toEqual(['m1', 'm2']);
	});
});

/** A repository that records which sources were asked, and with what. */
function recordingRepository() {
	const asked: { source: string; query: StreamQuery }[] = [];
	const answer =
		<T>(source: string, rows: T[]) =>
		async (_viewer: unknown, query: StreamQuery) => {
			asked.push({ source, query });
			return rows;
		};
	const stream: StreamRepository = {
		recentMoments: answer('moments', [moment('m', 2)]),
		recentPeople: answer('people', [person('p', 1)]),
		recentRelationships: answer('relationships', []),
		recentInteractions: answer('interactions', [touch('i', 3)]),
		recentNotices: answer('notices', [removal('x', 4)])
	};
	return { stream, asked };
}

const viewer = { id: 'u1', householdId: 'h1' };

describe('buildStream', () => {
	it('asks each source for the limit and merges the results', async () => {
		const { stream, asked } = recordingRepository();
		const items = await buildStream({ stream }, viewer, NO_FILTER, 7);
		expect(asked.map((a) => a.query)).toEqual(Array(5).fill({ limit: 7, memberId: null }));
		expect(items.map((i) => i.id)).toEqual(['x', 'i', 'm', 'p']);
	});

	it('asks only the source of the chosen kind', async () => {
		const { stream, asked } = recordingRepository();
		const items = await buildStream({ stream }, viewer, { kind: 'interaction', memberId: null });
		expect(asked.map((a) => a.source)).toEqual(['interactions']);
		expect(items.map((i) => i.id)).toEqual(['i']);
	});

	it('hands the chosen member to every source it asks', async () => {
		const { stream, asked } = recordingRepository();
		await buildStream({ stream }, viewer, { kind: null, memberId: 'u2' }, 7);
		expect(asked.map((a) => [a.source, a.query.memberId])).toEqual([
			['moments', 'u2'],
			['people', 'u2'],
			['relationships', 'u2'],
			['interactions', 'u2'],
			['notices', 'u2']
		]);
	});
});
