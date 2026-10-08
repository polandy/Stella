import { and, eq, inArray, like } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { HeldGiftsPort } from '../domain/gifts/held-gifts';
import type * as schema from './schema';
import { gift, interaction, interactionParticipant, note, user } from './schema';

/*
 * Drizzle adapter for the HeldGiftsPort (docs/02 §2.25.4): the gift notes the Monica import
 * wrote and the touchpoints of the dropped kind *gift*, across every household — the conversion
 * is the installation's own upkeep, not a member's read, so it is not scoped to a viewer. Each
 * replacement is one transaction: the gifts are in before the original goes, or neither.
 */

/** The ids the import gave its gift notes: `<source>:gift:<monica id>`. */
const GIFT_NOTE_ID = '%:gift:%';

/** `kind` no longer names *gift* in the schema's type; the rows written before still do. */
const GIFT_KIND = 'gift' as (typeof interaction.$inferSelect)['kind'];

export function createDrizzleHeldGiftRepository(
	db: BunSQLiteDatabase<typeof schema>
): HeldGiftsPort {
	return {
		async giftNotes() {
			return db
				.select({
					id: note.id,
					contactId: note.contactId,
					createdBy: note.createdBy,
					visibility: note.visibility,
					body: note.body,
					createdAt: note.createdAt,
					updatedAt: note.updatedAt
				})
				.from(note)
				.where(like(note.id, GIFT_NOTE_ID))
				.orderBy(note.id)
				.all();
		},

		async giftTouchpoints() {
			const rows = db
				.select({
					id: interaction.id,
					contactId: interaction.contactId,
					createdBy: interaction.createdBy,
					visibility: interaction.visibility,
					authorLocale: user.localePref,
					title: interaction.title,
					description: interaction.description,
					happenedAt: interaction.happenedAt,
					createdAt: interaction.createdAt,
					updatedAt: interaction.updatedAt
				})
				.from(interaction)
				.innerJoin(user, eq(interaction.createdBy, user.id))
				.where(eq(interaction.kind, GIFT_KIND))
				.orderBy(interaction.id)
				.all();
			if (rows.length === 0) return [];
			const participants = db
				.select()
				.from(interactionParticipant)
				.where(
					inArray(
						interactionParticipant.interactionId,
						rows.map((r) => r.id)
					)
				)
				.orderBy(interactionParticipant.contactId)
				.all();
			return rows.map((r) => ({
				...r,
				participantIds: participants.filter((p) => p.interactionId === r.id).map((p) => p.contactId)
			}));
		},

		async replaceNote(noteId, made) {
			return db.transaction((tx) => {
				const written = tx
					.insert(gift)
					.values(made)
					.onConflictDoNothing()
					.returning({ id: gift.id })
					.all();
				tx.delete(note).where(eq(note.id, noteId)).run();
				return written.length;
			});
		},

		async replaceTouchpoint(interactionId, made) {
			return db.transaction((tx) => {
				const written =
					made.length === 0
						? []
						: tx
								.insert(gift)
								.values([...made])
								.onConflictDoNothing()
								.returning({ id: gift.id })
								.all();
				tx.delete(interaction)
					.where(and(eq(interaction.id, interactionId), eq(interaction.kind, GIFT_KIND)))
					.run();
				return written.length;
			});
		}
	};
}
