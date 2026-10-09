import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION } from './document';
import { planRestore, type RestoreTarget } from './restore';

/*
 * The relationships an archive brings, in the stored order every other writer gives them
 * (docs/03 §relationship, docs/02 §2.15). An archive from before migration 0025, or one edited
 * by hand, can hold a symmetric link the wrong way round, the same link from both ends, or a
 * person linked to themselves; the plan puts each right before the adapter writes a row.
 * Directed links are never turned round: their order is their meaning.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 1, 8, 0) };

function counter(): IdGenerator {
	let n = 0;
	return { next: () => `new-${++n}` };
}

/** The built-ins this target knows: `friend` is symmetric, `parent_child` is not. */
const target = (over: Partial<RestoreTarget> = {}): RestoreTarget => ({
	householdId: 'h-here',
	actorId: 'u-admin',
	memberIds: ['u-admin'],
	relationshipTypeIds: ['friend', 'parent_child'],
	symmetricTypeIds: ['friend'],
	tags: [],
	...over
});

type Link = {
	id: string;
	from: string;
	to: string;
	type: string;
	description?: string;
	since?: string;
	status?: string;
};

/** An archive of three people (ids sort anna < bea < carl) and the given links. */
function archive(links: Link[], types: Record<string, unknown>[] = []) {
	return {
		format: ARCHIVE_FORMAT,
		version: ARCHIVE_VERSION,
		household: 'Familie Brunner',
		people: ['anna', 'bea', 'carl'].map((id) => ({ id, display_name: id })),
		relationship_types: types,
		relationships: links
	};
}

const plan = (
	links: Link[],
	over: Partial<RestoreTarget> = {},
	types: Record<string, unknown>[] = []
) => planRestore({ ids: counter(), clock }, archive(links, types), target(over));

const linksOf = (planned: ReturnType<typeof planRestore>) =>
	planned.tables
		.find((t) => t.table === 'relationship')!
		.rows.map((row) => ({
			id: row.id,
			from: row.from_contact_id,
			to: row.to_contact_id,
			type: row.type_id,
			note: row.note,
			since: row.since_date,
			status: row.status
		}));

const ends = (planned: ReturnType<typeof planRestore>) =>
	linksOf(planned).map(({ id, from, to }) => ({ id, from, to }));

describe('a symmetric link is stored with its ends sorted', () => {
	it('turns a symmetric link written the wrong way round', () => {
		expect(ends(plan([{ id: 'r-1', from: 'carl', to: 'anna', type: 'friend' }]))).toEqual([
			{ id: 'r-1', from: 'anna', to: 'carl' }
		]);
	});

	it('leaves a symmetric link that is already sorted exactly as it is', () => {
		const planned = plan([
			{
				id: 'r-1',
				from: 'anna',
				to: 'carl',
				type: 'friend',
				description: 'school',
				since: '2001-09-01'
			}
		]);
		expect(linksOf(planned)).toEqual([
			{
				id: 'r-1',
				from: 'anna',
				to: 'carl',
				type: 'friend',
				note: 'school',
				since: '2001-09-01',
				status: 'current'
			}
		]);
		expect(planned.warnings).toEqual([]);
	});

	it('never turns a directed link round, whichever way its ids sort', () => {
		expect(
			ends(
				plan([
					{ id: 'r-1', from: 'carl', to: 'anna', type: 'parent_child' },
					{ id: 'r-2', from: 'anna', to: 'bea', type: 'parent_child' }
				])
			)
		).toEqual([
			{ id: 'r-1', from: 'carl', to: 'anna' },
			{ id: 'r-2', from: 'anna', to: 'bea' }
		]);
	});

	it('reads whether a type the archive brings is symmetric from the archive', () => {
		const types = [
			{ id: 'rt-bandmate', key: 'bandmate', forward_label: 'Bandmate of', symmetric: true },
			{ id: 'rt-coach', key: 'coach', forward_label: 'Coach of', reverse_label: 'Coached by' }
		];
		expect(
			ends(
				plan(
					[
						{ id: 'r-1', from: 'carl', to: 'anna', type: 'rt-bandmate' },
						{ id: 'r-2', from: 'carl', to: 'anna', type: 'rt-coach' }
					],
					{},
					types
				)
			)
		).toEqual([
			{ id: 'r-1', from: 'anna', to: 'carl' },
			{ id: 'r-2', from: 'carl', to: 'anna' }
		]);
	});

	// A type that is already here keeps its row (the restore only adds), so its links are stored
	// the way *that* row says, whatever the archive's copy of the type claims.
	it('goes by the household’s own type where the archive’s copy of it says otherwise', () => {
		const types = [
			{ id: 'rt-here-sym', key: 'bandmate', forward_label: 'Bandmate of' },
			{ id: 'rt-here-directed', key: 'coach', forward_label: 'Coach of', symmetric: true }
		];
		const here = {
			relationshipTypeIds: ['rt-here-sym', 'rt-here-directed'],
			symmetricTypeIds: ['rt-here-sym']
		};
		expect(
			ends(
				plan(
					[
						{ id: 'r-1', from: 'carl', to: 'anna', type: 'rt-here-sym' },
						{ id: 'r-2', from: 'carl', to: 'anna', type: 'rt-here-directed' }
					],
					here,
					types
				)
			)
		).toEqual([
			{ id: 'r-1', from: 'anna', to: 'carl' },
			{ id: 'r-2', from: 'carl', to: 'anna' }
		]);
	});
});

