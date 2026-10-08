import { likelyMatchFor } from '../../../immich/match';
import type { Viewer } from '../../access/visibility';
import type { ImmichFailure } from './gateway';
import { faceUrlFor } from './glimpse';
import { allPeople, matchListed, type ImmichMatchingDeps } from './matching';

/*
 * The person page's suggestion (docs/02 §2.24.7): for one unlinked person, the face *Find your
 * people* would link in one tap — or nothing. It is that list, read the same way and cut to one
 * person, rather than a matcher of its own: whether a match is likely depends on everyone else
 * the viewer sees (a full name two people share is a doubt), and on the household's ignored
 * pairs, so only the whole list can say it. A maybe is never offered here; it stays in Settings.
 *
 * Linking and ignoring go through the same use-cases as the list (`linkToImmich`,
 * `ignoreMatch`), so every rule holds on the person page too.
 */

export type PersonMatchDeps = Pick<
	ImmichMatchingDeps,
	'gateway' | 'links' | 'ignores' | 'directory' | 'signer'
>;

/** The face proposed for the person, ready for the card. */
export interface PersonMatch {
	personId: string;
	/** The name in Immich, which may be spelled differently from Stella's. */
	name: string;
	/** How many photos they are in, or null when the key may not count them. */
	photoCount: number | null;
	/** The face through the signed proxy, signed for this person (docs/04 ADR-097). */
	faceUrl: string;
}

export type PersonMatchOutcome =
	/** The viewer may not see the person (or they are archived): nothing is said about them. */
	| { kind: 'notVisible' }
	| { kind: 'failed'; failure: ImmichFailure }
	/** `match` is null when there is no likely face — also for a person linked already. */
	| { kind: 'answered'; match: PersonMatch | null };

/** The likely Immich face for `contactId`, as *Find your people* would propose it. */
export async function findLikelyMatchFor(
	deps: PersonMatchDeps,
	viewer: Viewer,
	contactId: string
): Promise<PersonMatchOutcome> {
	const [contacts, linkedContactIds] = await Promise.all([
		deps.directory.listVisibleTo(viewer),
		deps.links.linkedContactIdsVisibleTo(viewer)
	]);
	if (!contacts.some((contact) => contact.id === contactId)) return { kind: 'notVisible' };
	// Linked already: nothing to propose, and Immich need not be asked at all.
	if (linkedContactIds.has(contactId)) return { kind: 'answered', match: null };

	const listed = await allPeople(deps.gateway);
	if (!listed.ok) return { kind: 'failed', failure: listed.failure };
	const { matches } = await matchListed(deps, viewer, {
		contacts,
		linkedContactIds,
		listed: listed.value
	});

	const personId = likelyMatchFor(matches, contactId);
	if (personId === null) return { kind: 'answered', match: null };
	const person = listed.value.find((candidate) => candidate.id === personId)!;
	const [statistics, faceUrl] = await Promise.all([
		deps.gateway.personStatistics(personId),
		faceUrlFor(deps.signer, contactId, personId)
	]);
	return {
		kind: 'answered',
		match: {
			personId,
			name: person.name,
			photoCount: statistics.ok ? statistics.value.assets : null,
			faceUrl
		}
	};
}
