import type { LibraryMonths, LibraryView } from '../../../immich/library';
import { lastDayOf } from '../../../immich/library-nav';
import type { Viewer } from '../../access/visibility';
import { cameraDayOf, cameraDaysWindow } from './camera-day';
import { signLibraryPhotos, type ImmichLibraryDeps } from './library';

/*
 * The timeline as the photo picker walks it — years, a year, a month (docs/dev/02 §2.24.9): the
 * months that hold photos, from Immich's time buckets, and a month read a page at a time.
 */

/** How many photos one page of a month reads from Immich. */
export const LIBRARY_MONTH_PAGE = 100;

/**
 * The months that hold photos, newest first. A key without `timeline.read` is `forbidden`: the
 * picker leaves out the overview and keeps the days and the search.
 */
export async function readLibraryMonths(deps: ImmichLibraryDeps): Promise<LibraryMonths> {
	const listed = await deps.gateway.timelineMonths();
	if (!listed.ok) return { state: listed.failure === 'forbidden' ? 'forbidden' : 'unreachable' };
	return { state: 'months', months: listed.value.filter(({ count }) => count > 0) };
}

/**
 * One page of the photos taken in `month` (`YYYY-MM`, on the camera's clock), oldest first, from
 * `cursor` on. The window reaches into the months beside it, whose photos are left out, so a page
 * may be short — or empty — with more to come: only a null cursor ends the month.
 */
export async function readLibraryMonth(
	deps: ImmichLibraryDeps,
	viewer: Viewer,
	month: string,
	cursor: string | null
): Promise<LibraryView> {
	const window = cameraDaysWindow(`${month}-01`, lastDayOf(month));
	const listed = await deps.gateway.takenAssets(window, 'oldest', LIBRARY_MONTH_PAGE, cursor);
	if (!listed.ok) return { state: 'unreachable' };
	const ofTheMonth = listed.value.assets.filter((asset) => cameraDayOf(asset)?.startsWith(month));
	return {
		state: 'month',
		month,
		photos: await signLibraryPhotos(deps.signer, viewer, ofTheMonth),
		nextCursor: listed.value.nextCursor
	};
}