describe('the same symmetric link twice in one archive is restored once', () => {
	it('keeps the copy stored sorted and fills only its blanks from the other', () => {
		const planned = plan([
			{
				id: 'r-copy',
				from: 'carl',
				to: 'anna',
				type: 'friend',
				description: 'school',
				since: '2001-09-01'
			},
			{
				id: 'r-twin',
				from: 'anna',
				to: 'carl',
				type: 'friend',
				since: '1999-01-01',
				status: 'former'
			}
		]);
		expect(linksOf(planned)).toEqual([
			{
				id: 'r-twin',
				from: 'anna',
				to: 'carl',
				type: 'friend',
				note: 'school',
				since: '1999-01-01',
				status: 'former'
			}
		]);
		expect(planned.warnings).toEqual([{ code: 'relationshipTwinFolded' }]);
	});

	it('keeps the first where neither copy is sorted', () => {
		expect(
			ends(
				plan([
					{ id: 'r-first', from: 'carl', to: 'anna', type: 'friend' },
					{ id: 'r-second', from: 'carl', to: 'anna', type: 'friend' }
				])
			)
		).toEqual([{ id: 'r-first', from: 'anna', to: 'carl' }]);
	});

	it('keeps two different kinds of link between the same two people', () => {
		const planned = plan([
			{ id: 'r-1', from: 'carl', to: 'anna', type: 'friend' },
			{ id: 'r-2', from: 'carl', to: 'anna', type: 'parent_child' }
		]);
		expect(ends(planned)).toEqual([
			{ id: 'r-1', from: 'anna', to: 'carl' },
			{ id: 'r-2', from: 'carl', to: 'anna' }
		]);
		expect(planned.warnings).toEqual([]);
	});

	// A directed link both ways round says two different things; it is not the restore's to judge.
	it('keeps a directed link and its reverse as the two links they are', () => {
		const planned = plan([
			{ id: 'r-1', from: 'carl', to: 'anna', type: 'parent_child' },
			{ id: 'r-2', from: 'anna', to: 'carl', type: 'parent_child' }
		]);
		expect(ends(planned)).toEqual([
			{ id: 'r-1', from: 'carl', to: 'anna' },
			{ id: 'r-2', from: 'anna', to: 'carl' }
		]);
		expect(planned.warnings).toEqual([]);
	});
});

describe('a link from a person to themselves', () => {
	it('is left out and named in the report, and the rest of the links arrive', () => {
		const planned = plan([
			{ id: 'r-self', from: 'bea', to: 'bea', type: 'friend' },
			{ id: 'r-self-directed', from: 'bea', to: 'bea', type: 'parent_child' },
			{ id: 'r-1', from: 'anna', to: 'bea', type: 'friend' }
		]);
		expect(ends(planned)).toEqual([{ id: 'r-1', from: 'anna', to: 'bea' }]);
		expect(planned.warnings).toEqual([{ code: 'relationshipToItself' }]);
	});
});
