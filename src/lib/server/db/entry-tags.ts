import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { hashtagsIn, tagKey } from '../../hashtags/hashtags';
import type { IdGenerator } from '../id';
import type * as schema from './schema';
import { contact, entryTag, journalEntry, journalEntryTag } from './schema';

/*
 * The write behind an entry's tags (docs/02 §2.20.2), shared by every path that leaves an entry
 * with a body: the journal repository, a restore, and the one-off reading of entries written
 * before tags existed. Which tags an entry has is the domain's reading of its body; this keeps
 * the household's set in step with it.
 */

type Db = BunSQLiteDatabase<typeof schema>;

/**
 * Give the entry exactly these tags. A name is matched to the household's tag by its key, so
 * the spelling it was first written in stays; one nobody has yet joins the set. A tag left on
 * no entry of the household is swept. Nothing happens for an entry that is not there — a
 * restored entry whose day slot was taken, say.
 */
export function writeEntryTags(
	tx: Db,
	ids: IdGenerator,
	journalEntryId: string,
	names: readonly string[]
): void {
	const entry = tx
		.select({ householdId: contact.householdId })
		.from(journalEntry)
		.innerJoin(contact, eq(contact.id, journalEntry.contactId))
		.where(eq(journalEntry.id, journalEntryId))
		.get();
	if (!entry) return;
	const { householdId } = entry;

	tx.delete(journalEntryTag).where(eq(journalEntryTag.journalEntryId, journalEntryId)).run();
	const byKey = new Map(names.map((name) => [tagKey(name), name.normalize('NFC')]));
	if (byKey.size > 0) {
		tx.insert(entryTag)
			.values([...byKey].map(([key, name]) => ({ id: ids.next(), householdId, name, key })))
			.onConflictDoNothing()
			.run();
		const tags = tx
			.select({ id: entryTag.id })
			.from(entryTag)
			.where(and(eq(entryTag.householdId, householdId), inArray(entryTag.key, [...byKey.keys()])))
			.all();
		tx.insert(journalEntryTag)
			.values(tags.map((t) => ({ journalEntryId, entryTagId: t.id })))
			.run();
	}
	sweepEntryTags(tx, householdId);
}

/** Drop the household's tags no entry carries any more. */
export function sweepEntryTags(tx: Db, householdId: string): void {
	tx.delete(entryTag)
		.where(
			and(
				eq(entryTag.householdId, householdId),
				notInArray(entryTag.id, tx.select({ id: journalEntryTag.entryTagId }).from(journalEntryTag))
			)
		)
		.run();
}

/** Where the one-off reading below notes that it ran. Its own tiny table, like the search stamp. */
const READ_MARK = 'entry_tag_backfill';

/**
 * Read the tags of every entry once, on the first start of a Stella that has tags: entries
 * written before then carry `#words` the table has never seen. Marked as done afterwards, so a
 * restart touches nothing; from then on every write keeps the tags itself.
 */
export function readEntryTagsOnce(db: Db, ids: IdGenerator): void {
	db.run(sql.raw(`CREATE TABLE IF NOT EXISTS ${READ_MARK} (done INTEGER NOT NULL);`));
	if (db.get(sql.raw(`SELECT 1 FROM ${READ_MARK} LIMIT 1`))) return;
	db.transaction((tx) => {
		const entries = tx
			.select({ id: journalEntry.id, body: journalEntry.body })
			.from(journalEntry)
			.where(sql`instr(${journalEntry.body}, '#') > 0`)
			.all();
		for (const entry of entries) writeEntryTags(tx, ids, entry.id, hashtagsIn(entry.body));
		tx.run(sql.raw(`INSERT INTO ${READ_MARK}(done) VALUES (1)`));
	});
}
