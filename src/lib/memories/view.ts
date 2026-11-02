import type { InteractionKind } from '$lib/story/interaction-kinds';

/*
 * *On this day* rows as the band and the page show them (docs/02 §2.12.1) — the shape the server
 * hands the components, so neither needs the server's types.
 */

/** Someone a memory is about, with what their face needs. */
export interface MemoryPerson {
	id: string;
	name: string;
	avatarPhotoId: string | null;
}

/** A row shows the person it hangs off and one more, as the stream's faces do. */
export const MEMORY_FACES = 2;

export interface MemoryRowView {
	kind: 'moment' | 'touchpoint';
	id: string;
	date: string;
	people: MemoryPerson[];
	/** The first line of a moment, or a touchpoint's title; `null` reads as the kind's label. */
	line: string | null;
	interactionKind: InteractionKind | null;
	isPrivate: boolean;
	href: string;
	/** The veil's key, the same one the person's page uses for this record (docs/02 §2.10.1). */
	veilId: string;
}

export interface MemoryYearView {
	year: number;
	yearsAgo: number;
	rows: MemoryRowView[];
	photos: MemoryPhotoView[];
}

export interface MemoryPhotoView {
	id: string;
	year: number;
	person: MemoryPerson;
	isPrivate: boolean;
	/** The person's Photos card, where it lives (docs/02 §2.14). */
	href: string;
}
