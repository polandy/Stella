import { describe, expect, it } from 'bun:test';
import type { CircleWithCount } from '../../circles/circles';
import { findCircles, findPeople } from './lookup';

/*
 * The API's two lookups (docs/02 §2.16.1): how a script finds the ids it names as `existingId`.
 * Both read through repositories that already scope to the member, so only matching is tested.
 */

const viewer = { id: 'user-1', householdId: 'h' };

const circle = (id: string, name: string): CircleWithCount => ({
	id,
	householdId: 'h',
	createdBy: 'user-1',
	visibility: 'shared',
	name,
	description: null,
	kind: 'class',
	color: 'blue',
	startDate: '2023-08-01',
	endDate: null,
	memberCount: 3,
	preview: []
});

describe('findCircles', () => {
	const circles = {
		listVisibleTo: async () => [
			circle('ci-1', 'Kindergarten Münzstrasse'),
			circle('ci-2', 'FC Example')
		]
	};

	it('finds circles whose name contains the query, ignoring case and accents', async () => {
		expect(await findCircles({ circles }, viewer, 'munz')).toEqual([
			{
				id: 'ci-1',
				name: 'Kindergarten Münzstrasse',
				kind: 'class',
				startDate: '2023-08-01',
				endDate: null,
				memberCount: 3
			}
		]);
	});

	it('lists every circle for an empty query', async () => {
		expect((await findCircles({ circles }, viewer, '  ')).map((c) => c.id)).toEqual([
			'ci-1',
			'ci-2'
		]);
	});
});

describe('findPeople', () => {
	it('answers with the people the household search finds', async () => {
		const asked: string[] = [];
		const search = {
			searchContacts: async (_v: unknown, fts: string) => {
				asked.push(fts);
				return [{ id: 'c-1', displayName: 'Anna Muster', description: null }];
			},
			searchNotes: async () => []
		};
		expect(await findPeople({ search }, viewer, 'anna')).toEqual([
			{ id: 'c-1', displayName: 'Anna Muster', description: null }
		]);
		expect(asked).toHaveLength(1);
	});

	it('does not search for nothing', async () => {
		const asked: string[] = [];
		const search = {
			searchContacts: async (_v: unknown, fts: string) => {
				asked.push(fts);
				return [];
			},
			searchNotes: async () => []
		};
		expect(await findPeople({ search }, viewer, '   ')).toEqual([]);
		expect(await findPeople({ search }, viewer, 'bert')).toEqual([]);
		expect(asked).toHaveLength(1);
	});
});
