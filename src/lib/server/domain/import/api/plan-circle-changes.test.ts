import { describe, expect, it } from 'bun:test';
import type { ApiCircleDetails, ApiExistingCircle, ApiNewCircle } from './document';
import type { KnownCircle } from './plan';
import { context, doc, knownCircle, NOW, planned, refused, SOURCE } from './plan.fixture';

/*
 * Changing a circle already in Stella (docs/02 §2.16.1): a school career put in order after the
 * fact — the old class renamed and moved, with the kindergarten years, inside one new circle. A
 * detail the entry names is set, one it leaves out is kept, and the household's nesting is read
 * whole, so no move can put a circle inside itself.
 */

const KG = knownCircle({
	id: 'ci-kg',
	name: 'Kindergarten Munzingerstrasse 2023/24',
	kind: 'class',
	description: 'Room 2',
	startDate: '2023-08-01',
	endDate: null
});

const existing = (
	ref: string,
	existingId: string,
	details: Partial<ApiCircleDetails> = {}
): ApiExistingCircle => ({ ref, existingId, members: [], details });

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

/** The household with `circles` visible; their parents are the household's whole nesting. */
const household = (circles: KnownCircle[], hiddenParents: [string, string | null][] = []) =>
	context({
		circles: new Map(circles.map((c) => [c.id, c])),
		circleParents: new Map([
			...circles.map((c): [string, string | null] => [c.id, c.parent?.id ?? null]),
			...hiddenParents
		])
	});

describe('changing a circle already in Stella', () => {
	it('sets the details its entry names and reports each one old → new', () => {
		const plan = planned(
			doc({
				circles: [
					existing('kg', KG.id, {
						name: '  Kindergarten Munzi II 23/24 ',
						kind: 'school',
						endDate: '2024-07-31'
					})
				]
			}),
			household([KG])
		);
		expect(plan.circles).toEqual([]);
		expect(plan.circleChanges).toEqual([
			{
				id: KG.id,
				set: { name: 'Kindergarten Munzi II 23/24', kind: 'school', endDate: '2024-07-31' },
				updatedAt: NOW
			}
		]);
		expect(plan.report.circles).toEqual([
			{
				ref: 'kg',
				id: KG.id,
				name: 'Kindergarten Munzi II 23/24',
				status: 'existing',
				changes: {
					name: {
						from: 'Kindergarten Munzingerstrasse 2023/24',
						to: 'Kindergarten Munzi II 23/24'
					},
					kind: { from: 'class', to: 'school' },
					endDate: { from: null, to: '2024-07-31' }
				}
			}
		]);
	});

	it('clears what null names and keeps what the entry leaves out', () => {
		const plan = planned(
			doc({ circles: [existing('kg', KG.id, { description: null, startDate: null })] }),
			household([KG])
		);
		expect(plan.circleChanges).toEqual([
			{ id: KG.id, set: { description: null, startDate: null }, updatedAt: NOW }
		]);
	});

	it('changes nothing when the circle already has what is sent, so a re-send is a no-op', () => {
		const plan = planned(
			doc({
				circles: [
					existing('kg', KG.id, { name: KG.name, kind: 'class', endDate: null, parent: null })
				]
			}),
			household([KG])
		);
		expect(plan.circleChanges).toEqual([]);
		expect(plan.report.circles[0].changes).toEqual({});
	});

	it('moves circles inside a new one listed earlier — the school career', () => {
		const klasse = knownCircle({ id: 'ci-klasse', name: 'Leonardo Schule' });
		const plan = planned(
			doc({
				circles: [
					newCircle('school', { name: 'Leonardo Schule', kind: 'school' }),
					existing('klasse', klasse.id, { name: 'Klasse 1-2D 26/27', parent: 'school' }),
					existing('kg', KG.id, { parent: 'school' })
				]
			}),
			household([klasse, KG])
		);
		const school = `api~${SOURCE}~c~school`;
		expect(plan.circles.map((c) => [c.id, c.parentCircleId])).toEqual([[school, null]]);
		expect(plan.circleChanges).toEqual([
			{ id: klasse.id, set: { name: 'Klasse 1-2D 26/27', parentCircleId: school }, updatedAt: NOW },
			{ id: KG.id, set: { parentCircleId: school }, updatedAt: NOW }
		]);
		expect(plan.report.circles[1].changes.parent).toEqual({
			from: null,
			to: { id: school, name: 'Leonardo Schule' }
		});
	});

	it('moves a circle inside another existing one, named by its new name', () => {
		const parent = knownCircle({ id: 'ci-school', name: 'School' });
		const plan = planned(
			doc({
				circles: [
					existing('school', parent.id, { name: 'Leonardo Schule' }),
					existing('kg', KG.id, { parent: 'school' })
				]
			}),
			household([parent, KG])
		);
		expect(plan.circleChanges[1]).toEqual({
			id: KG.id,
			set: { parentCircleId: parent.id },
			updatedAt: NOW
		});
		expect(plan.report.circles[1].changes.parent?.to).toEqual({
			id: parent.id,
			name: 'Leonardo Schule'
		});
	});

	it('takes a circle back to the top, and only says a parent it may not see was there', () => {
		const kg = { ...KG, parent: { id: 'ci-secret', name: null } };
		const plan = planned(
			doc({ circles: [existing('kg', kg.id, { parent: null })] }),
			household([kg], [['ci-secret', null]])
		);
		expect(plan.circleChanges).toEqual([
			{ id: kg.id, set: { parentCircleId: null }, updatedAt: NOW }
		]);
		expect(plan.report.circles[0].changes.parent).toEqual({ from: { hidden: true }, to: null });
	});

	it('leaves a circle this document created before alone, details and all', () => {
		const id = `api~${SOURCE}~c~kg`;
		const plan = planned(
			doc({ circles: [newCircle('kg', { name: 'Renamed' })] }),
			household([knownCircle({ id, name: 'Kindergarten' })])
		);
		expect(plan.circleChanges).toEqual([]);
		expect(plan.report.circles[0]).toMatchObject({ name: 'Kindergarten', status: 'imported' });
	});
});

