import { describe, expect, it } from 'bun:test';
import type { GraphModel } from '$lib/graph/model/types';
import { textOf } from '$lib/i18n/linked';
import { createTranslator } from '$lib/i18n/translate';
import type { KinshipGraph } from '$lib/kinship/kinship';
import { pairKey, type Dismissal } from '$lib/suggestions/claims';
import type { Viewer } from '../../access/visibility';
import { readFamilyOf, type FamilyReadDeps } from './family';
import { readExclusionFacts, readKinship, type RelationshipView } from './relationships';
import { reviewPerson, type ProposedLink } from './suggestion-review';

/*
 * The family cards of the person page, read once (docs/04 §4.11). What is pinned here is that
 * nothing changed for the reader — every answer is the one the separate use-cases give over the
 * same records — and that the store is asked once per thing rather than once per card.
 */

const viewer: Viewer = { id: 'u1', householdId: 'h1' };

/** Wing Kam is the mother of Andy and Linda; Steve is Andy's sibling; Andy and Mia are married. */
function family(): KinshipGraph {
	return {
		people: [
			{ id: 'wingkam', displayName: 'Wing Kam', gender: 'female' },
			{ id: 'andy', displayName: 'Andy', gender: 'male' },
			{ id: 'linda', displayName: 'Linda', gender: 'female' },
			{ id: 'steve', displayName: 'Steve', gender: 'male' },
			{ id: 'mia', displayName: 'Mia', gender: 'female' }
		],
		parentEdges: [
			{ parentId: 'wingkam', childId: 'andy' },
			{ parentId: 'wingkam', childId: 'linda' }
		],
		siblingEdges: [{ a: 'andy', b: 'steve' }],
		partnerEdges: [{ a: 'andy', b: 'mia', former: false }],
		storedPairs: [
			{ a: 'wingkam', b: 'andy' },
			{ a: 'andy', b: 'steve' },
			{ a: 'andy', b: 'steve' },
			{ a: 'andy', b: 'mia' }
		]
	};
}

const drawing: GraphModel = {
	nodes: [{ id: 'andy', kind: 'person', label: 'Andy' }],
	edges: []
};

const tie = (id: string, otherContactId: string): RelationshipView => ({
	id,
	otherContactId,
	otherDisplayName: otherContactId,
	label: 'Spouse of',
	typeId: 'spouse',
	typeKey: 'spouse',
	side: 'forward',
	category: 'romantic',
	description: null,
	sinceDate: null,
	status: 'current'
});

/** Linda as Steve's sibling, declined once. */
const declined: Dismissal[] = [
	{ relation: 'sibling', pairKey: pairKey('linda', 'steve'), dismissedAt: 1, dismissedBy: 'u1' }
];

function deps() {
	const asked = { family: 0, ties: 0, dismissals: 0 };
	const graph = family();
	const ties = [tie('r-spouse', 'mia')];
	const it: FamilyReadDeps & { asked: typeof asked } = {
		asked,
		family: {
			async loadVisibleGraphWithKinship(v) {
				expect(v).toEqual(viewer);
				asked.family++;
				return { graph: drawing, kinship: graph };
			}
		},
		relationships: {
			async listForContactVisibleTo(v, contactId) {
				expect([v, contactId]).toEqual([viewer, 'andy']);
				asked.ties++;
				return ties;
			}
		},
		dismissals: {
			async listForHousehold(v) {
				expect(v).toEqual(viewer);
				asked.dismissals++;
				return declined;
			}
		}
	};
	return it;
}

/** Suggestions with their reasons said, since a reason is a function until it is read. */
const said = (links: readonly ProposedLink[]) =>
	links.map((link) => ({ ...link, reason: textOf(link.reason(createTranslator('en'))) }));

/** The same records behind the separate use-cases, as the page read them before. */
function separately() {
	const source = deps();
	return {
		relationships: {
			loadKinshipGraphVisibleTo: async () => family(),
			listForContactVisibleTo: source.relationships.listForContactVisibleTo
		},
		dismissals: source.dismissals
	};
}

describe('readFamilyOf', () => {
	it('gives every family card the answer its own use-case gives', async () => {
		const proposeFor = [{ a: 'andy', b: 'steve' }];
		const read = await readFamilyOf(deps(), viewer, 'andy', { proposeFor, reviewOpen: true });

		const before = separately();
		const kinship = await readKinship(before, viewer, 'andy', proposeFor);
		expect(read.kinship.derived).toEqual(kinship.derived);
		expect(said(read.kinship.proposals)).toEqual(said(kinship.proposals));
		expect(said(read.reviewed)).toEqual(
			said(await reviewPerson(before, viewer, 'andy', { includeDismissed: true }))
		);
		expect(read.exclusionFacts).toEqual(await readExclusionFacts(before, viewer, 'andy'));
		expect(read.ties).toEqual([tie('r-spouse', 'mia')]);
		expect(read.graph).toBe(drawing);
		// Not vacuous: the fixture has relatives to derive, a proposal and a review to make.
		expect(read.kinship.derived.length).toBeGreaterThan(0);
		expect(read.kinship.proposals.length).toBeGreaterThan(0);
		expect(read.reviewed.length).toBeGreaterThan(0);
	});

	it('reads the family, the ties and the dismissals once for all the cards', async () => {
		const d = deps();
		await readFamilyOf(d, viewer, 'andy', { proposeFor: [{ a: 'andy', b: 'steve' }], reviewOpen: true });
		expect(d.asked).toEqual({ family: 1, ties: 1, dismissals: 1 });
	});

	it('leaves the dismissals unread when no proposal or review asks for them', async () => {
		const d = deps();
		const read = await readFamilyOf(d, viewer, 'andy', { proposeFor: [], reviewOpen: false });
		expect(d.asked).toEqual({ family: 1, ties: 1, dismissals: 0 });
		expect(read.kinship).toEqual(await readKinship(separately(), viewer, 'andy', []));
		expect(read.reviewed).toEqual([]);
	});
});
