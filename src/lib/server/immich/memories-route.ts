import { isWholeDay } from '../../dates/calendar';
import type { Viewer } from '../access/visibility';
import {
	immichMemoriesOn,
	immichMemoryPage,
	type ImmichMemoryDeps
} from '../domain/memories/immich';
import { IMMICH_MEDIA_CACHE_CONTROL, type RouteRefusal } from './routes';

/*
 * What `/immich/on-this-day` answers (docs/02 §2.12.1), decided here so it can be tested without a
 * server; `src/routes/(app)/immich/on-this-day/+server.ts` only wires it.
 */

/** The request's `?day=`, and for *Show more* `&year=&from=` — both or neither. */
export interface ImmichMemoriesQuery {
	day: string | null;
	year: string | null;
	from: string | null;
}

const NOT_SIGNED_IN: RouteRefusal = { status: 401, message: 'errors.notSignedIn' };
const NOT_FOUND: RouteRefusal = { status: 404, message: 'errors.notFound' };

const COUNT = /^\d{1,6}$/;

/**
 * `GET /immich/on-this-day?day=`: every earlier year's photos of the day from Immich, for any
 * member, signed for their household; with `&year=&from=`, the next photos of that year. A
 * failure in Immich is said in the body — the band and the page then show nothing more.
 */
export async function answerImmichMemories(
	deps: ImmichMemoryDeps | null,
	viewer: Viewer | null,
	query: ImmichMemoriesQuery
): Promise<Response | RouteRefusal> {
	if (!viewer) return NOT_SIGNED_IN;
	if (!deps) return NOT_FOUND;
	const { day, year, from } = query;
	if (day === null || !isWholeDay(day)) return NOT_FOUND;
	if ((year === null) !== (from === null)) return NOT_FOUND;
	if (year !== null && from !== null && !(COUNT.test(year) && COUNT.test(from))) return NOT_FOUND;
	const view =
		year !== null && from !== null
			? await immichMemoryPage(deps, viewer, day, Number(year), Number(from))
			: await immichMemoriesOn(deps, viewer, day);
	return Response.json(view, { headers: { 'Cache-Control': IMMICH_MEDIA_CACHE_CONTROL } });
}
