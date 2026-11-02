import { and, sql } from 'drizzle-orm';
import { photo } from './schema';

/*
 * A gallery photo is one that belongs to no journal entry (docs/02 §2.14 vs §2.20), to no
 * circle (§2.4.2), and is not the framing of another photo. Shared by the gallery's read model
 * (`gallery-photo-reads.ts`) and the writes that may only touch a gallery photo
 * (`photo-repository.ts`).
 *
 * Each test carries a unary `+`, which keeps SQLite off that column's index: "no entry", "no
 * framing", "no circle" hold for most photos, so starting from one of those indexes reads
 * the household's whole gallery when the read has a narrower one to start from — the person's,
 * or the day's (docs/02 §2.12.1).
 */
export function isGalleryPhoto() {
	return and(
		sql`+${photo.journalEntryId} IS NULL`,
		sql`+${photo.framingOf} IS NULL`,
		sql`+${photo.circleId} IS NULL`
	);
}
