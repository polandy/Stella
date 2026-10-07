import type { Viewer } from '../../access/visibility';
import type { CreateContactInput } from '../contacts/contacts';
import type { PersonAdder } from '../contacts/add-person';
import { isImmichId } from './gateway';
import { ImmichLinkRefusedError, linkToImmich, type ImmichLinkDeps } from './links';

/*
 * *Assign…* on a row of *New from Immich* (docs/02 §2.24.7): a face Immich names that is nobody
 * in Stella yet goes to someone the member picked — *This is the person* — or to a person added
 * from it. Both end in `linkToImmich`, so every check of the picker holds (docs/04 ADR-096).
 * Neither has an undo, like a link made on *Find your people*.
 */

export interface AddFromImmichDeps extends ImmichLinkDeps {
	/** Adds a person the way every person added by hand is added (`createContact`). */
	addContact(adder: PersonAdder, input: CreateContactInput): Promise<string>;
}

/** The name the create form posts; blank parts read as missing. */
export interface NewcomerName {
	firstName: string;
	lastName: string;
	nickname: string;
	/** Asked for when there is no last name, so they can be told apart (docs/02 §2.2.3). */
	description: string;
}

/**
 * *This is the person* for someone linked to another face already: linking would replace that
 * link, so the screen asks first and posts again with `replace` once the member confirmed.
 */
export class WouldReplaceLinkError extends ImmichLinkRefusedError {
	constructor(displayName: string) {
		super({ alreadyLinked: displayName });
		this.name = 'WouldReplaceLinkError';
	}
}

const viewerOf = (actor: { userId: string; householdId: string }): Viewer => ({
	id: actor.userId,
	householdId: actor.householdId
});

/**
 * Add a person from an Immich face and link them to it. The face is checked first — free, and
 * still in Immich and not hidden there — so nobody is added for a face that cannot be theirs.
 * The person is shared, as anyone added by hand starts (docs/02 §2.10). Only a second member
 * linking the same face in the moment between the check and the link leaves the person added
 * and unlinked; the refusal then names who holds the face.
 */
export async function addPersonFromImmich(
	deps: AddFromImmichDeps,
	adder: PersonAdder,
	immichPersonId: string,
	name: NewcomerName
): Promise<string> {
	if (!isImmichId(immichPersonId)) throw new ImmichLinkRefusedError('notFound');
	const holder = (await deps.links.holdersOf(viewerOf(adder), [immichPersonId])).get(
		immichPersonId
	);
	if (holder) throw new ImmichLinkRefusedError({ linkedTo: holder });
	const person = await deps.gateway.person(immichPersonId);
	if (!person.ok) throw new ImmichLinkRefusedError(person.failure);
	if (person.value.hidden) throw new ImmichLinkRefusedError('notFound');

	const contactId = await deps.addContact(adder, { ...name, visibility: 'shared' });
	await linkToImmich(deps, adder, contactId, immichPersonId);
	return contactId;
}

/**
 * *This is the person*: link the face to someone already in Stella. Someone linked to another
 * face already would lose it — one contact is one Immich person — so that takes `replace`, which
 * the screen sets only after the member confirmed it.
 */
export async function assignNewcomer(
	deps: ImmichLinkDeps,
	actor: { userId: string; householdId: string },
	contactId: string,
	immichPersonId: string,
	{ replace }: { replace: boolean }
): Promise<void> {
	const current = await deps.links.findForContactVisibleTo(viewerOf(actor), contactId);
	if (current && current.immichPersonId !== immichPersonId && !replace) {
		const contact = await deps.contacts.findByIdVisibleTo(viewerOf(actor), contactId);
		throw new WouldReplaceLinkError(contact?.displayName ?? '');
	}
	await linkToImmich(deps, actor, contactId, immichPersonId);
}
