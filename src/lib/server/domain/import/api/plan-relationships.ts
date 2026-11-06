import type { KinshipGraph } from '../../../../kinship/kinship';
import { exclusionFor, type SubjectTie } from '../../../../relationships/exclusions';
import { CURRENT_RELATIONSHIP_STATUS } from '../../../../relationships/status';
import {
	GENERATION_TYPE_KEYS,
	PARENT_CHILD_TYPE_KEY,
	PARTNER_TYPE_KEYS,
	SIBLING_TYPE_KEY
} from '../../../../relationships/type-keys';
import { relationshipPair } from '../../../../relationships/endpoints';
import type { NewRelationship, RelationshipType } from '../../relationships/relationships';
import { relationshipIdFor, type ApiImportDocument } from './document';
import type { ApiImportContext, ApiImportProblem } from './plan';

/*
 * The relationships half of an API import plan (docs/02 §2.16.1). Each link passes the same
 * guardrails as one entered by hand — duplicate, contradiction, exclusion — measured against
 * the household's links and the ones accepted earlier in the same document.
 */

/** A link on record or accepted earlier in the document, as the guardrails read it. */
interface Link {
	id: string;
	fromContactId: string;
	toContactId: string;
	type: RelationshipType;
	former: boolean;
}

const sameDirection = (link: Link, from: string, to: string, typeId: string) =>
	link.type.id === typeId && link.fromContactId === from && link.toContactId === to;

/** The link as the subject's profile reads it. */
const tieOf = (link: Link, subjectId: string): SubjectTie => {
	const forward = link.fromContactId === subjectId;
	return {
		relationshipId: link.id,
		otherContactId: forward ? link.toContactId : link.fromContactId,
		category: link.type.category,
		typeKey: link.type.key,
		side: forward ? 'forward' : 'reverse',
		label: forward ? link.type.forwardLabel : link.type.reverseLabel
	};
};

/** The household's graph with the document's people and accepted links added. */
function graphWith(
	graph: KinshipGraph,
	people: Iterable<string>,
	accepted: readonly Link[]
): KinshipGraph {
	const known = new Set(graph.people.map((p) => p.id));
	const added = [...people].filter((id) => !known.has(id)).map((id) => ({ id, displayName: id }));
	const pairs = accepted.map((l) => ({ a: l.fromContactId, b: l.toContactId }));
	return {
		people: [...graph.people, ...added],
		parentEdges: [
			...graph.parentEdges,
			...accepted
				.filter((l) => l.type.key === PARENT_CHILD_TYPE_KEY)
				.map((l) => ({ parentId: l.fromContactId, childId: l.toContactId }))
		],
		siblingEdges: [
			...graph.siblingEdges,
			...accepted
				.filter((l) => l.type.key === SIBLING_TYPE_KEY)
				.map((l) => ({ a: l.fromContactId, b: l.toContactId }))
		],
		partnerEdges: [
			...graph.partnerEdges,
			...accepted
				.filter((l) => PARTNER_TYPE_KEYS.includes(l.type.key))
				.map((l) => ({ a: l.fromContactId, b: l.toContactId }))
		],
		storedPairs: [...graph.storedPairs, ...pairs]
	};
}

export function planRelationships(
	document: ApiImportDocument,
	context: ApiImportContext,
	idByRef: ReadonlyMap<string, string>,
	problems: ApiImportProblem[]
) {
	const typeById = new Map(context.types.map((t) => [t.id, t]));
	// A built-in wins a key the household happens to reuse: the built-ins are what the
	// guardrails and the kinship engine know by key.
	const typeByKey = new Map<string, RelationshipType>();
	for (const type of context.types) {
		const held = typeByKey.get(type.key);
		if (!held || (held.householdId !== null && type.householdId === null))
			typeByKey.set(type.key, type);
	}
	const refById = new Map([...idByRef].map(([ref, id]) => [id, ref]));

	const onRecord: Link[] = context.links.flatMap((l) => {
		const type = typeById.get(l.typeId);
		return type
			? [
					{
						id: l.id,
						fromContactId: l.fromContactId,
						toContactId: l.toContactId,
						type,
						former: l.former
					}
				]
			: [];
	});
	const accepted: Link[] = [];
	const rows: NewRelationship[] = [];
	let alreadyThere = 0;

	document.relationships.forEach((entry, index) => {
		const at = `relationships[${index}]`;
		const from = idByRef.get(entry.from);
		const to = idByRef.get(entry.to);
		const type = typeByKey.get(entry.type);
		if (from === undefined)
			problems.push({ code: 'unknownRef', path: `${at}.from`, ref: entry.from });
		if (to === undefined) problems.push({ code: 'unknownRef', path: `${at}.to`, ref: entry.to });
		if (!type)
			problems.push({ code: 'unknownRelationshipType', path: `${at}.type`, type: entry.type });
		if (from === undefined || to === undefined || !type) return;
		if (from === to) {
			problems.push({ code: 'selfRelationship', path: at });
			return;
		}

		const endpoints = relationshipPair(from, to, type.symmetric);
		const stored = (link: Link) =>
			sameDirection(link, endpoints.fromContactId, endpoints.toContactId, type.id);
		if (accepted.some(stored)) {
			problems.push({ code: 'duplicateRelationship', path: at });
			return;
		}
		if (onRecord.some(stored)) {
			alreadyThere++;
			return;
		}
		const flipped = (link: Link) =>
			sameDirection(link, endpoints.toContactId, endpoints.fromContactId, type.id);
		if (GENERATION_TYPE_KEYS.includes(type.key) && [...onRecord, ...accepted].some(flipped)) {
			problems.push({ code: 'relationshipContradiction', path: at });
			return;
		}

		const everything = [...onRecord, ...accepted];
		const touching = (id: string) => (l: Link) => l.fromContactId === id || l.toContactId === id;
		const graph = graphWith(context.graph, idByRef.values(), accepted);
		const exclusion = exclusionFor(
			{
				subjectTies: everything.filter(touching(from)).map((l) => tieOf(l, from)),
				romanticPairs: graph.partnerEdges.filter((e) => !e.former).map((e) => ({ a: e.a, b: e.b })),
				parentEdges: graph.parentEdges
			},
			{
				subjectId: from,
				targetId: to,
				type: { key: type.key, category: type.category },
				side: endpoints.fromContactId === from ? 'forward' : 'reverse'
			}
		);
		if (exclusion) {
			problems.push({
				code: 'relationshipExcluded',
				path: at,
				reason: exclusion.reason,
				personId: exclusion.personId
			});
			return;
		}

		const id = relationshipIdFor(
			document.source,
			refById.get(endpoints.fromContactId) ?? endpoints.fromContactId,
			type.key,
			refById.get(endpoints.toContactId) ?? endpoints.toContactId
		);
		accepted.push({ id, ...endpoints, type, former: false });
		rows.push({
			id,
			householdId: context.householdId,
			...endpoints,
			typeId: type.id,
			description: null,
			sinceDate: null,
			status: CURRENT_RELATIONSHIP_STATUS,
			createdBy: context.actorId,
			createdAt: context.now,
			updatedAt: context.now
		});
	});

	return { rows, alreadyThere };
}
