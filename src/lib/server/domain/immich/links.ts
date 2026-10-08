import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import { immichPersonUrl } from '../../../immich/web-link';
import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { activityRecord, type ActivityOf } from '../activity/activity';
import { ContactGoneError } from '../contacts/require-visible';
import { isImmichId, type ImmichFailure, type ImmichGateway, type ImmichPerson } from './gateway';

/*
 * Which Immich person a contact is (docs/02 §2.24.2). A link is household
 * data like a relationship: any member who can see the contact may set or remove it, and
 * it has no visibility of its own — whoever sees the contact sees the link. The repository
 * checks that through the access layer; this file decides what a link may point at.
 */

/** The most faces the picker shows at once; a search narrows a longer list. */
export const FACE_LIMIT = 60;

/** A contact's link to a person in the key owner's Immich library. */
export interface ImmichLink {
	contactId: string;
	immichPersonId: string;
	/** The member who set it. */
	linkedBy: string;
	linkedAt: number;
}

/** Where links are kept. Reads are scoped to what the viewer may see. */
export interface ImmichLinkRepository {
	/** The contact's link, or null when it has none or the contact is out of the viewer's reach. */
	findForContactVisibleTo(viewer: Viewer, contactId: string): Promise<ImmichLink | null>;
	/** The contacts the viewer sees that are linked already — *Find your people* skips them. */
	linkedContactIdsVisibleTo(viewer: Viewer): Promise<Set<string>>;
	/**
	 * Who holds each of these Immich people, if anyone. `name` is the holder's shown name when
	 * the viewer may see them, null when not — the holder's existence is all that may be said.
	 */
	holdersOf(viewer: Viewer, immichPersonIds: readonly string[]): Promise<Map<string, ImmichHolder>>;
	/**
	 * Sets the contact's link, replacing one it had, and writes `audit` with it. `taken` when
	 * the Immich person is already another contact's — then nothing is written at all.
	 */
	save(link: ImmichLink, audit: ActivityOf<'immich.linked'>): Promise<'saved' | 'taken'>;
	/** Removes the contact's link and writes `audit`; false (and nothing written) when there was none. */
	remove(contactId: string, audit: ActivityOf<'immich.unlinked'>): Promise<boolean>;
}

/** The contact an Immich person is linked to; one person belongs to one contact. */
export interface ImmichHolder {
	contactId: string;
	/** Their shown name, or null when the viewer may not see them. */
	name: string | null;
}

/** The part of the contact repository linking needs: is the contact there, and how is it seen. */
export interface LinkVisibleContacts {
	findByIdVisibleTo(
		viewer: Viewer,
		id: string
	): Promise<{ displayName: string; visibility: Visibility } | null>;
}

export interface ImmichLinkDeps {
	links: ImmichLinkRepository;
	contacts: LinkVisibleContacts;
	gateway: ImmichGateway;
	clock: Clock;
	ids: IdGenerator;
}

/** A link Stella will not make, with the reason a member can act on. */
export class ImmichLinkRefusedError extends TranslatableError {
	constructor(reason: ImmichFailure | { linkedTo: ImmichHolder } | { alreadyLinked: string }) {
		super(
			typeof reason === 'string'
				? refusalPhrase(reason)
				: 'alreadyLinked' in reason
					? phrase('immich.error.contactLinked', { name: reason.alreadyLinked })
					: takenPhrase(reason.linkedTo),
			'ImmichLinkRefusedError'
		);
	}
}

/** Already linked: the other contact is named only to someone who may see them. */
function takenPhrase(holder: ImmichHolder) {
	return holder.name === null
		? phrase('immich.error.linkedElsewhere')
		: phrase('immich.error.linkedTo', { name: holder.name });
}

function refusalPhrase(failure: ImmichFailure) {
	if (failure === 'notFound') return phrase('immich.error.personGone');
	if (failure === 'unauthorized') return phrase('immich.error.keyRejected');
	if (failure === 'forbidden') return phrase('immich.error.missingScope', { scope: 'person.read' });
	return phrase('immich.error.unreachable');
}

type Actor = { userId: string; householdId: string };

const viewerOf = (actor: Actor): Viewer => ({ id: actor.userId, householdId: actor.householdId });

