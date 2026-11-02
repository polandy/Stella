import { requireViewer } from '$lib/server/auth/guards';
import { systemClock } from '$lib/server/clock';
import { todayFor } from '$lib/dates/today';
import { pickedDay } from '$lib/memories/memories';
import { memoriesOn } from '$lib/server/domain/memories/memories';
import { memoryYearsForView } from '../_shared/memories-view';
import type { PageServerLoad } from './$types';

/*
 * *On this day* in full (docs/02 §2.12.1): every moment, touchpoint and gallery photo the reader
 * may see on a day's date in earlier years, one card per year. The day is today, or the one
 * `?day=` picks — never one still to come.
 */

export const load: PageServerLoad = async ({ locals, url }) => {
	const viewer = requireViewer(locals);
	const today = todayFor(systemClock);
	const day = pickedDay(url.searchParams.get('day'), today);
	const { years, photos } = await memoriesOn(locals.services.media.memoryDeps, viewer, day);
	return { today, day, years: memoryYearsForView(years, photos) };
};
