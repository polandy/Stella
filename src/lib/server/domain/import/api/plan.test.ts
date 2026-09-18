import { describe, expect, it } from 'bun:test';
import type { KinshipGraph } from '../../../../kinship/kinship';
import { BUILT_IN_RELATIONSHIP_TYPES } from '../../relationships/built-in-types';
import type {
	ApiCircle,
	ApiImportDocument,
	ApiNewPerson,
	ApiPerson,
	ApiRelationship
} from './document';
import { idsNamedBy, planApiImport, type ApiImportContext, type ApiImportProblem } from './plan';

/*
 * The import API's planner (docs/02 §2.16.1): a document plus what the household already has,
 * in; the rows to write and what to say about them, out. Pure, so every case here is a value.
 */

const H = 'household-1';
const ME = 'user-1';
const NOW = 1_700_000_000_000;
const SOURCE = 'kindergarten';

const EMPTY_GRAPH: KinshipGraph = {
	people: [],
	parentEdges: [],
	siblingEdges: [],
	partnerEdges: [],
	storedPairs: []
};

function context(over: Partial<ApiImportContext> = {}): ApiImportContext {
	return {
		householdId: H,
		actorId: ME,
		defaultVisibility: 'shared',
		now: NOW,
		people: new Map(),
		hiddenIds: new Set(),
		circles: new Map(),
		types: BUILT_IN_RELATIONSHIP_TYPES,
		links: [],
		graph: EMPTY_GRAPH,
		directory: [],
		...over
	};
}

function person(ref: string, over: Partial<ApiNewPerson> = {}): ApiNewPerson {
	return {
		ref,
		displayName: null,
		firstName: ref[0].toUpperCase() + ref.slice(1),
		lastName: 'Muster',
		nickname: null,
		description: null,
		birthDate: null,
		fields: [],
		...over
	};
}

function doc(over: Partial<ApiImportDocument> = {}): ApiImportDocument {
	return { source: SOURCE, visibility: null, people: [], relationships: [], circles: [], ...over };
}

const link = (from: string, type: string, to: string): ApiRelationship => ({ from, to, type });

const idOf = (ref: string) => `api~${SOURCE}~p~${ref}`;

