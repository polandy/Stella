import { and, isNull } from 'drizzle-orm';
import { photo } from './schema';

/*
 * A gallery photo is one that belongs to no journal entry (docs/02 §2.14 vs §2.20), to no
 * circle (§2.4.2), and is not the framing of another photo. Shared by the gallery's read model
 * (`gallery-photo-reads.ts`) and the writes that may only touch a gallery photo
 * (`photo-repository.ts`).
 */
export function isGalleryPhoto() {
	return and(isNull(photo.journalEntryId), isNull(photo.framingOf), isNull(photo.circleId));
}
