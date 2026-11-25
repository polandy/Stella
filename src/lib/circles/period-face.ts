import type { DateLanguage } from '#lib/dates/labels.js';

// Which square picture shows a member as they were at the time of a circle (docs/dev/02 §2.4.2).

/** How well the picture fits the member's time in the circle; the page captions it by this. */
export type FaceFit =
	/** Cut from one of this circle's own photos: the circle itself. */
	| 'circle'
	/** Dated inside the window. */
	| 'inside'
	/** The nearest face from before the window. */
	| 'before'
	/** The nearest face from up to two years after it. */
	| 'after'
	/** Nothing close: today's picture, marked as such. */
	| 'today'
	/** The member has no dated window: today's picture, nothing to mark. */
	| 'current'
	/** No picture at all: the initials. */
	| 'none';

/** One square picture of the person, visible to the reader. */
export interface FaceCandidate {
	photoId: string;
	/** Its capture, else when it was added (epoch ms), as `datedAt` in `media/taken-at.ts`. */
	datedAt: number;
	/** The circle whose group photo it was cut from; null for any other face. */
	circleId: string | null;
}

/** The face picked for the member. */
export interface PeriodFace {
	photoId: string | null;
	fit: FaceFit;
	/** The date of the picked face; null for today's picture or none. */
	datedAt: number | null;
}

/** A period as stored: each end a day, or a month or year from an import. */
export interface PeriodWindow {
	start: string | null;
	end: string | null;
}

type Period = { startDate: string | null; endDate: string | null };

/** How far after the window a later face still counts. */
const AFTER_YEARS = 2;

/** The member's window: each end of the membership's own period, else the circle's. */
export function memberWindow(membership: Period, circle: Period): PeriodWindow {
	return {
		start: membership.startDate ?? circle.startDate,
		end: membership.endDate ?? circle.endDate
	};
}

/** The first moment of a stored day, month or year (UTC, like a capture without offset). */
function firstMoment(value: string): number {
	const [year, month = 1, day = 1] = value.split('-').map(Number);
	return Date.UTC(year, month - 1, day);
}

/** The first moment after a stored day, month or year. */
function momentAfter(value: string): number {
	const [year, month, day] = value.split('-').map(Number);
	if (month === undefined) return Date.UTC(year + 1, 0, 1);
	if (day === undefined) return Date.UTC(year, month, 1);
	return Date.UTC(year, month - 1, day + 1);
}

/** The window in epoch ms, ends inclusive, an open end today's end; null when wholly undated. */
export function windowBounds(
	window: PeriodWindow,
	today: string
): { from: number | null; to: number } | null {
	if (window.start === null && window.end === null) return null;
	return {
		from: window.start === null ? null : firstMoment(window.start),
		to: momentAfter(window.end ?? today) - 1
	};
}

function newest(faces: FaceCandidate[]): FaceCandidate | undefined {
	return faces.reduce<FaceCandidate | undefined>(
		(best, f) => (best === undefined || f.datedAt > best.datedAt ? f : best),
		undefined
	);
}

function oldest(faces: FaceCandidate[]): FaceCandidate | undefined {
	return faces.reduce<FaceCandidate | undefined>(
		(best, f) => (best === undefined || f.datedAt < best.datedAt ? f : best),
		undefined
	);
}

const found = (f: FaceCandidate, fit: FaceFit): PeriodFace => ({
	photoId: f.photoId,
	fit,
	datedAt: f.datedAt
});

/** The member's face at the time of the circle, by the fallback order of §2.4.2. */
export function periodFace(input: {
	circleId: string;
	window: PeriodWindow;
	today: string;
	faces: FaceCandidate[];
	avatarPhotoId: string | null;
}): PeriodFace {
	const { faces, avatarPhotoId } = input;
	const ofCircle = newest(faces.filter((f) => f.circleId === input.circleId));
	if (ofCircle) return found(ofCircle, 'circle');

	const today: PeriodFace = avatarPhotoId
		? { photoId: avatarPhotoId, fit: 'today', datedAt: null }
		: { photoId: null, fit: 'none', datedAt: null };
	const bounds = windowBounds(input.window, input.today);
	if (bounds === null) return avatarPhotoId ? { ...today, fit: 'current' } : today;

	const { from, to } = bounds;
	const inside = newest(
		faces.filter((f) => (from === null || f.datedAt >= from) && f.datedAt <= to)
	);
	if (inside) return found(inside, 'inside');

	const before = from === null ? undefined : newest(faces.filter((f) => f.datedAt < from));
	if (before) return found(before, 'before');

	const until = new Date(to);
	until.setUTCFullYear(until.getUTCFullYear() + AFTER_YEARS);
	const after = oldest(faces.filter((f) => f.datedAt > to && f.datedAt <= until.getTime()));
	if (after) return found(after, 'after');

	return today;
}

/** Whether the circle ended before today, so it opens on *Then*. */
export function circleIsPast(circle: { endDate: string | null }, today: string): boolean {
	return circle.endDate !== null && momentAfter(circle.endDate) <= firstMoment(today);
}

/** Whether *Then* would show anyone differently from *Now*; the toggle is there only then. */
export function thenChangesAnything(
	members: { avatarPhotoId: string | null; face: PeriodFace }[]
): boolean {
	return members.some((m) => m.face.photoId !== m.avatarPhotoId);
}

/** The quiet line under a member's name in *Then*; null where there is nothing to say. */
export function periodFaceCaption(lang: DateLanguage, face: PeriodFace): string | null {
	if (face.datedAt === null) return face.fit === 'today' ? lang.t('circles.then.today') : null;
	const date = new Date(face.datedAt);
	const month = date.toLocaleDateString(lang.intlLocale, {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
	if (face.fit === 'circle') return lang.t('circles.then.circle', { when: month });
	if (face.fit === 'inside') return month;
	return lang.t('circles.then.nearest', { year: String(date.getUTCFullYear()) });
}

/** Whether the face is only the closest Stella has, drawn with a dashed ring. */
export function isApproximate(face: PeriodFace): boolean {
	return face.fit === 'before' || face.fit === 'after' || face.fit === 'today';
}
