import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { PARENT_CHILD_TYPE_KEY } from '$lib/relationships/type-keys';
import type { KinshipGraph } from '$lib/kinship/kinship';
import type { Relation } from '$lib/suggestions/types';
import type { Viewer } from '$lib/server/access/visibility';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import type { RelationshipType } from '$lib/server/domain/relationships/relationships';
import type { NewDismissal } from '$lib/server/domain/relationships/suggestion-review';
import {
	acceptClaim,
	declineClaim,
	restoreClaim,
	type ClaimAnswerServices
} from './suggestion-answers';

/*
 * The three answers a suggestion takes, on whichever screen it was offered (docs/02 §2.4.1).
 * The use-cases have their own suites; what is pinned here is the edge's part — the form read,
 * the refusal and its status — against fakes of the few ports the answers reach.
 */

const t = createTranslator('en');
const viewer: Viewer = { id: 'u1', householdId: 'h1' };
const PARENT: RelationshipType = {
	id: 'type-parent',
	householdId: null,
	key: PARENT_CHILD_TYPE_KEY,
	forwardLabel: 'parent',
	reverseLabel: 'child',
	category: 'family',
	symmetric: false,
	sortOrder: 0
};

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) data.set(name, value);
	return data;
};

const graph = (ids: string[]): KinshipGraph => ({
	people: ids.map((id) => ({ id, displayName: id })),
	parentEdges: [],
	siblingEdges: [],
	partnerEdges: [],
	storedPairs: []
});

/** The household's visible people, its stored links and its log of declined claims. */
function fakes(visible: string[], stored: [string, string, string][] = []) {
	const inserted: unknown[] = [];
	const dismissed: NewDismissal[] = [];
	const restored: string[] = [];
	const services = {
		people: {
			contactDeps: {
				contacts: {
					findByIdVisibleTo: async (_v: Viewer, id: string) =>
						visible.includes(id) ? ({ id } as Contact) : null
				}
			}
		},
		relationships: {
			relationshipDeps: {
				relationships: {
					exists: async (from: string, to: string, typeId: string) =>
						stored.some(([f, tt, ty]) => f === from && tt === to && ty === typeId),
					insert: async (row: unknown) => {
						inserted.push(row);
					},
					loadKinshipGraphVisibleTo: async () => graph(visible),
					listForContactVisibleTo: async () => []
				},
				types: { getType: async (_v: Viewer, id: string) => (id === PARENT.id ? PARENT : null) },
				ids: { next: () => 'id-1' },
				clock: { now: () => 42 }
			},
			suggestionReviewDeps: {
				relationships: { loadKinshipGraphVisibleTo: async () => graph(visible) },
				dismissals: {
					listForHousehold: async () => [],
					dismiss: async (entry: NewDismissal) => {
						dismissed.push(entry);
					},
					restore: async (_v: Viewer, relation: Relation, pair: string) => {
						restored.push(`${relation}:${pair}`);
						return false;
					}
				},
				ids: { next: () => 'id-2' },
				clock: { now: () => 42 }
			}
		}
	} satisfies ClaimAnswerServices;
	return { services, inserted, dismissed, restored };
}

describe('acceptClaim', () => {
	const claim = { fromId: 'wingkam', toId: 'andy', typeId: PARENT.id };

	it('stores the link the claim offers', async () => {
		const f = fakes(['wingkam', 'andy']);
		expect(await acceptClaim(f.services, viewer, form(claim), t)).toBeNull();
		expect(f.inserted).toHaveLength(1);
	});

	it('refuses a form that names no claim', async () => {
		const f = fakes(['wingkam', 'andy']);
		expect(await acceptClaim(f.services, viewer, form({ fromId: 'wingkam' }), t)).toEqual({
			status: 400,
			message: t('errors.relationship.badSuggestion')
		});
	});

	it('refuses a claim about someone the viewer cannot see', async () => {
		const f = fakes(['wingkam']);
		expect(await acceptClaim(f.services, viewer, form(claim), t)).toEqual({
			status: 400,
			message: t('errors.person.notFound')
		});
		expect(f.inserted).toEqual([]);
	});

	it('answers 409 when the household already holds the opposite link', async () => {
		const f = fakes(['wingkam', 'andy'], [['andy', 'wingkam', PARENT.id]]);
		expect(await acceptClaim(f.services, viewer, form(claim), t)).toEqual({
			status: 409,
			message: t('errors.relationship.contradiction')
		});
	});

	it('is silent about a link that is already there', async () => {
		const f = fakes(['wingkam', 'andy'], [['wingkam', 'andy', PARENT.id]]);
		expect(await acceptClaim(f.services, viewer, form(claim), t)).toBeNull();
		expect(f.inserted).toEqual([]);
	});
});

describe('declineClaim', () => {
	const claim = { relation: 'parent', fromId: 'wingkam', toId: 'andy' };

	it('records the household’s no', async () => {
		const f = fakes(['wingkam', 'andy']);
		expect(await declineClaim(f.services, viewer, form(claim), t)).toBeNull();
		expect(f.dismissed.map((d) => [d.relation, d.dismissedBy])).toEqual([['parent', 'u1']]);
	});

	it('refuses an unknown relation', async () => {
		const f = fakes(['wingkam', 'andy']);
		const answer = await declineClaim(f.services, viewer, form({ ...claim, relation: 'x' }), t);
		expect(answer).toEqual({ status: 400, message: t('errors.relationship.badSuggestion') });
	});

	it('refuses a claim about someone the viewer cannot see', async () => {
		const f = fakes(['andy']);
		expect(await declineClaim(f.services, viewer, form(claim), t)).toEqual({
			status: 400,
			message: t('errors.person.notFound')
		});
		expect(f.dismissed).toEqual([]);
	});
});

describe('restoreClaim', () => {
	it('takes the no back, and nothing to take back is no failure', async () => {
		const f = fakes(['wingkam', 'andy']);
		const claim = { relation: 'parent', fromId: 'wingkam', toId: 'andy' };
		expect(await restoreClaim(f.services, viewer, form(claim), t)).toBeNull();
		expect(f.restored).toHaveLength(1);
	});

	it('refuses a form that names no claim', async () => {
		const f = fakes([]);
		expect(await restoreClaim(f.services, viewer, form({}), t)).toEqual({
			status: 400,
			message: t('errors.relationship.badSuggestion')
		});
	});
});
