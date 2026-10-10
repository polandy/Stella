import { and, desc, eq, inArray, lt, max, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import {
	authoredEditableBy,
	authoredRemovableBy,
	childRecordVisibleTo,
	contactColumnsVisibleTo
} from '../access/query-scoping';
import type { Remover, Viewer } from '../access/visibility';
import { activityEntry, type ActivityOf } from '../domain/activity/activity';
import type {
	Interaction,
	InteractionCursor,
	InteractionEdit,
	InteractionParticipant,
	InteractionRepository,
	NewInteraction
} from '../domain/interactions/interactions';
import type * as schema from './schema';
import { activityLog, contact, interaction, interactionParticipant, user } from './schema';

/*
 * Drizzle adapter for the InteractionRepository port (docs/08 §8.3). Reads join the subject
 * contact and are scoped through the central `childRecordVisibleTo`, so a private interaction
 * — or any interaction on a private contact — is only returned to those allowed to see it.
 * Participants are resolved in a second query scoped through `contactColumnsVisibleTo`: a
 * participant the viewer may not see is left out rather than leaking a name.
 */

const columns = {
	id: interaction.id,
	contactId: interaction.contactId,
	createdBy: interaction.createdBy,
	visibility: interaction.visibility,
	kind: interaction.kind,
	happenedAt: interaction.happenedAt,
	title: interaction.title,
	description: interaction.description,
	createdAt: interaction.createdAt,
	updatedAt: interaction.updatedAt
};

/** Build the InteractionRepository adapter over a Drizzle handle. */
export function createDrizzleInteractionRepository(
	db: BunSQLiteDatabase<typeof schema>
): InteractionRepository {
	const participantContact = alias(contact, 'participant_contact');
	const removableBy = (remover: Remover) =>
		authoredRemovableBy(remover, {
			visibility: interaction.visibility,
			createdBy: interaction.createdBy
		});

	const editableBy = (author: Viewer) =>
		authoredEditableBy(author, {
			visibility: interaction.visibility,
			createdBy: interaction.createdBy
		});

	function participantsVisibleTo(
		viewer: Viewer,
		interactionIds: string[]
	): Map<string, InteractionParticipant[]> {
		const byInteraction = new Map<string, InteractionParticipant[]>();
		if (interactionIds.length === 0) return byInteraction;
		const rows = db
			.select({
				interactionId: interactionParticipant.interactionId,
				contactId: participantContact.id,
				displayName: participantContact.displayName,
				avatarPhotoId: participantContact.avatarPhotoId
			})
			.from(interactionParticipant)
			.innerJoin(participantContact, eq(interactionParticipant.contactId, participantContact.id))
			.where(
				and(
					inArray(interactionParticipant.interactionId, interactionIds),
					contactColumnsVisibleTo(viewer, participantContact)
				)
			)
			.orderBy(participantContact.displayName)
			.all();
		for (const { interactionId, ...participant } of rows) {
			const list = byInteraction.get(interactionId) ?? [];
			list.push(participant);
			byInteraction.set(interactionId, list);
		}
		return byInteraction;
	}

	/** The one visibility rule both reads go through (docs/03 §3.7). */
	const visibleToViewer = (viewer: Viewer) =>
		childRecordVisibleTo(viewer, {
			visibility: interaction.visibility,
			createdBy: interaction.createdBy
		});

	/** Attach the participants the viewer is allowed to see to each row. */
	function withParticipants(
		viewer: Viewer,
		rows: Omit<Interaction, 'participants'>[]
	): Interaction[] {
		const participants = participantsVisibleTo(
			viewer,
			rows.map((r) => r.id)
		);
		return rows.map((r) => ({ ...r, participants: participants.get(r.id) ?? [] }));
	}

	return {
		async insert(i: NewInteraction) {
			db.transaction((tx) => {
				tx.insert(interaction)
					.values({
						id: i.id,
						contactId: i.contactId,
						createdBy: i.createdBy,
						visibility: i.visibility,
						kind: i.kind,
						happenedAt: i.happenedAt,
						title: i.title,
						description: i.description,
						createdAt: i.createdAt,
						updatedAt: i.updatedAt
					})
					.run();
				if (i.participantIds.length > 0) {
					tx.insert(interactionParticipant)
						.values(i.participantIds.map((contactId) => ({ interactionId: i.id, contactId })))
						.run();
				}
			});
		},

		async listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<Interaction[]> {
			const rows = db
				.select(columns)
				.from(interaction)
				.innerJoin(contact, eq(interaction.contactId, contact.id))
				.where(and(eq(interaction.contactId, contactId), visibleToViewer(viewer)))
				.orderBy(desc(interaction.happenedAt), desc(interaction.createdAt))
				.all();
			return withParticipants(viewer, rows);
		},

		async listPageForContactVisibleTo(
			viewer: Viewer,
			contactId: string,
			opts: { limit: number; before?: InteractionCursor }
		): Promise<Interaction[]> {
			const conditions = [eq(interaction.contactId, contactId), visibleToViewer(viewer)];
			if (opts.before) {
				const { happenedAt, createdAt } = opts.before;
				// Keyset: strictly older than the cursor in (happenedAt, createdAt) order.
				conditions.push(
					or(
						lt(interaction.happenedAt, happenedAt),
						and(eq(interaction.happenedAt, happenedAt), lt(interaction.createdAt, createdAt))
					)!
				);
			}
			const rows = db
				.select(columns)
				.from(interaction)
				.innerJoin(contact, eq(interaction.contactId, contact.id))
				.where(and(...conditions))
				.orderBy(desc(interaction.happenedAt), desc(interaction.createdAt))
				.limit(opts.limit)
				.all();
			return withParticipants(viewer, rows);
		},

		async lastHappenedOnVisibleTo(viewer: Viewer, contactId: string): Promise<string | null> {
			const row = db
				.select({ day: max(interaction.happenedAt) })
				.from(interaction)
				.innerJoin(contact, eq(interaction.contactId, contact.id))
				.where(and(eq(interaction.contactId, contactId), visibleToViewer(viewer)))
				.get();
			return row?.day ?? null;
		},

		async findOwn(author: Viewer, id: string) {
			const row = db
				.select({ id: interaction.id, contactId: interaction.contactId })
				.from(interaction)
				.innerJoin(contact, eq(interaction.contactId, contact.id))
				.where(and(eq(interaction.id, id), editableBy(author)))
				.get();
			if (!row) return null;
			const participants = participantsVisibleTo(author, [id]).get(id) ?? [];
			return { ...row, participantIds: participants.map((p) => p.contactId) };
		},

		async updateOwn(author: Viewer, e: InteractionEdit): Promise<boolean> {
			return db.transaction((tx) => {
				// SQLite's UPDATE takes no join, so the rule — which needs the contact — picks the id.
				const editable = tx
					.select({ id: interaction.id })
					.from(interaction)
					.innerJoin(contact, eq(interaction.contactId, contact.id))
					.where(and(eq(interaction.id, e.id), editableBy(author)));
				const updated = tx
					.update(interaction)
					.set({
						kind: e.kind,
						happenedAt: e.happenedAt,
						title: e.title,
						description: e.description,
						updatedAt: e.updatedAt
					})
					.where(inArray(interaction.id, editable))
					.returning({ id: interaction.id })
					.all();
				if (updated.length === 0) return false;
				// Only the participants the author can see are theirs to change; the rest stay.
				const seen = tx
					.select({ id: participantContact.id })
					.from(participantContact)
					.where(contactColumnsVisibleTo(author, participantContact));
				tx.delete(interactionParticipant)
					.where(
						and(
							eq(interactionParticipant.interactionId, e.id),
							inArray(interactionParticipant.contactId, seen)
						)
					)
					.run();
				if (e.participantIds.length > 0) {
					tx.insert(interactionParticipant)
						.values(e.participantIds.map((contactId) => ({ interactionId: e.id, contactId })))
						.onConflictDoNothing()
						.run();
				}
				return true;
			});
		},

		async findRemovableBy(remover: Remover, id: string) {
			const row = db
				.select({
					id: interaction.id,
					contactId: interaction.contactId,
					person: contact.displayName,
					personVisibility: contact.visibility,
					authorId: interaction.createdBy,
					authorName: user.name
				})
				.from(interaction)
				.innerJoin(contact, eq(interaction.contactId, contact.id))
				.innerJoin(user, eq(interaction.createdBy, user.id))
				.where(and(eq(interaction.id, id), removableBy(remover)))
				.get();
			return row ?? null;
		},

		async deleteRemovableBy(
			remover: Remover,
			id: string,
			audit: ActivityOf<'record.removed'> | null
		): Promise<boolean> {
			// SQLite's DELETE takes no join, so the rule — which needs the contact — picks the id.
			return db.transaction((tx) => {
				const removable = tx
					.select({ id: interaction.id })
					.from(interaction)
					.innerJoin(contact, eq(interaction.contactId, contact.id))
					.where(and(eq(interaction.id, id), removableBy(remover)));
				const removed = tx
					.delete(interaction)
					.where(inArray(interaction.id, removable))
					.returning({ id: interaction.id })
					.all();
				if (removed.length === 0) return false;
				// Participants go by cascade; the log row stays.
				if (audit) tx.insert(activityLog).values(activityEntry(audit)).run();
				return true;
			});
		}
	};
}