/** Who the log says a link was made or removed for, as visible as they are. */
const linkedPerson = (
	contactId: string,
	contact: { displayName: string; visibility: Visibility }
) => ({
	contactId,
	displayName: contact.displayName,
	visibility: contact.visibility
});

/**
 * Link a contact to an Immich person. One Immich person is one contact (docs/04 ADR-096): a
 * person already linked elsewhere is refused, before Immich is asked anything. The person is
 * then looked up, so a stale picker cannot link someone deleted in Immich since, and a hidden
 * person — whom the picker never offers — cannot be linked by a hand-made request either
 * (docs/02 §2.24.2).
 *
 * Two members linking the same face at once both pass the first check; the table's unique
 * index lets one write through, and the other gets the same refusal rather than an error.
 */
export async function linkToImmich(
	deps: ImmichLinkDeps,
	actor: Actor,
	contactId: string,
	immichPersonId: string
): Promise<void> {
	const contact = await deps.contacts.findByIdVisibleTo(viewerOf(actor), contactId);
	if (!contact) throw new ContactGoneError();
	if (!isImmichId(immichPersonId)) throw new ImmichLinkRefusedError('notFound');
	const viewer = viewerOf(actor);
	const holderOtherThanThem = async () => {
		const holder = (await deps.links.holdersOf(viewer, [immichPersonId])).get(immichPersonId);
		return holder && holder.contactId !== contactId ? holder : null;
	};
	const taken = await holderOtherThanThem();
	if (taken) throw new ImmichLinkRefusedError({ linkedTo: taken });

	const person = await deps.gateway.person(immichPersonId);
	if (!person.ok) throw new ImmichLinkRefusedError(person.failure);
	if (person.value.hidden) throw new ImmichLinkRefusedError('notFound');

	const linkedAt = deps.clock.now();
	const saved = await deps.links.save(
		{ contactId, immichPersonId, linkedBy: actor.userId, linkedAt },
		activityRecord(deps, viewer, { kind: 'immich.linked', ...linkedPerson(contactId, contact) })
	);
	if (saved === 'taken') {
		// Lost the race: whoever won holds the person now, and is named as above.
		throw new ImmichLinkRefusedError({
			linkedTo: (await holderOtherThanThem()) ?? { contactId: '', name: null }
		});
	}
}

/** A pair *Find your people* proposed and a member confirmed. */
export interface ConfirmedMatch {
	contactId: string;
	immichPersonId: string;
}

/** What linking from the list came to: how many were linked, and why the others were not. */
export interface LinkMatchesResult {
	linked: number;
	refused: { contactId: string; error: ImmichLinkRefusedError | ContactGoneError }[];
}

/**
 * Link pairs confirmed on *Find your people* (docs/02 §2.24.7) — one row's Link, or *Link all
 * likely*. Each goes through `linkToImmich`, so every check of the picker holds. Unlike the
 * picker, the list only ever adds: a contact linked since the list was shown — by another member,
 * in another tab — keeps that link, because the member confirmed a proposal made for an unlinked
 * person, not a change of someone's face. A refusal does not stop the rest; anything else does.
 */
export async function linkMatches(
	deps: ImmichLinkDeps,
	actor: Actor,
	pairs: readonly ConfirmedMatch[]
): Promise<LinkMatchesResult> {
	const result: LinkMatchesResult = { linked: 0, refused: [] };
	for (const { contactId, immichPersonId } of pairs) {
		try {
			const current = await deps.links.findForContactVisibleTo(viewerOf(actor), contactId);
			if (current && current.immichPersonId !== immichPersonId) {
				const contact = await deps.contacts.findByIdVisibleTo(viewerOf(actor), contactId);
				throw new ImmichLinkRefusedError({ alreadyLinked: contact?.displayName ?? '' });
			}
			if (!current) await linkToImmich(deps, actor, contactId, immichPersonId);
			result.linked++;
		} catch (error) {
			if (!(error instanceof ImmichLinkRefusedError || error instanceof ContactGoneError))
				throw error;
			result.refused.push({ contactId, error });
		}
	}
	return result;
}

