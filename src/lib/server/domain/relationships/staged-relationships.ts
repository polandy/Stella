import { kinshipGraphOf } from '../../../kinship/graph-of';
import type { KinshipGraph } from '../../../kinship/kinship';
import type { Viewer } from '../../access/visibility';
import type { RelationshipTypeRepository } from './relationship-types';
import {
	describeRelationshipFor,
	type CreateRelationshipDeps,
	type NewRelationship,
	type RelationshipType,
	type RelationshipView
} from './relationships';

/*
 * Links held back while a batch is checked (docs/02 §2.4, ADR-118). It stands in front of the
 * store and reads as though the
 * links staged so far were already on record, so `createRelationship` judges each new link
 * against the household *and* the earlier links of the same batch — a third parent, a second
 * partner, the same person picked twice — without a guardrail of its own. `insert` only
 * stages; the batch writes `staged()` in one transaction once every link has passed.
 */

/** The store and the two read models a link is judged against — all three see the staging. */
type Stageable = Pick<CreateRelationshipDeps, 'relationships' | 'kinship' | 'ties'>;

export interface StagedRelationships {
	/** The store and its reads with the staged links read into them; `insert` stages instead. */
	deps: Stageable;
	/** What passed, in the order it was staged. */
	staged(): readonly NewRelationship[];
	/** A person's display name as the viewer sees it, or '' for someone out of their sight. */
	nameOf(viewer: Viewer, contactId: string): Promise<string>;
}

export function stageRelationships(
	store: Stageable,
	types: Pick<RelationshipTypeRepository, 'getType'>
): StagedRelationships {
	const staged: NewRelationship[] = [];
	// Nothing is written while the batch is checked, so the household is read once rather than
	// once per picked person.
	let household: Promise<KinshipGraph> | null = null;
	const tiesOf = new Map<string, Promise<RelationshipView[]>>();
	const typeById = new Map<string, Promise<RelationshipType | null>>();

	const graphOf = (viewer: Viewer) =>
		(household ??= store.kinship.loadKinshipGraphVisibleTo(viewer));
	const typeOf = async (viewer: Viewer, typeId: string): Promise<RelationshipType> => {
		if (!typeById.has(typeId)) typeById.set(typeId, types.getType(viewer, typeId));
		const type = await typeById.get(typeId);
		// Only links `createRelationship` resolved the type of are ever staged.
		if (!type) throw new Error(`A staged link carries an unknown type: ${typeId}`);
		return type;
	};
	const nameOf = async (viewer: Viewer, contactId: string) =>
		(await graphOf(viewer)).people.find((person) => person.id === contactId)?.displayName ?? '';

	const relationships: Stageable['relationships'] = {
		async exists(fromContactId, toContactId, typeId, exceptId) {
			const isStaged = staged.some(
				(link) =>
					link.fromContactId === fromContactId &&
					link.toContactId === toContactId &&
					link.typeId === typeId
			);
			return isStaged || store.relationships.exists(fromContactId, toContactId, typeId, exceptId);
		},

		async insert(relationship) {
			staged.push(relationship);
		}
	};

	const kinship: Stageable['kinship'] = {
		async loadKinshipGraphVisibleTo(viewer) {
			const graph = await graphOf(viewer);
			const rows = await Promise.all(
				staged.map(async (link) => ({
					fromId: link.fromContactId,
					toId: link.toContactId,
					key: (await typeOf(viewer, link.typeId)).key,
					status: link.status
				}))
			);
			const added = kinshipGraphOf([], rows);
			return {
				people: graph.people,
				parentEdges: [...graph.parentEdges, ...added.parentEdges],
				siblingEdges: [...graph.siblingEdges, ...added.siblingEdges],
				partnerEdges: [...graph.partnerEdges, ...added.partnerEdges],
				storedPairs: [...graph.storedPairs, ...added.storedPairs]
			};
		}
	};

	const ties: Stageable['ties'] = {
		async listForContactVisibleTo(viewer, contactId) {
			if (!tiesOf.has(contactId))
				tiesOf.set(contactId, store.ties.listForContactVisibleTo(viewer, contactId));
			const onRecord = (await tiesOf.get(contactId)) ?? [];
			const stagedTies = await Promise.all(
				staged
					.filter((link) => link.fromContactId === contactId || link.toContactId === contactId)
					.map(async (link): Promise<RelationshipView> => {
						const type = await typeOf(viewer, link.typeId);
						const seen = describeRelationshipFor(contactId, link, type);
						return {
							id: link.id,
							otherContactId: seen.otherContactId,
							otherDisplayName: await nameOf(viewer, seen.otherContactId),
							label: seen.label,
							typeId: type.id,
							typeKey: type.key,
							side: seen.side,
							category: seen.category,
							description: link.description,
							sinceDate: link.sinceDate,
							status: link.status
						};
					})
			);
			return [...onRecord, ...stagedTies];
		}
	};

	return { deps: { relationships, kinship, ties }, staged: () => [...staged], nameOf };
}
