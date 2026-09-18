import { describe, expect, it } from 'bun:test';
import type { NewActivityEntry } from '../../activity/activity';
import { BUILT_IN_RELATIONSHIP_TYPES } from '../../relationships/built-in-types';
import {
	importViaApi,
	type ApiImportCounts,
	type ApiImportDeps,
	type ApiImportRepository,
	type HouseholdReading
} from './api-import';
import type { ApiImportDocument } from './document';
import type { ApiImportPlan } from './plan';

/*
 * The import API's use-case (docs/02 §2.16.1): read what the document touches, plan, and either
 * report (dry run) or write the plan in one go and log it. The repository is a recording fake,
 * so "nothing was written" is asserted against the calls it saw, not against an absence.
 */

const ACTOR = {
	userId: 'user-1',
	householdId: 'household-1',
	defaultVisibility: 'shared' as const
};
const NOW = 1_700_000_000_000;
const wording = {
	imported: (people: number, source: string) => `imported ${people} people from ${source}`
};

const EMPTY_READING: HouseholdReading = {
	people: new Map(),
	hiddenIds: new Set(),
	circles: new Map(),
	types: BUILT_IN_RELATIONSHIP_TYPES,
	links: [],
	graph: { people: [], parentEdges: [], siblingEdges: [], partnerEdges: [], storedPairs: [] },
	directory: []
};

function fakeRepository(inserted?: ApiImportCounts) {
	const calls = {
		read: [] as { contactIds: string[]; circleIds: string[] }[],
		applied: [] as { plan: ApiImportPlan; audit: NewActivityEntry | null }[]
	};
	const repository: ApiImportRepository = {
		async readHousehold(_viewer, ids) {
			calls.read.push(ids);
			return EMPTY_READING;
		},
		async applyPlan(plan, audit) {
			calls.applied.push({ plan, audit });
			return (
				inserted ?? {
					people: plan.contacts.length,
					fields: plan.fields.length,
					relationships: plan.relationships.length,
					circles: plan.circles.length,
					memberships: plan.memberships.length
				}
			);
		}
	};
	return { repository, calls };
}

function deps(repository: ApiImportRepository): ApiImportDeps {
	let next = 0;
	return { imports: repository, clock: { now: () => NOW }, ids: { next: () => `log-${++next}` } };
}

const document: ApiImportDocument = {
	source: 'kindergarten',
	visibility: null,
	people: [
		{
			ref: 'anna',
			displayName: null,
			firstName: 'Anna',
			lastName: 'Muster',
			nickname: null,
			description: null,
			birthDate: null,
			fields: []
		},
		{
			ref: 'bert',
			displayName: null,
			firstName: 'Bert',
			lastName: 'Muster',
			nickname: null,
			description: null,
			birthDate: null,
			fields: []
		}
	],
	relationships: [{ from: 'anna', to: 'bert', type: 'parent_child' }],
	circles: []
};

describe('importViaApi', () => {
	it('reads the household for exactly the ids the document names', async () => {
		const { repository, calls } = fakeRepository();
		await importViaApi(deps(repository), ACTOR, document, { dryRun: true, wording });
		expect(calls.read).toEqual([
			{ contactIds: ['api~kindergarten~p~anna', 'api~kindergarten~p~bert'], circleIds: [] }
		]);
	});

	it('reports a dry run without writing anything', async () => {
		const { repository, calls } = fakeRepository();
		const result = await importViaApi(deps(repository), ACTOR, document, { dryRun: true, wording });
		expect(calls.read).toHaveLength(1);
		expect(calls.applied).toEqual([]);
		expect(result).toMatchObject({
			ok: true,
			dryRun: true,
			added: { people: 2, fields: 0, relationships: 1, circles: 0, memberships: 0 }
		});
	});

	it('writes the plan with a log entry, and reports what was actually written', async () => {
		const { repository, calls } = fakeRepository({
			people: 1,
			fields: 0,
			relationships: 1,
			circles: 0,
			memberships: 0
		});
		const result = await importViaApi(deps(repository), ACTOR, document, {
			dryRun: false,
			wording
		});
		expect(calls.applied).toHaveLength(1);
		expect(calls.applied[0].plan.contacts.map((c) => c.id)).toEqual([
			'api~kindergarten~p~anna',
			'api~kindergarten~p~bert'
		]);
		expect(calls.applied[0].audit).toEqual({
			id: 'log-1',
			householdId: 'household-1',
			actorId: 'user-1',
			action: 'import',
			entityType: 'household',
			entityId: 'household-1',
			contactId: null,
			visibility: 'shared',
			summary: 'imported 2 people from kindergarten',
			createdAt: NOW
		});
		expect(result).toMatchObject({
			ok: true,
			dryRun: false,
			added: { people: 1, relationships: 1 }
		});
	});

	it('logs a private import as private, so the stream shows it to its author only', async () => {
		const { repository, calls } = fakeRepository();
		await importViaApi(
			deps(repository),
			ACTOR,
			{ ...document, visibility: 'private' },
			{ dryRun: false, wording }
		);
		expect(calls.applied[0].audit?.visibility).toBe('private');
	});

	it('leaves the log alone when a document has nothing new to write', async () => {
		const { repository, calls } = fakeRepository();
		await importViaApi(
			deps(repository),
			ACTOR,
			{ ...document, people: [], relationships: [] },
			{ dryRun: false, wording }
		);
		expect(calls.applied).toEqual([{ plan: expect.anything(), audit: null }]);
	});

	it('refuses a document with problems and writes nothing', async () => {
		const { repository, calls } = fakeRepository();
		const result = await importViaApi(
			deps(repository),
			ACTOR,
			{ ...document, relationships: [{ from: 'anna', to: 'zora', type: 'parent_child' }] },
			{ dryRun: false, wording }
		);
		expect(calls.read).toHaveLength(1);
		expect(calls.applied).toEqual([]);
		expect(result).toEqual({
			ok: false,
			problems: [{ code: 'unknownRef', path: 'relationships[0].to', ref: 'zora' }]
		});
	});
});
