import { CURRENT_RELATIONSHIP_STATUS } from '../../../../relationships/status';
import { relationshipPair } from '../../../../relationships/endpoints';
import { BUILT_IN_RELATIONSHIP_TYPES } from '../../relationships/built-in-types';
import type { NewRelationship } from '../../relationships/relationships';
import type { SourceExport } from './monica-export';
import type { ImportedRelationshipType, MonicaPlanContext } from './plan';
import { mapRelationshipType } from './relationship-types';

/*
 * Monica's relationships, each mapped onto a built-in type where Stella has one and onto a
 * custom type created for it otherwise (docs/02 §2.16, docs/monica-mapping.md).
 */

export function planRelationships(
	exp: SourceExport,
	ctx: MonicaPlanContext
): { relationships: NewRelationship[]; relationshipTypes: ImportedRelationshipType[] } {
	const { prefix, contactId, liveIds, opts, skip } = ctx;
	const typeNames = new Map(exp.relationshipTypes.map((t) => [t.id, t.name]));
	const customTypes = new Map<string, ImportedRelationshipType>();
	const seenRelationships = new Set<string>();
	const relationships: NewRelationship[] = [];
	const unknownTypeNames = new Set<string>();
	for (const r of exp.relationships) {
		if (!liveIds.has(r.contactIs) || !liveIds.has(r.ofContact)) {
			skip('relationship', 'refersToDeletedContact');
			continue;
		}
		// Monica lets a row name one contact at both ends; Stella refuses such a link
		// (`relationshipPair`), so the row is left out rather than failing the whole import.
		if (r.contactIs === r.ofContact) {
			skip('relationship', 'linksPersonToThemselves');
			continue;
		}
		const name = typeNames.get(r.typeId) ?? `type ${r.typeId}`;
		const mapped = mapRelationshipType(name);
		let typeId = mapped.key;
		if (mapped.custom) {
			typeId = `${prefix}:reltype:${mapped.key}`;
			if (!customTypes.has(typeId)) {
				customTypes.set(typeId, {
					id: typeId,
					householdId: opts.householdId,
					key: mapped.key,
					...mapped.custom
				});
				if (mapped.custom.category === 'other') unknownTypeNames.add(name);
			}
		}
		const symmetric = mapped.custom?.symmetric ?? isBuiltInSymmetric(mapped.key);
		// Monica's own migration that built this table (`migrate_offsprings`, 2018) proves the
		// row reads backwards from how it looks: "contact_is <type> of_contact" really means
		// of_contact holds the named role and contact_is is the implicit other end — a "child"
		// row has contact_is as the *parent* and of_contact as the child. `mapped.forward` says
		// whether Monica's type name is Stella's forward-label side, and that role belongs to
		// of_contact, not contact_is.
		const [a, b] = mapped.forward ? [r.ofContact, r.contactIs] : [r.contactIs, r.ofContact];
		const ends = relationshipPair(contactId(a), contactId(b), symmetric);
		const dedupeKey = `${typeId}|${ends.fromContactId}|${ends.toContactId}`;
		if (seenRelationships.has(dedupeKey)) continue;
		seenRelationships.add(dedupeKey);
		relationships.push({
			id: `${prefix}:relationship:${r.id}`,
			householdId: opts.householdId,
			...ends,
			typeId,
			description: null,
			// Monica records neither of these, so there is nothing to carry over. A link it did
			// record is one that holds, which is what `current` says (docs/02 §2.4).
			sinceDate: null,
			status: CURRENT_RELATIONSHIP_STATUS,
			createdBy: opts.userId,
			createdAt: opts.now,
			updatedAt: opts.now
		});
	}
	for (const name of unknownTypeNames) {
		ctx.warn({ code: 'customType', name });
	}
	return { relationships, relationshipTypes: [...customTypes.values()] };
}

function isBuiltInSymmetric(key: string): boolean {
	const type = BUILT_IN_RELATIONSHIP_TYPES.find((t) => t.id === key);
	if (!type) throw new Error(`Relationship type mapping names unknown built-in type ${key}.`);
	return type.symmetric;
}
