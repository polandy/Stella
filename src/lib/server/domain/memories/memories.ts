import type { Viewer, Visibility } from '../../access/visibility';
import { memoryDaysFor, memoryYears, type MemoryYear } from '../../../memories/memories';
import type { InteractionRow, MomentRow, StreamPerson } from '../stream/stream';

/*
 * *On this day* (docs/02 §2.12.1): the moments, touchpoints and gallery photos the viewer may
 * see that fall on a day's day and month in earlier years. A query over the existing tables,
 * like the stream (§2.22.2), whose row shapes it shares; the adapter owns the scoped reads, the
 * year grouping is the pure `$lib/memories`.
 */

/** A moment written on the day in an earlier year, as the stream reads one. */
export type MomentMemory = MomentRow & { kind: 'moment' };

/** A touchpoint logged for the day in an earlier year (docs/02 §2.6). */
export type TouchpointMemory = InteractionRow & { kind: 'touchpoint' };

export type Memory = (MomentMemory | TouchpointMemory) & { date: string };

/** A gallery photo taken on the day in an earlier year (docs/02 §2.14). */
export interface MemoryPhoto {
	id: string;
	/** The capture day, `YYYY-MM-DD`, as the camera's clock read it. */
	date: string;
	/** When it was taken, epoch ms: a year shows its latest photo first. */
	at: number;
	person: StreamPerson;
	visibility: Visibility;
}

/**
 * One read of one kind: the rows on any of `days` (`MM-DD`), dated before `before`, newest day
 * first, at most `limit`. Scoped to the viewer and to people the household still browses.
 */
export interface MemoryQuery {
	days: readonly string[];
	before: string;
	limit: number;
}

export interface MemoryRepository {
	momentsOn(viewer: Viewer, query: MemoryQuery): Promise<MomentRow[]>;
	touchpointsOn(viewer: Viewer, query: MemoryQuery): Promise<InteractionRow[]>;
	photosOn(viewer: Viewer, query: MemoryQuery): Promise<MemoryPhoto[]>;
}

export interface MemoryDeps {
	memories: MemoryRepository;
}

export interface Memories {
	years: MemoryYear<Memory>[];
	photos: MemoryYear<MemoryPhoto>[];
}

/** How much one read takes: Home's band needs one past its cap, the page a day's worth. */
export interface MemoryLimits {
	entries: number;
	photos: number;
}

/** What `/on-this-day` reads — far past any one day of a family's notebook. */
export const MEMORY_PAGE_LIMITS: MemoryLimits = { entries: 200, photos: 60 };

/** What the viewer may remember on `day` (`YYYY-MM-DD`, the household's today or a picked one). */
export async function memoriesOn(
	deps: MemoryDeps,
	viewer: Viewer,
	day: string,
	limits: MemoryLimits = MEMORY_PAGE_LIMITS
): Promise<Memories> {
	const read = (limit: number): MemoryQuery => ({ days: memoryDaysFor(day), before: day, limit });
	const [moments, touchpoints, photos] = await Promise.all([
		deps.memories.momentsOn(viewer, read(limits.entries)),
		deps.memories.touchpointsOn(viewer, read(limits.entries)),
		deps.memories.photosOn(viewer, read(limits.photos))
	]);
	const entries: Memory[] = [
		...moments.map((m): Memory => ({ kind: 'moment', date: m.entryDate, ...m })),
		...touchpoints.map((i): Memory => ({ kind: 'touchpoint', date: i.happenedAt, ...i }))
	];
	return { years: memoryYears(entries, day), photos: memoryYears(photos, day) };
}
