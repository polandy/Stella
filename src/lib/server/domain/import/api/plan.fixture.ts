import type { KinshipGraph } from '../../../../kinship/kinship';
import { BUILT_IN_RELATIONSHIP_TYPES } from '../../relationships/built-in-types';
import type { ApiImportDocument, ApiNewPerson, ApiRelationship } from './document';
import {
	planApiImport,
	type ApiImportContext,
	type ApiImportProblem,
	type KnownCircle
} from './plan';

/* What every planner test builds on: an empty household, a document, and the plan or refusal. */

export const H = 'household-1';
export const ME = 'user-1';
export const NOW = 1_700_000_000_000;
export const SOURCE = 'kindergarten';

export const EMPTY_GRAPH: KinshipGraph = {
	people: [],
	parentEdges: [],
	siblingEdges: [],
	partnerEdges: [],
	storedPairs: []
};

export function context(over: Partial<ApiImportContext> = {}): ApiImportContext {
	return {
		householdId: H,
		actorId: ME,
		defaultVisibility: 'shared',
		now: NOW,
		locale: 'en',
		people: new Map(),
		fieldsOf: new Map(),
		homesOf: new Map(),
		hiddenIds: new Set(),
		circles: new Map(),
		circleParents: new Map(),
		types: BUILT_IN_RELATIONSHIP_TYPES,
		links: [],
		graph: EMPTY_GRAPH,
		directory: [],
		...over
	};
}

export function person(ref: string, over: Partial<ApiNewPerson> = {}): ApiNewPerson {
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

export function doc(over: Partial<ApiImportDocument> = {}): ApiImportDocument {
	return { source: SOURCE, visibility: null, people: [], relationships: [], circles: [], ...over };
}

export const link = (from: string, type: string, to: string): ApiRelationship => ({
	from,
	to,
	type
});

export const idOf = (ref: string) => `api~${SOURCE}~p~${ref}`;

/** The plan, failing the test with the problems when the planner refused. */
export function planned(document: ApiImportDocument, ctx = context()) {
	const result = planApiImport(document, ctx);
	if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.problems)}`);
	return result.plan;
}

/** The problems, failing the test when the planner accepted. */
export function refused(document: ApiImportDocument, ctx = context()): ApiImportProblem[] {
	const result = planApiImport(document, ctx);
	if (result.ok) throw new Error('expected the document to be refused');
	return result.problems;
}

/** A circle the member sees, at the top and empty unless `over` says otherwise. */
export const knownCircle = (
	over: Partial<KnownCircle> & Pick<KnownCircle, 'id' | 'name'>
): KnownCircle => ({
	kind: 'other',
	description: null,
	startDate: null,
	endDate: null,
	parent: null,
	memberIds: [],
	...over
});
