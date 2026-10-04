import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import { immichPersonUrl } from '../../../immich/web-link';
import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { NewActivityEntry } from '../activity/activity';
import { ContactGoneError } from '../contacts/require-visible';
import { isKeyOwner, type ImmichConnection } from './connection';
import { isImmichId, type ImmichFailure, type ImmichGateway, type ImmichPerson } from './gateway';

/*
 * Which Immich person a contact is (docs/concepts/immich.md §4.3, §5, §6). A link is household
 * data like a relationship: any member who can see the contact may set or remove it (§9.4), and
 * it has no visibility of its own — whoever sees the contact sees the link. The repository
 * checks that through the access layer; this file decides what a link may point at.
 */

/** The activity-log entity a link's changes are written under. */
export const IMMICH_LINK_ENTITY = 'immich_link';

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
	/** Sets the contact's link, replacing one it had, and writes `audit` with it. */
	save(link: ImmichLink, audit: NewActivityEntry): Promise<void>;
	/** Removes the contact's link and writes `audit`; false (and nothing written) when there was none. */
	remove(contactId: string, audit: NewActivityEntry): Promise<boolean>;
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
	constructor(failure: ImmichFailure) {
		super(refusalPhrase(failure), 'ImmichLinkRefusedError');
	}
}

function refusalPhrase(failure: ImmichFailure) {
	if (failure === 'notFound') return phrase('immich.error.personGone');
	if (failure === 'unauthorized') return phrase('immich.error.keyRejected');
	if (failure === 'forbidden') return phrase('immich.error.missingScope', { scope: 'person.read' });
	return phrase('immich.error.unreachable');
}

type Actor = { userId: string; householdId: string };

const viewerOf = (actor: Actor): Viewer => ({ id: actor.userId, householdId: actor.householdId });

/** What the log says; the precomputed line of docs/03 §activity_log. */
function logEntry(
	deps: Pick<ImmichLinkDeps, 'clock' | 'ids'>,
	actor: Actor,
	contactId: string,
	contact: { visibility: Visibility },
	summary: string
): NewActivityEntry {
	return {
		id: deps.ids.next(),
		householdId: actor.householdId,
		actorId: actor.userId,
		// An update to the person, not a record of its own: the stream shows deletions, and a
		// link removed is not a person removed (docs/02 §2.11).
		action: 'update',
		entityType: IMMICH_LINK_ENTITY,
		entityId: contactId,
		contactId,
		// Mirrors the contact: the link of a private contact is as private as the contact.
		visibility: contact.visibility,
		summary,
		createdAt: deps.clock.now()
	};
}

/**
 * Link a contact to an Immich person. The person is looked up first, so a stale picker cannot
 * link someone deleted in Immich since, and a hidden person — whom the picker never offers —
 * cannot be linked by a hand-made request either (concept §5).
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

	const person = await deps.gateway.person(immichPersonId);
	if (!person.ok) throw new ImmichLinkRefusedError(person.failure);
	if (person.value.hidden) throw new ImmichLinkRefusedError('notFound');

	const linkedAt = deps.clock.now();
	await deps.links.save(
		{ contactId, immichPersonId, linkedBy: actor.userId, linkedAt },
		logEntry(deps, actor, contactId, contact, `linked ${contact.displayName} to Immich`)
	);
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
		logEntry(deps, actor, contactId, contact, `unlinked ${contact.displayName} from Immich`)
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

/** What the person page says about a linked contact (concept §4.3, §4.5). */
export type LinkedPersonView =
	| {
			state: 'linked';
			/** The name in Immich, which may differ from Stella's. */
			name: string;
			/** How many photos they are in, or null when the key may not count them. */
			photoCount: number | null;
			/** Into Immich's web app — only for the key owner, for whom it leads somewhere. */
			openUrl: string | null;
	  }
	| { state: 'personGone' }
	| { state: 'unreachable' };

export interface LinkedPersonDeps {
	gateway: ImmichGateway;
	connection: ImmichConnection;
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
	immichPersonId: string,
	viewerEmail: string
): Promise<LinkedPersonView> {
	const [person, statistics, status] = await Promise.all([
		deps.gateway.person(immichPersonId),
		deps.gateway.personStatistics(immichPersonId),
		deps.connection.status()
	]);
	if (!person.ok) return { state: person.failure === 'notFound' ? 'personGone' : 'unreachable' };

	return {
		state: 'linked',
		name: person.value.name,
		photoCount: statistics.ok ? statistics.value.assets : null,
		openUrl: isKeyOwner(status, viewerEmail) ? immichPersonUrl(deps.publicUrl, immichPersonId) : null
	};
}

/** A face the picker offers. */
export interface ImmichFace {
	id: string;
	name: string;
}

export type FacesOutcome = { ok: true; faces: ImmichFace[] } | { ok: false; failure: ImmichFailure };

/**
 * The faces the picker shows: those whose name matches what is typed, or the library's named
 * people when nothing is. When a full name finds nobody, the first name is tried — Stella and
 * Immich often spell the rest differently ("Bert Example-Smith" and "Bert Example"), and the
 * face, not the name, settles who is who (concept §4.2). Unnamed and hidden people are never
 * offered (§5).
 */
export async function findImmichFaces(
	deps: Pick<ImmichLinkDeps, 'gateway'>,
	query: string
): Promise<FacesOutcome> {
	const wanted = query.trim().replace(/\s+/g, ' ');
	let found = wanted
		? await deps.gateway.searchPeople(wanted)
		: await deps.gateway.listPeople(1, FACE_LIMIT).then((page) =>
				page.ok ? { ok: true as const, value: page.value.people } : page
			);
	if (!found.ok) return found;

	const offered = (person: ImmichPerson) => !person.hidden && person.name !== '';
	const firstName = wanted.split(' ')[0];
	if (!found.value.some(offered) && firstName !== wanted) {
		found = await deps.gateway.searchPeople(firstName);
		if (!found.ok) return found;
	}

	return {
		ok: true,
		faces: found.value
			.filter(offered)
			.slice(0, FACE_LIMIT)
			.map(({ id, name }) => ({ id, name }))
	};
}
