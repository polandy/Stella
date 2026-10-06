import { keptAt } from './cache-policy';

/*
 * Every person the member can see, readable out of reach (docs/concepts/offline-reading.md §4).
 * Pure: which pages the service worker keeps ahead, which kept pages must go because their
 * person is no longer visible, and when to look again. `src/service-worker.ts` runs the plan.
 */

/** Where the worker asks who the member can see now. Answered for the session, never kept. */
export const VISIBLE_PEOPLE_PATH = '/api/offline/people';

/** One person the member can see, as the list says. */
export interface VisiblePerson {
	id: string;
	avatarPhotoId: string | null;
}

/**
 * How long a refresh holds. Each page open in reach asks for one; without a pause, reading a
 * few pages in a row would revalidate every person each time.
 */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * SvelteKit's mask for "the page alone, not the layouts around it": a person page and a
 * journal both sit under the root layout and the app layout.
 */
const PAGE_ONLY = 'x-sveltekit-invalidated=001';

/** The pages every person has that are worth reading offline (§7 decision 1). */
const personPages = (id: string) => [`/contacts/${id}`, `/contacts/${id}/journal`];

/** What to fetch and keep for `people`: their pages as page data, and their avatars. */
export function peopleToKeep(people: readonly VisiblePerson[]): {
	pages: string[];
	avatars: string[];
} {
	return {
		pages: people.flatMap(({ id }) =>
			personPages(id).map((page) => `${page}/__data.json?${PAGE_ONLY}`)
		),
		avatars: people.flatMap(({ avatarPhotoId }) =>
			avatarPhotoId ? [`/media/${avatarPhotoId}?thumb`] : []
		)
	};
}

/**
 * Pages under `/contacts/` that are not a person: the static routes, and `__data.json`, the
 * People list's own data. Anything else there is somebody's page; a route added here later and
 * missed is only pruned, never shown to someone who may not see it.
 */
const NOT_A_PERSON = new Set(['new', 'quick-add', 'suggest', '__data.json']);

/**
 * The kept keys to delete: every page — as a document or as its data, the person page and
 * everything beneath it — of a person who is not in `visibleIds`. Deleted, merged, made
 * private by someone else, or gone in an archive import: none of them may stay readable.
 * Photos are left as they are kept today (when seen).
 */
export function keysToPrune(
	keptKeys: readonly string[],
	origin: string,
	visibleIds: ReadonlySet<string>
): string[] {
	return keptKeys.filter((key) => {
		const url = new URL(key);
		if (url.origin !== origin) return false;
		const [first, id] = url.pathname.split('/').filter(Boolean);
		if (first !== 'contacts' || id === undefined || NOT_A_PERSON.has(id)) return false;
		return !visibleIds.has(id);
	});
}

/**
 * Whether an answer may replace the copy held: not when it is older. A refresh and a page the
 * member opens can race, and the slower of the two must not put back what the other replaced.
 * Unknown dates never hold a copy back.
 */
export function isNewerCopy(answerDate: string | null, keptDate: string | null): boolean {
	const answer = keptAt(answerDate);
	const kept = keptAt(keptDate);
	return answer === null || kept === null || answer >= kept;
}

/** Whether a refresh is due, given when the last one finished (null: never). */
export function refreshDue(lastRunAt: number | null, now: number): boolean {
	return lastRunAt === null || now - lastRunAt >= REFRESH_INTERVAL_MS;
}

/**
 * The list as the server sent it, or null when it is not one. A broken answer must never read
 * as "nobody is visible", which would prune the device empty.
 */
export function parseVisiblePeople(body: unknown): VisiblePerson[] | null {
	if (typeof body !== 'object' || body === null) return null;
	const people = (body as { people?: unknown }).people;
	if (!Array.isArray(people)) return null;
	const valid = people.every(
		(person: unknown) =>
			typeof person === 'object' &&
			person !== null &&
			typeof (person as VisiblePerson).id === 'string' &&
			((person as VisiblePerson).avatarPhotoId === null ||
				typeof (person as VisiblePerson).avatarPhotoId === 'string')
	);
	return valid
		? people.map(({ id, avatarPhotoId }: VisiblePerson) => ({ id, avatarPhotoId }))
		: null;
}
