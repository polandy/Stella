import { eq, max } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo, contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { AttentionRepository, QuietSource } from '../domain/attention/quiet';
import type * as schema from './schema';
import { contact, interaction, journalEntry } from './schema';

/*
 * Drizzle adapter for the AttentionRepository port (docs/02 §2.12). Three scoped reads rather
 * than one triple join: the latest journal day and the latest touchpoint day are each grouped
 * per contact under `childRecordVisibleTo`, so a private entry the viewer may not see cannot
 * count as attention from their chair. The contact rows themselves come through
 * `contactVisibleTo`, the only authz path.
 */

/** SQLite has no boolean; `is_deceased` is 0/1. */
const asBool = (value: number) => value === 1;

/** `contact.created_at` is epoch milliseconds; the domain reasons in ISO days. */
const dayOf = (epochMs: number) => new Date(epochMs).toISOString().slice(0, 10);

/** Build the AttentionRepository adapter over a Drizzle handle. */
export function createDrizzleAttentionRepository(
	db: BunSQLiteDatabase<typeof schema>
): AttentionRepository {
	return {
		async listQuietSourcesVisibleTo(viewer: Viewer): Promise<QuietSource[]> {
			const people = db
				.select({
					contactId: contact.id,
					contactName: contact.displayName,
					avatarPhotoId: contact.avatarPhotoId,
					isDeceased: contact.isDeceased,
					createdAt: contact.createdAt
				})
				.from(contact)
				.where(contactVisibleTo(viewer))
				.all();

			const latestJournal = db
				.select({ contactId: journalEntry.contactId, day: max(journalEntry.entryDate) })
				.from(journalEntry)
				.innerJoin(contact, eq(journalEntry.contactId, contact.id))
				.where(childRecordVisibleTo(viewer, journalEntry))
				.groupBy(journalEntry.contactId)
				.all();

			const latestTouchpoint = db
				.select({ contactId: interaction.contactId, day: max(interaction.happenedAt) })
				.from(interaction)
				.innerJoin(contact, eq(interaction.contactId, contact.id))
				.where(childRecordVisibleTo(viewer, interaction))
				.groupBy(interaction.contactId)
				.all();

			// ISO days compare as strings, so the later of the two is the greater one.
			const lastTouched = new Map<string, string>();
			for (const { contactId, day } of [...latestJournal, ...latestTouchpoint]) {
				if (day === null) continue;
				const known = lastTouched.get(contactId);
				if (known === undefined || day > known) lastTouched.set(contactId, day);
			}

			return people.map((p) => ({
				contactId: p.contactId,
				contactName: p.contactName,
				avatarPhotoId: p.avatarPhotoId,
				isDeceased: asBool(p.isDeceased),
				knownSince: dayOf(p.createdAt),
				lastTouchedOn: lastTouched.get(p.contactId) ?? null
			}));
		}
	};
}
