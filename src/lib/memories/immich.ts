import type { ImmichMemoryPhoto, ImmichMemoryYear } from '$lib/immich/on-this-day';
import { MEMORY_STRIP_CAP } from './memories';
import type { MemoryYearView } from './view';

/*
 * Immich's photos of the day beside Stella's own (docs/02 §2.12.1). They arrive after the page is
 * drawn, so Home's band and the page fold them into what the server already gave: the gallery's
 * photos first, then Immich's, newest year first.
 */

/**
 * The Immich photos Home's one row has room for after `galleryShown` of the gallery's, and
 * whether Immich holds more than that — then the band's *More* links to the page.
 */
export function immichStrip(
	galleryShown: number,
	years: readonly ImmichMemoryYear[]
): { photos: ImmichMemoryPhoto[]; more: boolean } {
	const room = Math.max(0, MEMORY_STRIP_CAP - galleryShown);
	const total = years.reduce((n, year) => n + year.total, 0);
	return { photos: years.flatMap((year) => year.photos).slice(0, room), more: total > room };
}

export type MemoryCardView = MemoryYearView & { immich: ImmichMemoryYear | null };

/** The page's year cards with Immich's years on them — a year only Immich has gets its own card. */
export function memoryCardsWithImmich(
	cards: readonly MemoryYearView[],
	years: readonly ImmichMemoryYear[],
	day: string
): MemoryCardView[] {
	const immichOf = new Map(years.map((year) => [year.year, year]));
	const own = new Set(cards.map((c) => c.year));
	const onlyImmich = years
		.filter((year) => !own.has(year.year))
		.map((year) => ({
			year: year.year,
			yearsAgo: Number(day.slice(0, 4)) - year.year,
			rows: [],
			photos: []
		}));
	return [...cards, ...onlyImmich]
		.map((c) => ({ ...c, immich: immichOf.get(c.year) ?? null }))
		.sort((a, b) => b.year - a.year);
}