/** The plan, failing the test with the problems when the planner refused. */
function planned(document: ApiImportDocument, ctx = context()) {
	const result = planApiImport(document, ctx);
	if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.problems)}`);
	return result.plan;
}

/** The problems, failing the test when the planner accepted. */
function refused(document: ApiImportDocument, ctx = context()): ApiImportProblem[] {
	const result = planApiImport(document, ctx);
	if (result.ok) throw new Error('expected the document to be refused');
	return result.problems;
}

describe('people', () => {
	it('creates each new person under an id made of the source and their ref', () => {
		const plan = planned(doc({ people: [person('anna', { birthDate: '2019-06-23' })] }));
		expect(plan.contacts).toEqual([
			{
				id: idOf('anna'),
				householdId: H,
				createdBy: ME,
				visibility: 'shared',
				displayName: 'Anna Muster',
				firstName: 'Anna',
				lastName: 'Muster',
				nickname: null,
				description: null,
				howWeMet: null,
				metDate: null,
				metPlace: null,
				birthDate: '2019-06-23',
				birthDatePrecision: 'full',
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
		expect(plan.report.people).toEqual([
			{ ref: 'anna', id: idOf('anna'), displayName: 'Anna Muster', status: 'new' }
		]);
	});

	it('keeps an explicit display name and a year-less birthday', () => {
		const plan = planned(
			doc({ people: [person('anna', { displayName: 'Nina Muster', birthDate: '--06-23' })] })
		);
		expect(plan.contacts[0]).toMatchObject({
			displayName: 'Nina Muster',
			birthDate: '--06-23',
			birthDatePrecision: 'month_day'
		});
	});

	it('gives created people the document visibility, or the member default without one', () => {
		expect(
			planned(doc({ people: [person('anna')] }), context({ defaultVisibility: 'private' }))
				.contacts[0].visibility
		).toBe('private');
		expect(
			planned(
				doc({ visibility: 'shared', people: [person('anna')] }),
				context({ defaultVisibility: 'private' })
			).contacts[0].visibility
		).toBe('shared');
	});

	it('writes contact fields in document order under stable ids', () => {
		const plan = planned(
			doc({
				people: [
					person('anna', {
						fields: [
							{ kind: 'phone', value: '+41 79 000 00 01', label: 'mobile' },
							{ kind: 'address', value: 'Examplestrasse 1, 3007 Bern', label: null }
						]
					})
				]
			})
		);
		expect(plan.fields).toEqual([
			{
				id: `${idOf('anna')}~f~0`,
				contactId: idOf('anna'),
				kind: 'phone',
				label: 'mobile',
				value: '+41 79 000 00 01',
				meta: null,
				sortOrder: 0,
				createdAt: NOW,
				updatedAt: NOW
			},
			{
				id: `${idOf('anna')}~f~1`,
				contactId: idOf('anna'),
				kind: 'address',
				label: null,
				value: 'Examplestrasse 1, 3007 Bern',
				meta: null,
				sortOrder: 1,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
	});

	it('names someone already in Stella by id and creates nothing for them', () => {
		const plan = planned(
			doc({ people: [{ ref: 'carl', existingId: 'c-carl' }] }),
			context({
				people: new Map([['c-carl', { id: 'c-carl', displayName: 'Carl', birthDate: null }]])
			})
		);
		expect(plan.contacts).toEqual([]);
		expect(plan.report.people).toEqual([
			{ ref: 'carl', id: 'c-carl', displayName: 'Carl', status: 'existing' }
		]);
	});

	it('refuses an existing id the member cannot see', () => {
		expect(refused(doc({ people: [{ ref: 'carl', existingId: 'c-nobody' }] }))).toEqual([
			{ code: 'personNotFound', path: 'people[0].existingId', id: 'c-nobody' }
		]);
	});

	it('leaves a person sent before alone, fields included, and says so', () => {
		const plan = planned(
			doc({ people: [person('anna', { fields: [{ kind: 'phone', value: '1', label: null }] })] }),
			context({
				people: new Map([
					[idOf('anna'), { id: idOf('anna'), displayName: 'Anna Muster', birthDate: null }]
				])
			})
		);
		expect(plan.contacts).toEqual([]);
		expect(plan.fields).toEqual([]);
		expect(plan.report.people[0].status).toBe('imported');
	});

	it('refuses to write under an id that is taken by a record the member cannot see', () => {
		expect(
			refused(doc({ people: [person('anna')] }), context({ hiddenIds: new Set([idOf('anna')]) }))
		).toEqual([{ code: 'idTaken', path: 'people[0].ref', ref: 'anna' }]);
	});

	it('refuses a ref used twice', () => {
		expect(refused(doc({ people: [person('anna'), person('anna')] }))).toEqual([
			{ code: 'duplicateRef', path: 'people[1].ref', ref: 'anna' }
		]);
	});
});

describe('possible duplicates', () => {
	const directory = [
		{ id: 'c-1', displayName: 'Änna  MUSTER', birthDate: '2019-06-23' },
		{ id: 'c-2', displayName: 'Bert Muster', birthDate: null }
	];

	it('points out a new person whose name is already in the household, ignoring case and accents', () => {
		const plan = planned(doc({ people: [person('anna'), person('dora')] }), context({ directory }));
		expect(plan.report.possibleDuplicates).toEqual([
			{
				ref: 'anna',
				candidates: [{ id: 'c-1', displayName: 'Änna  MUSTER', birthDate: '2019-06-23' }]
			}
		]);
	});

	it('matches the name the other way round too', () => {
		const plan = planned(
			doc({ people: [person('bert', { firstName: 'Muster', lastName: 'Bert' })] }),
			context({ directory })
		);
		expect(plan.report.possibleDuplicates.map((d) => d.ref)).toEqual(['bert']);
	});

	it('does not point a person sent before at themselves', () => {
		const self = { id: idOf('anna'), displayName: 'Anna Muster', birthDate: null };
		const plan = planned(
			doc({ people: [person('anna')] }),
			context({ directory: [self], people: new Map([[self.id, self]]) })
		);
		expect(plan.report.possibleDuplicates).toEqual([]);
	});
});

describe('relationships', () => {
	const family: ApiPerson[] = [person('anna'), person('bert'), person('carl')];

	it('stores a parent link from the parent to the child', () => {
		const plan = planned(
			doc({ people: family, relationships: [link('anna', 'parent_child', 'carl')] })
		);
		expect(plan.relationships).toEqual([
			{
				id: `api~${SOURCE}~r~anna~parent_child~carl`,
				householdId: H,
				fromContactId: idOf('anna'),
				toContactId: idOf('carl'),
				typeId: 'parent_child',
				description: null,
				sinceDate: null,
				status: 'current',
				createdBy: ME,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
	});

	it('stores a symmetric link in canonical order, so either way round is the same link', () => {
		const plan = planned(doc({ people: family, relationships: [link('bert', 'partner', 'anna')] }));
		expect(plan.relationships[0]).toMatchObject({
			id: `api~${SOURCE}~r~anna~partner~bert`,
			fromContactId: idOf('anna'),
			toContactId: idOf('bert')
		});
	});

	it('links a new person to someone already in Stella', () => {
		const plan = planned(
			doc({
				people: [person('anna'), { ref: 'dora', existingId: 'c-dora' }],
				relationships: [link('anna', 'friend', 'dora')]
			}),
			context({
				people: new Map([['c-dora', { id: 'c-dora', displayName: 'Dora', birthDate: null }]])
			})
		);
		expect(plan.relationships).toHaveLength(1);
		expect([plan.relationships[0].fromContactId, plan.relationships[0].toContactId].sort()).toEqual(
			[idOf('anna'), 'c-dora'].sort()
		);
	});

	it('resolves a household type by its key', () => {
		const godparent = {
			id: 'rt-god',
			householdId: H,
			key: 'godparent',
			forwardLabel: 'Godparent of',
			reverseLabel: 'Godchild of',
			category: 'family' as const,
			symmetric: false,
			sortOrder: 100
		};
		const plan = planned(
			doc({ people: family, relationships: [link('anna', 'godparent', 'carl')] }),
			context({ types: [...BUILT_IN_RELATIONSHIP_TYPES, godparent] })
		);
		expect(plan.relationships[0].typeId).toBe('rt-god');
	});

	it('skips a link that is already on record, and counts it', () => {
		const people = new Map([
			['c-anna', { id: 'c-anna', displayName: 'Anna', birthDate: null }],
			['c-carl', { id: 'c-carl', displayName: 'Carl', birthDate: null }]
		]);
		const plan = planned(
			doc({
				people: [
					{ ref: 'anna', existingId: 'c-anna' },
					{ ref: 'carl', existingId: 'c-carl' }
				],
				relationships: [link('anna', 'parent_child', 'carl')]
			}),
			context({
				people,
				links: [
					{
						id: 'r-1',
						fromContactId: 'c-anna',
						toContactId: 'c-carl',
						typeId: 'parent_child',
						former: false
					}
				]
			})
		);
		expect(plan.relationships).toEqual([]);
		expect(plan.report.alreadyThere).toEqual({ relationships: 1, memberships: 0 });
	});

	it('names every link it cannot store, and stores none of them', () => {
		expect(
			refused(
				doc({
					people: family,
					relationships: [
						link('anna', 'parent_child', 'zora'),
						link('anna', 'best_friend', 'bert'),
						link('anna', 'friend', 'anna'),
						link('anna', 'friend', 'bert'),
						link('bert', 'friend', 'anna')
					]
				})
			)
		).toEqual([
			{ code: 'unknownRef', path: 'relationships[0].to', ref: 'zora' },
			{ code: 'unknownRelationshipType', path: 'relationships[1].type', type: 'best_friend' },
			{ code: 'selfRelationship', path: 'relationships[2]' },
			{ code: 'duplicateRelationship', path: 'relationships[4]' }
		]);
	});

	it('refuses a generation claimed both ways, in the document or against the record', () => {
		expect(
			refused(
				doc({
					people: family,
					relationships: [
						link('anna', 'parent_child', 'carl'),
						link('carl', 'parent_child', 'anna')
					]
				})
			)
		).toEqual([{ code: 'relationshipContradiction', path: 'relationships[1]' }]);

		const people = new Map([
			['c-anna', { id: 'c-anna', displayName: 'Anna', birthDate: null }],
			['c-carl', { id: 'c-carl', displayName: 'Carl', birthDate: null }]
		]);
		expect(
			refused(
				doc({
					people: [
						{ ref: 'anna', existingId: 'c-anna' },
						{ ref: 'carl', existingId: 'c-carl' }
					],
					relationships: [link('carl', 'parent_child', 'anna')]
				}),
				context({
					people,
					links: [
						{
							id: 'r-1',
							fromContactId: 'c-anna',
							toContactId: 'c-carl',
							typeId: 'parent_child',
							former: false
						}
					]
				})
			)
		).toEqual([{ code: 'relationshipContradiction', path: 'relationships[0]' }]);
	});

	it('refuses a third parent, counting the ones already on record', () => {
		const people = new Map([['c-carl', { id: 'c-carl', displayName: 'Carl', birthDate: null }]]);
		const graph: KinshipGraph = {
			...EMPTY_GRAPH,
			parentEdges: [{ parentId: 'c-x', childId: 'c-carl' }]
		};
		expect(
			refused(
				doc({
					people: [person('anna'), person('bert'), { ref: 'carl', existingId: 'c-carl' }],
					relationships: [
						link('anna', 'parent_child', 'carl'),
						link('bert', 'parent_child', 'carl')
					]
				}),
				context({ people, graph })
			)
		).toEqual([
			{
				code: 'relationshipExcluded',
				path: 'relationships[1]',
				reason: 'parentsComplete',
				personId: 'c-carl'
			}
		]);
	});

	it('refuses a partner for someone whose partnership still holds, and allows one that is over', () => {
		const people = new Map([['c-dora', { id: 'c-dora', displayName: 'Dora', birthDate: null }]]);
		const document = doc({
			people: [person('anna'), { ref: 'dora', existingId: 'c-dora' }],
			relationships: [link('anna', 'partner', 'dora')]
		});
		const holding: KinshipGraph = { ...EMPTY_GRAPH, partnerEdges: [{ a: 'c-dora', b: 'c-x' }] };
		expect(refused(document, context({ people, graph: holding }))).toEqual([
			{
				code: 'relationshipExcluded',
				path: 'relationships[0]',
				reason: 'romanticTaken',
				personId: 'c-dora'
			}
		]);

		const over: KinshipGraph = {
			...EMPTY_GRAPH,
			partnerEdges: [{ a: 'c-dora', b: 'c-x', former: true }]
		};
		expect(planned(document, context({ people, graph: over })).relationships).toHaveLength(1);
	});

	it('refuses a partner claimed twice for one person within the document', () => {
		expect(
			refused(
				doc({
					people: family,
					relationships: [link('anna', 'partner', 'bert'), link('anna', 'spouse', 'carl')]
				})
			)
		).toEqual([
			{
				code: 'relationshipExcluded',
				path: 'relationships[1]',
				reason: 'romanticTaken',
				personId: idOf('anna')
			}
		]);
	});
});

describe('circles', () => {
	const kindergarten = (over: Partial<Extract<ApiCircle, { name: string }>> = {}): ApiCircle => ({
		ref: 'kg',
		name: 'Kindergarten 2023/24',
		kind: 'class',
		description: null,
		startDate: '2023-08-01',
		endDate: '2024-07-31',
		parent: null,
		members: [
			{ person: 'anna', role: 'Child', startDate: '2023-08-01', endDate: '2024-07-31' },
			{ person: 'bert', role: 'Parent', startDate: null, endDate: null }
		],
		...over
	});

	it('creates a circle and its memberships under stable ids', () => {
		const plan = planned(
			doc({ people: [person('anna'), person('bert')], circles: [kindergarten()] })
		);
		expect(plan.circles).toEqual([
			{
				id: `api~${SOURCE}~c~kg`,
				householdId: H,
				createdBy: ME,
				visibility: 'shared',
				name: 'Kindergarten 2023/24',
				description: null,
				kind: 'class',
				color: expect.any(String),
				parentCircleId: null,
				startDate: '2023-08-01',
				endDate: '2024-07-31',
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
		expect(plan.memberships).toEqual([
			{
				id: `api~${SOURCE}~m~kg~anna`,
				circleId: `api~${SOURCE}~c~kg`,
				contactId: idOf('anna'),
				role: 'Child',
				startDate: '2023-08-01',
				endDate: '2024-07-31',
				createdBy: ME,
				createdAt: NOW,
				updatedAt: NOW
			},
			{
				id: `api~${SOURCE}~m~kg~bert`,
				circleId: `api~${SOURCE}~c~kg`,
				contactId: idOf('bert'),
				role: 'Parent',
				startDate: null,
				endDate: null,
				createdBy: ME,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
	});

	it('puts a circle inside another one of the document', () => {
		const plan = planned(
			doc({
				people: [person('anna'), person('bert')],
				circles: [
					{
						ref: 'school',
						name: 'Kindergarten',
						kind: 'school',
						description: null,
						startDate: null,
						endDate: null,
						parent: null,
						members: []
					},
					kindergarten({ parent: 'school' })
				]
			})
		);
		expect(plan.circles.map((c) => c.parentCircleId)).toEqual([null, `api~${SOURCE}~c~school`]);
	});

	it('refuses a parent that is not listed before the circle, itself included', () => {
		const circle = (ref: string, parent: string | null): ApiCircle => ({
			ref,
			name: ref,
			kind: null,
			description: null,
			startDate: null,
			endDate: null,
			parent,
			members: []
		});
		expect(
			refused(
				doc({ circles: [circle('kg', 'school'), circle('school', null), circle('loop', 'loop')] })
			)
		).toEqual([
			{ code: 'unknownRef', path: 'circles[0].parent', ref: 'school' },
			{ code: 'unknownRef', path: 'circles[2].parent', ref: 'loop' }
		]);
	});

	it('adds only those not yet in a circle that is already in Stella', () => {
		const plan = planned(
			doc({
				people: [person('anna'), { ref: 'carl', existingId: 'c-carl' }],
				circles: [
					{
						ref: 'kg',
						existingId: 'ci-kg',
						members: [
							{ person: 'anna', role: null, startDate: null, endDate: null },
							{ person: 'carl', role: null, startDate: null, endDate: null }
						]
					}
				]
			}),
			context({
				people: new Map([['c-carl', { id: 'c-carl', displayName: 'Carl', birthDate: null }]]),
				circles: new Map([['ci-kg', { id: 'ci-kg', name: 'Kindergarten', memberIds: ['c-carl'] }]])
			})
		);
		expect(plan.circles).toEqual([]);
		expect(plan.memberships.map((m) => [m.circleId, m.contactId])).toEqual([
			['ci-kg', idOf('anna')]
		]);
		expect(plan.report.alreadyThere).toEqual({ relationships: 0, memberships: 1 });
		expect(plan.report.circles).toEqual([
			{ ref: 'kg', id: 'ci-kg', name: 'Kindergarten', status: 'existing' }
		]);
	});

	it('leaves a circle sent before alone, and its members too', () => {
		const id = `api~${SOURCE}~c~kg`;
		const plan = planned(
			doc({ people: [person('anna'), person('bert')], circles: [kindergarten()] }),
			context({
				circles: new Map([
					[id, { id, name: 'Kindergarten 2023/24', memberIds: [idOf('anna'), idOf('bert')] }]
				])
			})
		);
		expect(plan.circles).toEqual([]);
		expect(plan.memberships).toEqual([]);
		expect(plan.report.circles[0].status).toBe('imported');
	});

	it('names what is wrong with a circle', () => {
		expect(
			refused(
				doc({
					people: [person('anna'), person('bert')],
					circles: [
						kindergarten({
							parent: 'nowhere',
							members: [
								{ person: 'anna', role: null, startDate: null, endDate: null },
								{ person: 'anna', role: null, startDate: null, endDate: null },
								{ person: 'zora', role: null, startDate: null, endDate: null }
							]
						}),
						{ ref: 'gone', existingId: 'ci-gone', members: [] }
					]
				}),
				context({ hiddenIds: new Set([`api~${SOURCE}~c~kg`]) })
			)
		).toEqual([
			{ code: 'idTaken', path: 'circles[0].ref', ref: 'kg' },
			{ code: 'unknownRef', path: 'circles[0].parent', ref: 'nowhere' },
			{ code: 'duplicateMember', path: 'circles[0].members[1]', ref: 'anna' },
			{ code: 'unknownRef', path: 'circles[0].members[2].person', ref: 'zora' },
			{ code: 'circleNotFound', path: 'circles[1].existingId', id: 'ci-gone' }
		]);
	});
});

describe('idsNamedBy', () => {
	it('lists every id the document points at or would write, so the household can be read for them', () => {
		expect(
			idsNamedBy(
				doc({
					people: [person('anna'), { ref: 'carl', existingId: 'c-carl' }],
					circles: [
						{
							ref: 'kg',
							name: 'Kindergarten',
							kind: null,
							description: null,
							startDate: null,
							endDate: null,
							parent: null,
							members: []
						},
						{ ref: 'old', existingId: 'ci-old', members: [] }
					]
				})
			)
		).toEqual({
			contactIds: [idOf('anna'), 'c-carl'],
			circleIds: [`api~${SOURCE}~c~kg`, 'ci-old']
		});
	});
});