describe('what a change may not do', () => {
	it('refuses a move inside a circle nested in it, through one the member cannot see', () => {
		// Klasse sits in a hidden circle, which sits in KG: KG cannot move inside Klasse.
		const klasse = knownCircle({
			id: 'ci-klasse',
			name: 'Klasse',
			parent: { id: 'ci-hidden', name: null }
		});
		expect(
			refused(
				doc({
					circles: [existing('klasse', klasse.id), existing('kg', KG.id, { parent: 'klasse' })]
				}),
				household([klasse, KG], [['ci-hidden', KG.id]])
			)
		).toEqual([{ code: 'circleCycle', path: 'circles[1].parent', ref: 'klasse' }]);
	});

	it('refuses a loop closed by moves earlier in the same document', () => {
		const a = knownCircle({ id: 'ci-a', name: 'A' });
		const b = knownCircle({ id: 'ci-b', name: 'B' });
		expect(
			refused(
				doc({
					circles: [
						existing('b', b.id),
						existing('a', a.id, { parent: 'b' }),
						existing('b-again', b.id, { parent: 'a' })
					]
				}),
				household([a, b])
			)
		).toEqual([{ code: 'circleCycle', path: 'circles[2].parent', ref: 'a' }]);
	});

	it('refuses a circle inside itself', () => {
		expect(
			refused(
				doc({ circles: [existing('kg', KG.id), existing('kg-again', KG.id, { parent: 'kg' })] }),
				household([KG])
			)
		).toEqual([{ code: 'circleCycle', path: 'circles[1].parent', ref: 'kg' }]);
	});

	it('refuses a parent not listed before the circle', () => {
		expect(
			refused(
				doc({ circles: [existing('kg', KG.id, { parent: 'school' }), newCircle('school')] }),
				household([KG])
			)
		).toEqual([{ code: 'unknownRef', path: 'circles[0].parent', ref: 'school' }]);
	});

	it('refuses a parent the member cannot see, as a circle that is not there', () => {
		expect(
			refused(
				doc({
					circles: [
						existing('elsewhere', 'ci-other-household'),
						existing('kg', KG.id, { parent: 'elsewhere' })
					]
				}),
				household([KG])
			)
		).toEqual([
			{ code: 'circleNotFound', path: 'circles[0].existingId', id: 'ci-other-household' }
		]);
	});

	it('refuses a period that ends before it starts, the kept half included', () => {
		expect(
			refused(
				doc({
					circles: [
						existing('kg', KG.id, { endDate: '2023-07-31' }),
						newCircle('class', { startDate: '2026-08-01', endDate: '2026-07-31' })
					]
				}),
				household([KG])
			)
		).toEqual([
			{ code: 'periodBackwards', path: 'circles[0].endDate' },
			{ code: 'periodBackwards', path: 'circles[1].endDate' }
		]);
	});
});
