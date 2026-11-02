import { mentionSnippet } from '$lib/mentions/snippet';
import { contactSectionPath, journalEntryPath } from '$lib/people/sections';
import type { Memories, Memory, MemoryPhoto } from '$lib/server/domain/memories/memories';
import type { StreamPerson } from '$lib/server/domain/stream/stream';
import { memoryBand, type MemoryYear } from '$lib/memories/memories';
import type { MemoryPhotoView, MemoryRowView, MemoryYearView } from '$lib/memories/view';

/** How long a moment's line runs before it is cut: one line of the 17 rem rail. */
const MEMORY_LINE_LENGTH = 90;

/*
 * *On this day* as Home's band and `/on-this-day` show it (docs/02 §2.12.1): one quiet row per
 * memory — the faces, the first line, and where tapping it lands. Shared so the band and the page
 * read a memory the same way; the kind's label and the veil's words are the component's, in the
 * reader's language.
 */

function uniquePeople(people: readonly StreamPerson[]): StreamPerson[] {
	const seen = new Set<string>();
	return people.filter((p) => !seen.has(p.id) && seen.add(p.id));
}

export function memoryRowOf(memory: Memory): MemoryRowView {
	const base = {
		id: memory.id,
		date: memory.date,
		isPrivate: memory.visibility === 'private'
	};
	if (memory.kind === 'moment') {
		const nameById = new Map(memory.mentions.map((p) => [p.id, p.name]));
		return {
			...base,
			kind: 'moment',
			people: uniquePeople([memory.anchor, ...memory.mentions]),
			line:
				mentionSnippet(memory.body, (id) => nameById.get(id) ?? null, MEMORY_LINE_LENGTH) || null,
			interactionKind: null,
			href: journalEntryPath(memory.anchor.id, memory.id),
			veilId: `journal:${memory.id}`
		};
	}
	return {
		...base,
		kind: 'touchpoint',
		people: uniquePeople([memory.subject, ...memory.participants]),
		line: memory.title,
		interactionKind: memory.interactionKind,
		href: contactSectionPath(memory.subject.id, 'story'),
		veilId: `interaction:${memory.id}`
	};
}

const photoOf = (photo: MemoryPhoto): MemoryPhotoView => ({
	id: photo.id,
	year: Number(photo.date.slice(0, 4)),
	person: photo.person,
	isPrivate: photo.visibility === 'private',
	href: contactSectionPath(photo.person.id, 'photos')
});

/** The page's cards: one per year that has an entry or a photo, newest first. */
export function memoryYearsForView(
	years: readonly MemoryYear<Memory>[],
	photos: readonly MemoryYear<MemoryPhoto>[]
): MemoryYearView[] {
	const byYear = new Map<number, MemoryYearView>();
	const at = (year: number, yearsAgo: number) => {
		const card = byYear.get(year) ?? { year, yearsAgo, rows: [], photos: [] };
		byYear.set(year, card);
		return card;
	};
	for (const y of years) at(y.year, y.yearsAgo).rows.push(...y.items.map(memoryRowOf));
	for (const y of photos) at(y.year, y.yearsAgo).photos.push(...y.items.map(photoOf));
	return [...byYear.values()].sort((a, b) => b.year - a.year);
}

/**
 * Home's band: at most three rows under their years, one strip of the day's photos across the
 * years, latest year first, and whether `/on-this-day` holds more.
 */
export function memoryBandForView({ years, photos }: Memories) {
	const band = memoryBand(
		years,
		photos.flatMap((y) => y.items)
	);
	return {
		years: band.years.map((y) => ({
			year: y.year,
			yearsAgo: y.yearsAgo,
			rows: y.items.map(memoryRowOf)
		})),
		photos: band.photos.map(photoOf),
		more: band.more,
		empty: band.empty
	};
}

export type MemoryBandView = ReturnType<typeof memoryBandForView>;
