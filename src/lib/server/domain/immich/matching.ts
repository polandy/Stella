import { matchImmichPeople, type MatchableContact, type MatchStrength } from '../../../immich/match';
import type { Viewer } from '../../access/visibility';
import type { ImmichFailure, ImmichGateway, ImmichPerson } from './gateway';
import { faceUrlFor } from './glimpse';
import type { ImmichLinkRepository } from './links';
import type { ImmichMediaSigner } from './signed-media';

/*
 * *Settings → Immich → Find your people* (docs/concepts/immich.md §4.2, docs/02 §2.24.6): the
 * people the viewer sees, next to the faces Immich has named, matched by name in
 * `src/lib/immich/match.ts`. Any member may use it — a link is household data (§9.4) — and it
 * only ever lists contacts the access layer lets the viewer see. Linking itself is
 * `linkToImmich`, the same use-case the person page's picker calls, so every check holds here too.
 */

/** Immich's largest page of people (`GET /api/people`, concept §2). */
export const PEOPLE_PAGE_SIZE = 1000;

/**
 * Where the reading of Immich's people stops — a hundred thousand faces, far beyond a family's
 * library. Only a server that claims one more page forever would reach it.
 */
const MAX_PEOPLE_PAGES = 100;

/** How many photo counts are asked of Immich at once, so a long list does not flood it. */
const COUNTS_AT_ONCE = 6;

/** What the list reads of a contact: its names, and what its avatar needs. */
export interface MatchingContact extends MatchableContact {
	avatarPhotoId: string | null;
}

export interface ImmichMatchingDeps {
	gateway: Pick<ImmichGateway, 'listPeople' | 'personStatistics'>;
	links: Pick<ImmichLinkRepository, 'holdersOf' | 'linkedContactIdsVisibleTo'>;
	/** The contacts the viewer sees, through the access layer. */
	contacts: { listVisibleTo(viewer: Viewer): Promise<MatchingContact[]> };
	signer: ImmichMediaSigner;
}

/** A face proposed for a contact, ready for the screen. */
export interface MatchFace {
	personId: string;
	/** The name in Immich, which may be spelled differently from Stella's. */
	name: string;
	strength: MatchStrength;
	/** How many photos they are in, or null when the key may not count them. */
	photoCount: number | null;
	/** The face through the signed proxy, signed for this contact (concept §9.10). */
	faceUrl: string;
}

/** One row of the list. */
export interface MatchRow {
	contact: { id: string; displayName: string; avatarPhotoId: string | null };
	/** `likely`: one tap links it, and *Link all likely* takes it. `maybe`: the member picks a face. */
	kind: MatchStrength;
	candidates: MatchFace[];
}

export type MatchingOutcome = { ok: true; rows: MatchRow[] } | { ok: false; failure: ImmichFailure };

/** Every page of Immich's people; hidden ones are already left out by the gateway. */
async function allPeople(
	gateway: ImmichMatchingDeps['gateway']
): Promise<{ ok: true; value: ImmichPerson[] } | { ok: false; failure: ImmichFailure }> {
	const people: ImmichPerson[] = [];
	for (let page = 1; page <= MAX_PEOPLE_PAGES; page++) {
		const answer = await gateway.listPeople(page, PEOPLE_PAGE_SIZE);
		if (!answer.ok) return answer;
		people.push(...answer.value.people);
		if (!answer.value.hasNextPage) break;
	}
	return { ok: true, value: people };
}

/** `work` over every item, at most `limit` at a time, the answers in the items' order. */
async function eachLimited<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const at = next++;
			results[at] = await work(items[at]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

/** The rows of *Find your people* for this viewer, or why Immich gave none. */
export async function findImmichMatches(deps: ImmichMatchingDeps, viewer: Viewer): Promise<MatchingOutcome> {
	const contacts = await deps.contacts.listVisibleTo(viewer);
	// Nobody to match: Immich is not asked to list a library for nothing.
	if (contacts.length === 0) return { ok: true, rows: [] };

	const listed = await allPeople(deps.gateway);
	if (!listed.ok) return listed;
	const named = listed.value.filter((person) => !person.hidden && person.name !== '');

	const [holders, linkedContactIds] = await Promise.all([
		// Unscoped on the Immich side: a face held by someone the viewer cannot see is taken all
		// the same, and is simply not offered (concept §9.8).
		deps.links.holdersOf(
			viewer,
			named.map((person) => person.id)
		),
		deps.links.linkedContactIdsVisibleTo(viewer)
	]);

	const matches = matchImmichPeople({
		contacts,
		people: named,
		linkedContactIds,
		linkedPersonIds: new Set(holders.keys())
	});
	if (matches.length === 0) return { ok: true, rows: [] };

	const personById = new Map(named.map((person) => [person.id, person]));
	const contactById = new Map(contacts.map((c) => [c.id, c]));
	const shownPeople = [...new Set(matches.flatMap((m) => m.candidates.map((c) => c.personId)))];
	const counts = new Map(
		await eachLimited(shownPeople, COUNTS_AT_ONCE, async (id) => {
			const statistics = await deps.gateway.personStatistics(id);
			return [id, statistics.ok ? statistics.value.assets : null] as const;
		})
	);

	const rows = await Promise.all(
		matches.map(async (match): Promise<MatchRow> => {
			const { id, displayName, avatarPhotoId } = contactById.get(match.contactId)!;
			return {
				contact: { id, displayName, avatarPhotoId },
				kind: match.kind,
				candidates: await Promise.all(
					match.candidates.map(async ({ personId, strength }) => ({
						personId,
						name: personById.get(personId)!.name,
						strength,
						photoCount: counts.get(personId) ?? null,
						faceUrl: await faceUrlFor(deps.signer, id, personId)
					}))
				)
			};
		})
	);
	return { ok: true, rows };
}
