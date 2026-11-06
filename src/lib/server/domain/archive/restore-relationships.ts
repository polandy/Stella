import { CURRENT_RELATIONSHIP_STATUS } from '../../../relationships/status';
import { relationshipPair } from '../../../relationships/endpoints';
import { foldedLinkDetails } from '../../../relationships/fold';
import type { RestoreContext } from './restore-context';
import { bool, int, records, str, type Row } from './restore-fields';

/*
 * The relationship types and the relationships an archive brings (docs/03 §relationship,
 * docs/02 §2.15). A link only survives when both its people and its type are here.
 */

export interface RelationshipTypesHere {
	/** Relationship types that already exist: the built-ins, plus the household's own. */
	relationshipTypeIds: readonly string[];
	/** Those of them that are symmetric, which decides the order a link's ends are stored in. */
	symmetricTypeIds: readonly string[];
}

export function planRelationships(
	document: Row,
	knownPeople: ReadonlySet<string>,
	here: RelationshipTypesHere,
	ctx: RestoreContext
): { relationshipTypes: Row[]; relationships: Row[] } {
	const { warn } = ctx;
	const relationshipTypes: Row[] = [];
	const knownTypes = new Set(here.relationshipTypeIds);
	const symmetricTypes = new Set(here.symmetricTypeIds);
	records(document, 'relationship_types').forEach((type, index) => {
		const id = str(type, 'id');
		const key = str(type, 'key');
		const forward = str(type, 'forward_label');
		if (id === null || key === null || forward === null) {
			warn({ code: 'relationshipTypeWithoutName' });
			return;
		}
		// A type already here keeps its row, so its links are stored the way that row says.
		if (!knownTypes.has(id) && bool(type, 'symmetric')) symmetricTypes.add(id);
		knownTypes.add(id);
		relationshipTypes.push({
			id,
			household_id: ctx.householdId,
			key,
			forward_label: forward,
			reverse_label: str(type, 'reverse_label') ?? forward,
			category: str(type, 'category') ?? 'other',
			symmetric: bool(type, 'symmetric') ? 1 : 0,
			sort_order: int(type, 'sort_order') ?? index
		});
	});

	const relationships: Row[] = [];
	/*
	 * Each link takes its ends from `relationshipPair`, like every other writer's (docs/03
	 * §relationship): an archive from before migration 0025, or one edited by hand, can hold a
	 * symmetric link the wrong way round, and the unique index and the duplicate check would miss
	 * it from the other end. The same link from both ends is restored once, as 0025 folded it:
	 * the copy stored sorted keeps its row and takes only the blanks the other can fill. One the
	 * household already has is left to the adapter, which keeps the household's row whole.
	 */
	const symmetricLinks = new Map<string, { row: Row; givenSorted: boolean }>();
	const fold = (kept: Row, copy: Row) => {
		const filled = foldedLinkDetails(
			{ description: kept.note as string | null, sinceDate: kept.since_date as string | null },
			{ description: copy.note as string | null, sinceDate: copy.since_date as string | null }
		);
		if (filled.description !== undefined) kept.note = filled.description;
		if (filled.sinceDate !== undefined) kept.since_date = filled.sinceDate;
	};
	for (const link of records(document, 'relationships')) {
		const from = str(link, 'from');
		const to = str(link, 'to');
		const type = str(link, 'type');
		if (from === null || to === null || type === null) {
			warn({ code: 'relationshipMissingEnd' });
			continue;
		}
		if (!knownPeople.has(from) || !knownPeople.has(to)) {
			warn({ code: 'relationshipsMissingPeople' });
			continue;
		}
		if (!knownTypes.has(type)) {
			warn({ code: 'relationshipUnknownType' });
			continue;
		}
		if (from === to) {
			warn({ code: 'relationshipToItself' });
			continue;
		}
		const symmetric = symmetricTypes.has(type);
		const pair = relationshipPair(from, to, symmetric);
		const row: Row = {
			id: str(link, 'id') ?? ctx.ids.next(),
			household_id: ctx.householdId,
			from_contact_id: pair.fromContactId,
			to_contact_id: pair.toContactId,
			type_id: type,
			note: str(link, 'description'),
			since_date: str(link, 'since'),
			// An archive from before the status meant anything carries none; a link that is on
			// record holds until someone ends it (docs/02 §2.4).
			status: str(link, 'status') ?? CURRENT_RELATIONSHIP_STATUS,
			created_by: ctx.author(link),
			...ctx.stamps(link)
		};
		if (!symmetric) {
			relationships.push(row);
			continue;
		}
		const key = JSON.stringify([pair.fromContactId, pair.toContactId, type]);
		const givenSorted = from === pair.fromContactId;
		const twin = symmetricLinks.get(key);
		if (twin === undefined) {
			symmetricLinks.set(key, { row, givenSorted });
			relationships.push(row);
			continue;
		}
		warn({ code: 'relationshipTwinFolded' });
		if (twin.givenSorted || !givenSorted) {
			fold(twin.row, row);
			continue;
		}
		fold(row, twin.row);
		relationships[relationships.indexOf(twin.row)] = row;
		symmetricLinks.set(key, { row, givenSorted });
	}
	return { relationshipTypes, relationships };
}
