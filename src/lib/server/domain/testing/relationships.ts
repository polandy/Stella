import type { KinshipGraph } from '../../../kinship/kinship';
import type {
	RelationshipRepository,
	RelationshipTieReads,
	RelationshipView
} from '../relationships/relationships';
import type { KinshipGraphReads } from '../relationships/suggestion-review';

/*
 * In-memory read models of the links between people. Like the people fakes (`contacts.ts`),
 * what a fake is built over is what the viewer may see: both endpoints visible is the access
 * layer's rule, covered against SQLite in `db/relationship-reads.test.ts`.
 */

/** A current link from the subject to `otherContactId`, with no specifics, plus what the test is about. */
export function someTie(
	id: string,
	otherContactId: string,
	fields: Partial<Omit<RelationshipView, 'id' | 'otherContactId'>> = {}
): RelationshipView {
	return {
		id,
		otherContactId,
		otherDisplayName: otherContactId,
		label: 'Linked to',
		// The built-in types carry their key as their id, so a test naming the key names both.
		typeId: fields.typeKey ?? 'some_type',
		typeKey: 'some_type',
		side: 'forward',
		category: 'social',
		description: null,
		sinceDate: null,
		status: 'current',
		...fields
	};
}

/** `KinshipGraphReads` over a fixed graph; the parts a test leaves out are empty. */
export function inMemoryKinshipGraph(graph: Partial<KinshipGraph> = {}): KinshipGraphReads {
	const read: KinshipGraph = {
		people: [],
		parentEdges: [],
		siblingEdges: [],
		partnerEdges: [],
		storedPairs: [],
		...graph
	};
	return { loadKinshipGraphVisibleTo: async () => read };
}

/** `RelationshipTieReads` over each person's ties, by their id; nobody else has any. */
export function inMemoryRelationshipTies(
	tiesOf: Readonly<Record<string, readonly RelationshipView[]>> = {}
): RelationshipTieReads {
	return { listForContactVisibleTo: async (_viewer, contactId) => [...(tiesOf[contactId] ?? [])] };
}

/** Every method of the port, so a stub can fail loud on the ones a test does not hand it. */
const RELATIONSHIP_REPOSITORY_METHODS: Record<keyof RelationshipRepository, true> = {
	exists: true,
	insert: true,
	insertAll: true,
	findVisibleTo: true,
	updateVisibleTo: true,
	removeVisibleTo: true,
	removeAllVisibleTo: true
};

/**
 * A `RelationshipRepository` that does what the test hands it and fails loud on anything else
 * (as `contactRepositoryWith`). The writes a test records are its own: that is what it asserts.
 */
export function relationshipRepositoryWith(
	methods: Partial<RelationshipRepository>
): RelationshipRepository {
	const unexpected = (name: string) => async () => {
		throw new Error(`RelationshipRepository.${name} was not expected in this test`);
	};
	const stubs = Object.fromEntries(
		Object.keys(RELATIONSHIP_REPOSITORY_METHODS).map((name) => [name, unexpected(name)])
	) as unknown as RelationshipRepository;
	return { ...stubs, ...methods };
}