/** Remove a contact's link. Needs nothing from Immich, so it works while Immich is down. */
export async function unlinkFromImmich(
	deps: Pick<ImmichLinkDeps, 'links' | 'contacts' | 'clock' | 'ids'>,
	actor: Actor,
	contactId: string
): Promise<boolean> {
	const contact = await deps.contacts.findByIdVisibleTo(viewerOf(actor), contactId);
	if (!contact) throw new ContactGoneError();
	return deps.links.remove(
		contactId,
		activityRecord(deps, viewerOf(actor), {
			kind: 'immich.unlinked',
			...linkedPerson(contactId, contact)
		})
	);
}

/** The contact's link, as the viewer may see it. */
export function readImmichLink(
	deps: Pick<ImmichLinkDeps, 'links'>,
	viewer: Viewer,
	contactId: string
): Promise<ImmichLink | null> {
	return deps.links.findForContactVisibleTo(viewer, contactId);
}

/** What the person page says about a linked contact (docs/02 §2.24.3). */
export type LinkedPersonView =
	| {
			state: 'linked';
			/** The name in Immich, which may differ from Stella's. */
			name: string;
			/** How many photos they are in, or null when the key may not count them. */
			photoCount: number | null;
			/**
			 * Into Immich's web app, for every member who sees the contact (docs/02 §2.24.3). It
			 * opens Immich as it is; someone not signed into the key owner's account lands on
			 * Immich's sign-in or an empty page, which the owner accepted.
			 */
			openUrl: string;
	  }
	| { state: 'personGone' }
	| { state: 'unreachable' };

export interface LinkedPersonDeps {
	gateway: ImmichGateway;
	/** Where links into Immich point (`IMMICH_PUBLIC_URL`). */
	publicUrl: string;
}

/**
 * Ask Immich about a linked person, for the line under the gallery. A revoked key reads as
 * "Immich didn't answer" here: what the member can do about it is the same — nothing — and
 * Settings names the real cause for whoever can fix it.
 */
export async function readLinkedPerson(
	deps: LinkedPersonDeps,
	immichPersonId: string
): Promise<LinkedPersonView> {
	const [person, statistics] = await Promise.all([
		deps.gateway.person(immichPersonId),
		deps.gateway.personStatistics(immichPersonId)
	]);
	if (!person.ok) return { state: person.failure === 'notFound' ? 'personGone' : 'unreachable' };

	return {
		state: 'linked',
		name: person.value.name,
		photoCount: statistics.ok ? statistics.value.assets : null,
		openUrl: immichPersonUrl(deps.publicUrl, immichPersonId)
	};
}

/** A face the picker offers. */
export interface ImmichFace {
	id: string;
	name: string;
	/** Already another contact's: the picker shows it, but it cannot be picked. */
	linkedTo: { name: string | null } | null;
}

export type FacesOutcome =
	{ ok: true; faces: ImmichFace[] } | { ok: false; failure: ImmichFailure };

/**
 * The faces the picker shows: those whose name matches what is typed, or the library's named
 * people when nothing is. When a full name finds nobody, the first name is tried — Stella and
 * Immich often spell the rest differently ("Bert Example-Smith" and "Bert Example"), and the
 * face, not the name, settles who is who (docs/02 §2.24.7). Unnamed and hidden people are never
 * offered (docs/02 §2.24.2).
 */
export async function findImmichFaces(
	deps: Pick<ImmichLinkDeps, 'gateway' | 'links'>,
	viewer: Viewer,
	query: string
): Promise<FacesOutcome> {
	const wanted = query.trim().replace(/\s+/g, ' ');
	let found = wanted
		? await deps.gateway.searchPeople(wanted)
		: await deps.gateway
				.listPeople(1, FACE_LIMIT)
				.then((page) => (page.ok ? { ok: true as const, value: page.value.people } : page));
	if (!found.ok) return found;

	const offered = (person: ImmichPerson) => !person.hidden && person.name !== '';
	const firstName = wanted.split(' ')[0];
	if (!found.value.some(offered) && firstName !== wanted) {
		found = await deps.gateway.searchPeople(firstName);
		if (!found.ok) return found;
	}

	const shown = found.value.filter(offered).slice(0, FACE_LIMIT);
	const holders = await deps.links.holdersOf(
		viewer,
		shown.map((person) => person.id)
	);
	return {
		ok: true,
		faces: shown.map(({ id, name }) => {
			const holder = holders.get(id);
			return { id, name, linkedTo: holder ? { name: holder.name } : null };
		})
	};
}
