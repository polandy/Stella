/*
 * The geometry of a circle's sub-circles timeline (docs/02 §2.4.2): a month axis from the first
 * start to the last end, a bar per dated sub-circle, today's marker and a tick at every new year.
 * All in percent of the track, so the page only places them. Pure and client-safe.
 */

/** What a timeline needs of a circle. */
export interface TimelinePeriod {
	startDate: string | null;
	endDate: string | null;
}

/** A sub-circle's bar, in percent of the track. */
export interface TimelineBar {
	left: number;
	width: number;
	/** Open-ended: the bar runs to the axis end, with a square right edge. */
	open: boolean;
}

/** A year boundary on the axis. */
export interface TimelineTick {
	year: number;
	at: number;
}

export interface CircleTimeline {
	/** One per period, in the order given; null for a row without a start. */
	bars: (TimelineBar | null)[];
	/** Today on the track, or null when today lies before the axis. */
	today: number | null;
	ticks: TimelineTick[];
}

/** A bar never shrinks below this, so a one-month circle stays visible on a long axis. */
const MIN_BAR_WIDTH = 1.5;
/** The axis always reaches this many months past today, so today is never on its edge. */
const MONTHS_AFTER_TODAY = 2;
/** How far past today an open-ended bar is drawn. */
const OPEN_END_MONTHS = 6;

/** A date as a month count; `atEnd` reads a bare year as its December. */
function monthIndex(date: string, atEnd = false): number {
	const [year, month] = date.split('-');
	return Number(year) * 12 + (month ? Number(month) - 1 : atEnd ? 11 : 0);
}

/** The timeline of `periods` as of `today` (YYYY-MM-DD), or null when none has a start. */
export function circleTimeline(
	periods: readonly TimelinePeriod[],
	today: string
): CircleTimeline | null {
	const dated = periods.filter((p) => p.startDate !== null);
	if (dated.length === 0) return null;

	const [, , day] = today.split('-');
	const todayMonth = monthIndex(today);
	const [todayYear, todayMonthOfYear] = today.split('-').map(Number);
	const daysInMonth = new Date(Date.UTC(todayYear, todayMonthOfYear, 0)).getUTCDate();
	const todayAt = todayMonth + (Number(day) - 1) / daysInMonth;

	const lo = Math.min(...dated.map((p) => monthIndex(p.startDate!)));
	let hi = todayMonth + MONTHS_AFTER_TODAY;
	for (const p of dated) {
		hi = Math.max(
			hi,
			p.endDate === null ? todayMonth + OPEN_END_MONTHS + 1 : monthIndex(p.endDate, true) + 1
		);
	}
	const span = hi - lo;
	const pct = (month: number) => ((month - lo) / span) * 100;

	const bars = periods.map((p): TimelineBar | null => {
		if (p.startDate === null) return null;
		const left = pct(monthIndex(p.startDate));
		const right = p.endDate === null ? 100 : pct(monthIndex(p.endDate, true) + 1);
		return { left, width: Math.max(right - left, MIN_BAR_WIDTH), open: p.endDate === null };
	});

	const ticks: TimelineTick[] = [];
	for (let year = Math.floor(lo / 12) + 1; year * 12 < hi; year++) {
		ticks.push({ year, at: pct(year * 12) });
	}

	return { bars, today: todayAt >= lo ? pct(todayAt) : null, ticks };
}
