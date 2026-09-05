import type { Viewer } from '../../access/visibility';

/*
 * "Quiet lately" (docs/02 §2.12): the people the household has not written about in a long
 * while. Pure arithmetic over days — the caller hands in every person the viewer may see,
 * already carrying the most recent day anything was recorded about them.
 *
 * It deliberately measures *recorded attention*, not contact: Stella cannot know about the
 * phone call nobody logged. The list is a prompt to write something down, which is the same
 * act either way.
 */

/** How long a silence has to last before Home mentions it. */
export const QUIET_AFTER_DAYS = 90;

/** Most quiet people Home shows at once. */
export const QUIET_LIMIT = 5;

/** One person the viewer may see, with the latest day they may see anything about. */
export interface QuietSource {
	contactId: string;
	contactName: string;
	avatarPhotoId: string | null;
	isDeceased: boolean;
	/** ISO `YYYY-MM-DD` the person was added, the floor for someone never written about. */
	knownSince: string;
	/** ISO `YYYY-MM-DD` of the most recent story item, or null when there is none. */
	lastTouchedOn: string | null;
}

/** A person the band names, with how long the silence has lasted. */
export interface QuietContact {
	contactId: string;
	contactName: string;
	avatarPhotoId: string | null;
	/** Null when nothing has ever been recorded about them. */
	lastTouchedOn: string | null;
	/** Whole days since the last touch, or since they were added when there is none. */
	quietForDays: number;
}

/** Threshold and cap; the defaults are what Home uses. */
export interface QuietOptions {
	afterDays?: number;
	limit?: number;
}

const DAY_MS = 86_400_000;
const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight UTC of an ISO day, or null when the value is not one. */
function dayMs(value: string): number | null {
	const match = FULL_DATE.exec(value);
	if (!match) return null;
	return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * The people who have gone quiet: those whose recorded story went silent first, longest
 * silence first, then those nobody has written about at all. Deceased people are left out,
 * and an untouched person counts from the day they were added rather than from the beginning
 * of time.
 */
export function quietContacts(
	sources: QuietSource[],
	today: string,
	options: QuietOptions = {}
): QuietContact[] {
	const afterDays = options.afterDays ?? QUIET_AFTER_DAYS;
	const limit = options.limit ?? QUIET_LIMIT;
	const todayMs = dayMs(today);
	if (todayMs === null) throw new Error(`Not a calendar day: ${today}`);

	const quiet: QuietContact[] = [];
	for (const source of sources) {
		if (source.isDeceased) continue;

		// An unreadable touch date is treated as no touch at all: reporting someone as quiet
		// for twenty thousand days because of a malformed row is worse than saying "never".
		const touched = source.lastTouchedOn === null ? null : dayMs(source.lastTouchedOn);
		const sinceMs = touched ?? dayMs(source.knownSince);
		if (sinceMs === null) continue;

		const quietForDays = Math.round((todayMs - sinceMs) / DAY_MS);
		if (quietForDays < afterDays) continue;

		quiet.push({
			contactId: source.contactId,
			contactName: source.contactName,
			avatarPhotoId: source.avatarPhotoId,
			lastTouchedOn: touched === null ? null : source.lastTouchedOn,
			quietForDays
		});
	}

	// A story that went silent outranks one that never began (see the spec for why), then the
	// longest silence, then the name.
	const hadStory = (q: QuietContact) => (q.lastTouchedOn === null ? 1 : 0);
	return quiet
		.sort(
			(a, b) =>
				hadStory(a) - hadStory(b) ||
				b.quietForDays - a.quietForDays ||
				a.contactName.localeCompare(b.contactName)
		)
		.slice(0, limit);
}

/** Port: every person the viewer may see, with the latest day they may see anything about. */
export interface AttentionRepository {
	listQuietSourcesVisibleTo(viewer: Viewer): Promise<QuietSource[]>;
}
