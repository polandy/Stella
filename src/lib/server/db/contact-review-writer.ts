import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactBrowsableBy } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import {
	localizedActivityEntry,
	type ActivityOf,
	type ActivityWording
} from '../domain/activity/activity';
import { ContactGoneError } from '../domain/contacts/require-visible';
import type { ContactReviewWriter, ReviewWrite } from '../domain/import/contact-review';
import { writeSourceLinks } from './contact-source-repository';
import { writeImportPlan } from './import-repository';
import type * as schema from './schema';
import { activityLog, contact, contactField, contactTag, tag } from './schema';

/*
 * Drizzle adapter for the matching review's write (docs/02 §2.16). One transaction: the
 * people the review names are checked first — still ones the member may browse — so a person
 * made private or archived meanwhile refuses the whole review rather than half of it. Then the
 * new people through the import's own write, what the others gain, the answers, and the log.
 */

type Db = BunSQLiteDatabase<typeof schema>;

/** The household's tag of this name, whatever its case, or the one made for it. */
function tagIdFor(tx: Db, householdId: string, wanted: { id: string; name: string }): string {
	const existing = tx
		.select({ id: tag.id })
		.from(tag)
		.where(and(eq(tag.householdId, householdId), sql`lower(${tag.name}) = lower(${wanted.name})`))
		.get();
	if (existing) return existing.id;
	tx.insert(tag).values({ id: wanted.id, householdId, name: wanted.name }).run();
	return wanted.id;
}

/** Build the ContactReviewWriter adapter over a Drizzle handle. */
export function createDrizzleContactReviewWriter(
	db: Db,
	wording: ActivityWording
): ContactReviewWriter {
	return {
		async applyReview(
			viewer: Viewer,
			write: ReviewWrite,
			audit: ActivityOf<'contacts.reviewed'> | null
		) {
			return db.transaction((tx) => {
				const created = new Set(write.newPeople.contacts.map((c) => c.id));
				const named = [
					...new Set([
						...write.completions.map((c) => c.personId),
						...write.links.flatMap((l) =>
							l.contactId && !created.has(l.contactId) ? [l.contactId] : []
						)
					])
				];
				if (named.length > 0) {
					const browsable = tx
						.select({ id: contact.id })
						.from(contact)
						.where(and(inArray(contact.id, named), contactBrowsableBy(viewer)))
						.all();
					if (browsable.length !== named.length) throw new ContactGoneError();
				}

				const inserted = writeImportPlan(tx, write.newPeople);

				for (const completion of write.completions) {
					tx.update(contact)
						.set({ ...completion.set, updatedAt: write.at })
						.where(eq(contact.id, completion.personId))
						.run();
					if (completion.fields.length > 0) tx.insert(contactField).values(completion.fields).run();
					for (const wanted of completion.tags) {
						tx.insert(contactTag)
							.values({
								contactId: completion.personId,
								tagId: tagIdFor(tx, viewer.householdId, wanted)
							})
							.onConflictDoNothing()
							.run();
					}
				}

				writeSourceLinks(tx, viewer.householdId, write.links);
				if (audit) tx.insert(activityLog).values(localizedActivityEntry(audit, wording)).run();
				return { people: inserted.contacts, completed: write.completions.length };
			});
		}
	};
}
