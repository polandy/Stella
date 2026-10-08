import { and, eq, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import { relationshipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import {
	CURRENT_RELATIONSHIP_STATUS,
	RELATIONSHIP_STATUSES,
	type RelationshipStatus
} from '../../relationships/status';
import {
	describeRelationshipFor,
	type RelationshipTieReads,
	type RelationshipView
} from '../domain/relationships/relationships';
import type * as schema from './schema';
import { contact, relationship, relationshipType } from './schema';

/*
 * Drizzle adapter for a person's links as their page lists them (docs/08 §8.3). Scoped through
 * the central `relationshipVisibleTo` (both endpoints must be visible, docs/03 §3.7); each row is
 * labelled from the person's side by the pure `describeRelationshipFor`.
 */

/**
 * The column is plain text, so an import — or a hand-written archive — can put anything in it.
 * A link that is on record holds until someone ends it, so anything the domain does not know
 * reads as `current` rather than as a state of its own.
 */
const toStatus = (value: string): RelationshipStatus =>
	RELATIONSHIP_STATUSES.includes(value as RelationshipStatus)
		? (value as RelationshipStatus)
		: CURRENT_RELATIONSHIP_STATUS;

export function createDrizzleRelationshipTieReads(
	db: BunSQLiteDatabase<typeof schema>
): RelationshipTieReads {
	return {
		async listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<RelationshipView[]> {
			const fromC = alias(contact, 'from_c');
			const toC = alias(contact, 'to_c');

			const rows = db
				.select({
					id: relationship.id,
					description: relationship.note,
					sinceDate: relationship.sinceDate,
					status: relationship.status,
					fromContactId: relationship.fromContactId,
					toContactId: relationship.toContactId,
					fromName: fromC.displayName,
					toName: toC.displayName,
					typeId: relationshipType.id,
					typeKey: relationshipType.key,
					forwardLabel: relationshipType.forwardLabel,
					reverseLabel: relationshipType.reverseLabel,
					category: relationshipType.category,
					symmetric: relationshipType.symmetric,
					sortOrder: relationshipType.sortOrder
				})
				.from(relationship)
				.innerJoin(relationshipType, eq(relationship.typeId, relationshipType.id))
				.innerJoin(fromC, eq(relationship.fromContactId, fromC.id))
				.innerJoin(toC, eq(relationship.toContactId, toC.id))
				.where(
					and(
						or(eq(relationship.fromContactId, contactId), eq(relationship.toContactId, contactId)),
						relationshipVisibleTo(viewer, fromC, toC)
					)
				)
				.orderBy(relationshipType.sortOrder)
				.all();

			return rows.map((row) => {
				const description = describeRelationshipFor(
					contactId,
					{ fromContactId: row.fromContactId, toContactId: row.toContactId },
					{
						id: '',
						householdId: null,
						key: row.typeKey,
						forwardLabel: row.forwardLabel,
						reverseLabel: row.reverseLabel,
						category: row.category,
						symmetric: row.symmetric === 1,
						sortOrder: row.sortOrder
					}
				);
				const otherDisplayName =
					description.otherContactId === row.fromContactId ? row.fromName : row.toName;
				return {
					id: row.id,
					sinceDate: row.sinceDate,
					status: toStatus(row.status),
					otherContactId: description.otherContactId,
					otherDisplayName,
					label: description.label,
					typeId: row.typeId,
					typeKey: row.typeKey,
					side: description.side,
					category: description.category,
					description: row.description
				};
			});
		}
	};
}
