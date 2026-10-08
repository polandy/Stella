import { datedAt, type Dated } from '../media/taken-at';

/*
 * The person page's Photos card (docs/02 §2.14, §2.24.3, docs/design/screens/person.md): what
 * *All* shows — the gallery and the person's latest photos from Immich in one list — and how
 * much of it the card's first row holds. Pure, so the order and the cap are decided and tested
 * without a page.
 */

/** Which photos the card shows: both sources mixed, the gallery alone, or Immich alone. */
export type PhotoTab = 'all' | 'stella' | 'immich';

/** The card's tabs: Immich only for a linked person, and only once Immich has answered. */
export function photoTabs(input: { immichAnswered: boolean }): PhotoTab[] {
	return input.immichAnswered ? ['all', 'stella', 'immich'] : ['all', 'stella'];
}

/** A gallery photo, as far as the mix reads it. */
interface StellaDated extends Dated {
	id: string;
	/** When the household pinned it as a favourite; null when it is not one. */
	pinnedAt: number | null;
}

/** A photo from Immich, as far as the mix reads it. */
interface ImmichDated {
	id: string;
	/** The day it was taken (`YYYY-MM-DD`), or null when Immich does not say. */
	takenOn: string | null;
}

/** One photo on the card, with where it lives. */
export type CardPhoto<S, I> = { source: 'stella'; photo: S } | { source: 'immich'; photo: I };

/** A key unique across both sources: an id is only unique within its own. */
export function photoKey(entry: { source: 'stella' | 'immich'; photo: { id: string } }): string {
	return `${entry.source}:${entry.photo.id}`;
}

/**
 * *All*: the household's favourites first, as the gallery orders them, then every other gallery
 * photo and the Immich photos loaded so far, newest first. A Stella photo goes before an Immich
 * one of the same day (its day is known to the minute); an undated Immich photo stays where
 * Immich listed it, after the one before it.
 *
 * While Immich has more pages, a gallery photo older than every Immich photo loaded waits: it
 * belongs among photos not fetched yet, and shown now it would be pushed down past them by the
 * next *Show more*. So the list only ever grows at its end.
 */
export function mixPhotos<S extends StellaDated, I extends ImmichDated>(input: {
	stella: readonly S[];
	immich: readonly I[];
	/** Whether every Immich photo there is has been loaded, or none will be. */
	immichComplete: boolean;
}): CardPhoto<S, I>[] {
	const favourites = input.stella.filter((photo) => photo.pinnedAt !== null);
	const rest = input.stella
		.filter((photo) => photo.pinnedAt === null)
		.map((photo) => ({ photo, at: datedAt(photo) }));
	const fromImmich = immichDates(input.immich);
	const oldestLoaded = fromImmich.at(-1)?.at ?? Number.POSITIVE_INFINITY;
	const shownRest = input.immichComplete ? rest : rest.filter(({ at }) => at >= oldestLoaded);

	const merged: CardPhoto<S, I>[] = favourites.map((photo) => ({ source: 'stella', photo }));
	let s = 0;
	let i = 0;
	while (s < shownRest.length || i < fromImmich.length) {
		const nextStella = shownRest[s];
		const nextImmich = fromImmich[i];
		if (nextStella && (!nextImmich || nextStella.at >= nextImmich.at)) {
			merged.push({ source: 'stella', photo: nextStella.photo });
			s += 1;
		} else if (nextImmich) {
			merged.push({ source: 'immich', photo: nextImmich.photo });
			i += 1;
		}
	}
	return merged;
}

/** Each Immich photo with the moment it is merged at; an undated one takes its predecessor's. */
function immichDates<I extends ImmichDated>(photos: readonly I[]): { photo: I; at: number }[] {
	let previous = Number.POSITIVE_INFINITY;
	return photos.map((photo) => {
		const at = photo.takenOn === null ? previous : Date.parse(`${photo.takenOn}T00:00:00Z`);
		previous = at;
		return { photo, at };
	});
}

/** The glance's tiles: one row of seven on a wide card, two rows of three on a phone. */
export const GLANCE_TILES = { wide: 7, narrow: 6 } as const;

/**
 * How many photo tiles the card's glance holds at each width, and whether its last tile is
 * *All 1,769 photos* instead. The tile is only given up when there is more than fits.
 */
export function glanceTiles(total: number): {
	wide: number;
	narrow: number;
	moreWide: boolean;
	moreNarrow: boolean;
} {
	const moreWide = total > GLANCE_TILES.wide;
	const moreNarrow = total > GLANCE_TILES.narrow;
	return {
		wide: moreWide ? GLANCE_TILES.wide - 1 : total,
		narrow: moreNarrow ? GLANCE_TILES.narrow - 1 : total,
		moreWide,
		moreNarrow
	};
}
