import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo, contactColumnsVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	Interaction,
	InteractionCursor,
	InteractionParticipant,
	InteractionRepository,
	NewInteraction
} from '../domain/interactions/interactions';
import type * as schema from './schema';
import { contact, interaction, interactionParticipant } from './schema';

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
	function withParticipants(viewer: Viewer, rows: Omit<Interaction, 'participants'>[]): Interaction[] {
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

		async deleteOwn(p: { authorId: string; id: string }): Promise<boolean> {
			const removed = db
				.delete(interaction)
				.where(and(eq(interaction.id, p.id), eq(interaction.createdBy, p.authorId)))
				.returning({ id: interaction.id })
				.all();
			return removed.length > 0;
		}
	};
}
