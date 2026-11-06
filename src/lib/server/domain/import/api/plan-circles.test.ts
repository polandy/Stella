import { describe, expect, it } from 'bun:test';
import type { ApiExistingCircle, ApiImportDocument, ApiNewCircle } from './document';
import type { ApiImportProblem } from './plan';
import { planCircles } from './plan-circles';
import { context, doc, knownCircle, ME, NOW, SOURCE } from './plan.fixture';

/*
 * The circles of an API import, planned on their own (docs/02 §2.16.1). The whole planner's
 * tests (`plan.test.ts`, `plan-circle-changes.test.ts`) cover moves, loops and periods; these
 * pin what a circle entry becomes and the refusals only a circle can raise.
 */

const KITA_ID = `api~${SOURCE}~c~kita`;

const newCircle = (ref: string, over: Partial<ApiNewCircle> = {}): ApiNewCircle => ({
	ref,
	name: ref,
	kind: null,
	description: null,
	startDate: null,
	endDate: null,
	parent: null,
	members: [],
	...over
});

const existing = (ref: string, existingId: string, over: Partial<ApiExistingCircle> = {}) =>
	({ ref, existingId, members: [], details: {}, ...over }) satisfies ApiExistingCircle;

const member = (
	person: string,
	over: { role?: string | null; startDate?: string | null } = {}
) => ({
	person,
	role: null,
	startDate: null,
	endDate: null,
	...over
});

const people = new Map([
	['anna', 'c-anna'],
	['bert', 'c-bert']
]);

function plan(document: ApiImportDocument, ctx = context()) {
	const problems: ApiImportProblem[] = [];
	return { ...planCircles(document, ctx, people, problems), problems };
}

describe('planCircles', () => {
	it('creates a new circle with its text trimmed, blanks left empty, and the default kind and colour', () => {
		const { rows, report, problems } = plan(
			doc({
				circles: [newCircle('kita', { name: '  Kita  ', description: ' ', startDate: ' ' })]
			})
		);

		expect(problems).toEqual([]);
		expect(rows).toEqual([
			{
				id: KITA_ID,
				householdId: 'household-1',
				createdBy: ME,
				visibility: 'shared',
				name: 'Kita',
				description: null,
				kind: 'other',
				color: 'blue',
				parentCircleId: null,
				startDate: null,
				endDate: null,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
		expect(report).toEqual([
			{ ref: 'kita', id: KITA_ID, name: 'Kita', status: 'new', changes: {} }
		]);
	});

	it('creates a circle under the document’s visibility over the household default', () => {
		const { rows } = plan(doc({ visibility: 'private', circles: [newCircle('kita')] }));
		expect(rows[0]?.visibility).toBe('private');
	});

	it('refuses a ref listed twice and plans the first entry alone', () => {
		const { rows, problems } = plan(doc({ circles: [newCircle('kita'), newCircle('kita')] }));

		expect(problems).toEqual([{ code: 'duplicateRef', path: 'circles[1].ref', ref: 'kita' }]);
		expect(rows.map((r) => r.id)).toEqual([KITA_ID]);
	});

	it('refuses a circle once: a child of one whose entry was refused raises nothing more', () => {
		const { problems } = plan(
			doc({ circles: [existing('gone', 'ci-gone'), newCircle('room', { parent: 'gone' })] })
		);

		expect(problems).toEqual([
			{ code: 'circleNotFound', path: 'circles[0].existingId', id: 'ci-gone' }
		]);
	});

	it('plans a membership with its role and dates trimmed, blanks left empty', () => {
		const { memberships } = plan(
			doc({
				circles: [
					newCircle('kita', {
						members: [member('anna', { role: ' Child ', startDate: ' 2023-08-01 ' })]
					}),
					newCircle('room', { members: [member('bert', { role: '  ' })] })
				]
			})
		);

		expect(memberships).toEqual([
			{
				id: `api~${SOURCE}~m~kita~anna`,
				circleId: KITA_ID,
				contactId: 'c-anna',
				role: 'Child',
				startDate: '2023-08-01',
				endDate: null,
				createdBy: ME,
				createdAt: NOW,
				updatedAt: NOW
			},
			expect.objectContaining({ contactId: 'c-bert', role: null })
		]);
	});

	it('counts a member already in a circle in Stella and plans no membership for them', () => {
		const { memberships, alreadyThere, circleChanges, report } = plan(
			doc({ circles: [existing('kg', 'ci-kg', { members: [member('anna'), member('bert')] })] }),
			context({
				circles: new Map([
					['ci-kg', knownCircle({ id: 'ci-kg', name: 'KG', memberIds: ['c-anna'] })]
				])
			})
		);

		expect(alreadyThere).toBe(1);
		expect(memberships.map((m) => m.contactId)).toEqual(['c-bert']);
		// An entry naming no details changes nothing of the circle itself.
		expect(circleChanges).toEqual([]);
		expect(report).toEqual([
			{ ref: 'kg', id: 'ci-kg', name: 'KG', status: 'existing', changes: {} }
		]);
	});
});
