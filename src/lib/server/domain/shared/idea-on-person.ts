import { phrase, type Phrase } from '../../../i18n/phrase';
import type { PartialDate } from '../../../dates/partial-date';
import { webLink } from '../../../links/web-link';
import { birthOf, checkWhen } from '../../../when/resolve';
import type { When } from '../../../when/when';
import type { Visibility, Viewer } from '../../access/visibility';
import type { ContactLookup } from '../contacts/contacts';
import { ContactGoneError } from '../contacts/require-visible';

/*
 * The checks a record noted on one person shares — a gift idea (docs/dev/02 §2.25), an outing
 * (§2.27), a to-do (§2.26): its line and, for a gift or an outing, its link, its when, and
 * whether it may be kept from its person. Each context keeps its own entity, state machine and phrases; a check takes the error it
 * throws, so `errors.gift.*` and `errors.plan.*` stay apart.
 */

/** The member doing it. */
export interface IdeaActor {
	userId: string;
	householdId: string;
}

/** Port the domain owns: which member's own person a person is (docs/dev/03 §3.7). */
export interface OwnPersonReads {
	/** The current member whose own person `contactId` is, in the household, or null. */
	memberWhoseOwnPerson(householdId: string, contactId: string): Promise<string | null>;
	/** Every current member of the household who has an own person, with that person. */
	membersOwnPeople(householdId: string): Promise<{ memberId: string; contactId: string }[]>;
}

export const viewerOf = (actor: IdeaActor): Viewer => ({
	id: actor.userId,
	householdId: actor.householdId
});

/** Text as stored: trimmed, null when empty. */
export const orNull = (value: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** The record's line, required. */
export function requiredTitle(raw: string, missing: () => Error): string {
	const title = raw.trim();
	if (title.length === 0) throw missing();
	return title;
}

/** The record's link, a web address or none. */
export function webLinkOf(raw: string | null, notALink: () => Error): string | null {
	const link = webLink(raw ?? '');
	if (!link.ok) throw notALink();
	return link.url;
}

/** The when a record on someone born so may keep, checked against the household's day. */
export function checkedWhen(
	when: When | null,
	birth: PartialDate | null,
	today: string,
	refused: (message: Phrase) => Error
): When | null {
	const check = checkWhen(when, birth, today);
	if (!check.ok) throw refused(phrase(`errors.when.${check.problem}`));
	return check.when;
}

/** The birth date of the person a record is on, who the actor must be able to see. */
export async function birthOfVisible(
	contacts: ContactLookup,
	actor: IdeaActor,
	contactId: string
): Promise<PartialDate | null> {
	const contact = await contacts.findByIdVisibleTo(viewerOf(actor), contactId);
	if (!contact) throw new ContactGoneError();
	return birthOf(contact);
}

/**
 * Whether a record is kept from its person: only a shared one can be, and never by the member
 * whose own person that is — nobody keeps a surprise from themselves.
 */
export async function keptFromPerson(
	ownPeople: OwnPersonReads,
	author: IdeaActor,
	contactId: string,
	visibility: Visibility,
	asked: boolean,
	ownSurprise: () => Error
): Promise<boolean> {
	if (!asked || visibility !== 'shared') return false;
	const member = await ownPeople.memberWhoseOwnPerson(author.householdId, contactId);
	if (member === author.userId) throw ownSurprise();
	return true;
}

/**
 * Whether the viewer's form may offer *Everyone but …* for this person: only a member can be kept
 * from anything — a person who is nobody's own never opens Stella — and never by themselves.
 */
export async function mayKeepFrom(
	ownPeople: OwnPersonReads,
	viewer: Viewer,
	contactId: string
): Promise<boolean> {
	const member = await ownPeople.memberWhoseOwnPerson(viewer.householdId, contactId);
	return member !== null && member !== viewer.id;
}

/** The people `mayKeepFrom` answers yes for, all at once (§2.25.11). */
export async function peopleToKeepFrom(
	ownPeople: OwnPersonReads,
	viewer: Viewer
): Promise<string[]> {
	const owners = await ownPeople.membersOwnPeople(viewer.householdId);
	return owners.filter((o) => o.memberId !== viewer.id).map((o) => o.contactId);
}
