import { and, desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo, contactVisibleTo, relationshipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	MomentRow,
	PersonRow,
	RelationshipRow,
	StreamPerson,
	StreamRepository
} from '../domain/stream/stream';
import type * as schema from './schema';
import { contact, journalEntry, journalMention, photo, relationship, relationshipType, user } from './schema';

/*
 * Drizzle adapter for the StreamRepository port (docs/02 §2.22.2). Every read is scoped by the
 * central conditions (docs/03 §3.7): moments via `childRecordVisibleTo` (anchor contact visible
 * + shared-or-own entry), people via `contactVisibleTo`, relationships via
 * `relationshipVisibleTo` (both ends visible). A moment's mention chips are limited to people
 * the viewer may see, so a mention never widens access.
 */
export function createDrizzleStreamRepository(db: BunSQLiteDatabase<typeof schema>): StreamRepository {
	return {
		async recentMoments(viewer: Viewer, limit: number): Promise<MomentRow[]> {
			const rows = db
				.select({
					id: journalEntry.id,
					at: journalEntry.createdAt,
					actorId: user.id,
					actorName: user.name,
					anchorId: contact.id,
					anchorName: contact.displayName,
					anchorAvatar: contact.avatarPhotoId,
					entryDate: journalEntry.entryDate,
					visibility: journalEntry.visibility,
					body: journalEntry.body
				})
				.from(journalEntry)
				.innerJoin(contact, eq(journalEntry.contactId, contact.id))
				.innerJoin(user, eq(journalEntry.createdBy, user.id))
				.where(
					childRecordVisibleTo(viewer, {
						visibility: journalEntry.visibility,
						createdBy: journalEntry.createdBy
					})
				)
				.orderBy(desc(journalEntry.createdAt))
				.limit(limit)
				.all();
			if (rows.length === 0) return [];

			const ids = rows.map((r) => r.id);
			const mentionRows = db
				.select({
					entryId: journalMention.journalEntryId,
					id: contact.id,
					name: contact.displayName,
					avatarPhotoId: contact.avatarPhotoId
				})
				.from(journalMention)
				.innerJoin(contact, eq(journalMention.contactId, contact.id))
				.where(and(inArray(journalMention.journalEntryId, ids), contactVisibleTo(viewer)))
				.all();
			const photoRows = db
				.select({ entryId: photo.journalEntryId, id: photo.id })
				.from(photo)
				.where(inArray(photo.journalEntryId, ids))
				.orderBy(photo.createdAt)
				.all();

			const mentionsByEntry = new Map<string, StreamPerson[]>();
			for (const m of mentionRows) {
				const list = mentionsByEntry.get(m.entryId) ?? [];
				list.push({ id: m.id, name: m.name, avatarPhotoId: m.avatarPhotoId });
				mentionsByEntry.set(m.entryId, list);
			}
			const photosByEntry = new Map<string, string[]>();
			for (const p of photoRows) {
				if (!p.entryId) continue;
				const list = photosByEntry.get(p.entryId) ?? [];
				list.push(p.id);
				photosByEntry.set(p.entryId, list);
			}

			return rows.map((r) => ({
				id: r.id,
				at: r.at,
				actor: { id: r.actorId, name: r.actorName },
				anchor: { id: r.anchorId, name: r.anchorName, avatarPhotoId: r.anchorAvatar },
				entryDate: r.entryDate,
				visibility: r.visibility,
				body: r.body,
				mentions: mentionsByEntry.get(r.id) ?? [],
				photoIds: photosByEntry.get(r.id) ?? []
			}));
		},

		async recentPeople(viewer: Viewer, limit: number): Promise<PersonRow[]> {
			const rows = db
				.select({
					id: contact.id,
					at: contact.createdAt,
					actorId: user.id,
					actorName: user.name,
					name: contact.displayName,
					avatarPhotoId: contact.avatarPhotoId,
					description: contact.description,
					visibility: contact.visibility
				})
				.from(contact)
				.innerJoin(user, eq(contact.createdBy, user.id))
				.where(contactVisibleTo(viewer))
				.orderBy(desc(contact.createdAt))
				.limit(limit)
				.all();
			return rows.map((r) => ({
				id: r.id,
				at: r.at,
				actor: { id: r.actorId, name: r.actorName },
				person: { id: r.id, name: r.name, avatarPhotoId: r.avatarPhotoId },
				description: r.description,
				visibility: r.visibility
			}));
		},

		async recentRelationships(viewer: Viewer, limit: number): Promise<RelationshipRow[]> {
			const fromC = alias(contact, 'from_c');
			const toC = alias(contact, 'to_c');
			const rows = db
				.select({
					id: relationship.id,
					at: relationship.createdAt,
					actorId: user.id,
					actorName: user.name,
					fromId: fromC.id,
					fromName: fromC.displayName,
					fromAvatar: fromC.avatarPhotoId,
					toId: toC.id,
					toName: toC.displayName,
					toAvatar: toC.avatarPhotoId,
					label: relationshipType.forwardLabel
				})
				.from(relationship)
				.innerJoin(relationshipType, eq(relationship.typeId, relationshipType.id))
				.innerJoin(fromC, eq(relationship.fromContactId, fromC.id))
				.innerJoin(toC, eq(relationship.toContactId, toC.id))
				.innerJoin(user, eq(relationship.createdBy, user.id))
				.where(relationshipVisibleTo(viewer, fromC, toC))
				.orderBy(desc(relationship.createdAt))
				.limit(limit)
				.all();
			return rows.map((r) => ({
				id: r.id,
				at: r.at,
				actor: { id: r.actorId, name: r.actorName },
				from: { id: r.fromId, name: r.fromName, avatarPhotoId: r.fromAvatar },
				to: { id: r.toId, name: r.toName, avatarPhotoId: r.toAvatar },
				label: r.label
			}));
		}
	};
}
