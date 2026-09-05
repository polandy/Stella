import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { ImportOutcome, ImportRepository } from '../domain/import/monica/apply';
import type { ImportPlan } from '../domain/import/monica/plan';
import type * as schema from './schema';
import {
	contact,
	contactField,
	contactTag,
	interaction,
	interactionParticipant,
	note,
	relationship,
	relationshipType,
	tag
} from './schema';

/*
 * Drizzle adapter for the ImportRepository port (docs/02 §2.16). One transaction writes the
 * whole plan; every insert is "do nothing on conflict" over the plan's stable source ids, so
 * re-applying a dump is a no-op that the returned counts make visible. Tags are the one
 * exception to id-based idempotence: they are unique by name per household, so a tag the
 * household already has is reused and the plan's links are re-pointed at it.
 */

/** Build the ImportRepository adapter over a Drizzle handle. */
export function createDrizzleImportRepository(db: BunSQLiteDatabase<typeof schema>): ImportRepository {
	return {
		async applyPlan(plan: ImportPlan): Promise<ImportOutcome> {
			return db.transaction((tx) => {
				// The Bun driver types `run()` as void, so rows are counted through `returning()`.
				const inserted = (rows: { id: string }[]) => rows.length;
				let relationshipTypes = 0;
				for (const t of plan.relationshipTypes) {
					relationshipTypes += inserted(
						tx.insert(relationshipType)
							.values({ ...t, symmetric: t.symmetric ? 1 : 0, sortOrder: 100 })
							.onConflictDoNothing()
							.returning({ id: relationshipType.id })
							.all()
					);
				}

				let contacts = 0;
				for (const c of plan.contacts) {
					contacts += inserted(
						tx.insert(contact)
							.values({ ...c, isDeceased: c.isDeceased ? 1 : 0 })
							.onConflictDoNothing()
							.returning({ id: contact.id })
							.all()
					);
				}

				let contactFields = 0;
				for (const f of plan.contactFields) {
					contactFields += inserted(tx.insert(contactField).values(f).onConflictDoNothing().returning({ id: contactField.id }).all());
				}

				let relationships = 0;
				for (const r of plan.relationships) {
					relationships += inserted(
						tx.insert(relationship)
							.values({
								id: r.id,
								householdId: r.householdId,
								fromContactId: r.fromContactId,
								toContactId: r.toContactId,
								typeId: r.typeId,
								note: r.description,
								createdBy: r.createdBy,
								createdAt: r.createdAt,
								updatedAt: r.updatedAt
							})
							.onConflictDoNothing()
							.returning({ id: relationship.id })
							.all()
					);
				}

				let notes = 0;
				for (const n of plan.notes) {
					notes += inserted(
						tx.insert(note)
							.values({ ...n, isPinned: n.isPinned ? 1 : 0 })
							.onConflictDoNothing()
							.returning({ id: note.id })
							.all()
					);
				}

				let interactions = 0;
				for (const i of plan.interactions) {
					const { participantIds, ...row } = i;
					const wrote = inserted(tx.insert(interaction).values(row).onConflictDoNothing().returning({ id: interaction.id }).all());
					interactions += wrote;
					if (wrote > 0 && participantIds.length > 0) {
						tx.insert(interactionParticipant)
							.values(participantIds.map((contactId) => ({ interactionId: i.id, contactId })))
							.onConflictDoNothing()
							.run();
					}
				}

				let tags = 0;
				const tagIdByPlanId = new Map<string, string>();
				for (const t of plan.tags) {
					const existing = tx
						.select({ id: tag.id })
						.from(tag)
						.where(and(eq(tag.householdId, t.householdId), eq(tag.name, t.name)))
						.get();
					if (existing) {
						tagIdByPlanId.set(t.id, existing.id);
						continue;
					}
					tags += inserted(tx.insert(tag).values(t).onConflictDoNothing().returning({ id: tag.id }).all());
					tagIdByPlanId.set(t.id, t.id);
				}
				for (const link of plan.contactTags) {
					tx.insert(contactTag)
						.values({ contactId: link.contactId, tagId: tagIdByPlanId.get(link.tagId) ?? link.tagId })
						.onConflictDoNothing()
						.run();
				}

				return {
					inserted: {
						contacts,
						relationships,
						relationshipTypes,
						contactFields,
						notes,
						interactions,
						tags,
						// Photos are copied in a second step by the wizard (browser-side resize).
						photos: 0
					}
				};
			});
		}
	};
}
