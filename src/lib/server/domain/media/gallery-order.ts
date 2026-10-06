import { datedAt } from '../../../image/taken-at';

/*
 * The order a person's photos are shown in (docs/02 §2.14) — one rule, so the gallery and
 * anything else that lists a person's photos can never disagree about it.
 *
 * Favourites come first, the one pinned most recently leading: pinning a photo visibly puts it
 * at the front, and unpinning and pinning again is how a favourite is moved there until real
 * reordering exists. Everything unpinned follows, newest first — dated by when it was taken when
 * the picture's EXIF said so, else by when it was added, so a photo of 2019 uploaded today sits
 * among 2019's. Ties fall back to the date and then the id, so the order is a property of the
 * photos, never of the order they arrived in.
 */

/** What the order is decided on. */
export interface Orderable {
	id: string;
	createdAt: number;
	/** When it was taken, as its EXIF said (`image/taken-at`); null when unknown. */
	takenAt: string | null;
	/** When the photo was pinned as a favourite (epoch ms); null when it is not. */
	pinnedAt: number | null;
}

/** A new array of `photos` in the order they are shown; the input is left alone. */
export function orderGallery<T extends Orderable>(photos: readonly T[]): T[] {
	return [...photos].sort((a, b) => byPin(a, b) || datedAt(b) - datedAt(a) || byIdDescending(a, b));
}

/** Any pin outranks no pin; among pins the later one wins; two unpinned photos are level. */
function byPin(a: Orderable, b: Orderable): number {
	if (a.pinnedAt === null) return b.pinnedAt === null ? 0 : 1;
	if (b.pinnedAt === null) return -1;
	return b.pinnedAt - a.pinnedAt;
}

const byIdDescending = (a: Orderable, b: Orderable): number =>
	a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
