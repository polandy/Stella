import { isSameAddress } from '../../../people/same-address';
import { TranslatableError } from '../../../i18n/translatable';
import { phrase } from '../../../i18n/phrase';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { NewContactField } from '../contact-fields/contact-fields';
import type { ContactLookup } from '../contacts/contacts';
import { ContactGoneError } from '../contacts/require-visible';

/*
 * A shared home (docs/02 §2.2, *A shared home*; docs/03 §3.3): one address and the people who
 * live there, so a family's address is typed once. A home has no visibility of its own — it is
 * only ever reached through a member the viewer may see — and the database deletes it with its
 * last member.
 *
 * The decisions are here: who joins, which of their own addresses go, who is split off. The
 * adapter applies the result as one `HomeChange` in one transaction.
 */

/** A home as it reads under a person: its line and whom else the viewer may see living there. */
export interface HomeOf {
	id: string;
	label: string | null;
	value: string;
	/** Everyone else in it the viewer may see, by name; never anyone they may not. */
	livesWith: { id: string; displayName: string }[];
}

/** What a write needs to know about a home, its unseen members included. */
export interface HomeState {
	id: string;
	householdId: string;
	label: string | null;
	value: string;
	meta: string | null;
	members: { contactId: string; visible: boolean }[];
}

/** An address a person already has: one of their own fields, or a home they live in. */
export interface HeldAddress {
	contactId: string;
	source: 'field' | 'home';
	/** The field's id, or the home's. */
	id: string;
	label: string | null;
	value: string;
	meta: string | null;
}

export interface NewHome {
	id: string;
	householdId: string;
	label: string | null;
	value: string;
	meta: string | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
}

/** Everything one save does, applied in this order in one transaction. */
export interface HomeChange {
	create: NewHome | null;
	update: { id: string; label: string | null; value: string; updatedAt: number } | null;
	dropFields: { contactId: string; fieldId: string }[];
	addFields: NewContactField[];
	join: { homeId: string; contactId: string; createdBy: string; createdAt: number }[];
	/** A home left with nobody in it is deleted by the database (docs/03 §3.3). */
	leave: { homeId: string; contactId: string }[];
}

export interface HomeRepository {
	/** The home, when `contactId` lives in it and the viewer may see `contactId`. */
	findForMemberVisibleTo(viewer: Viewer, homeId: string, contactId: string): Promise<HomeState | null>;
	/** Every address the given people have, own fields and homes; the caller checked they are seen. */
	addressesOf(contactIds: readonly string[]): Promise<HeldAddress[]>;
	apply(change: HomeChange): Promise<void>;
}

export interface HomeReads {
	/** The homes someone the viewer may see lives in, oldest first. */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<HomeOf[]>;
}

export interface HomeDeps {
	homes: HomeRepository;
	contacts: ContactLookup;
	ids: IdGenerator;
	clock: Clock;
}

/** The home or the address being shared is not (any longer) one this person has. */
export class HomeGoneError extends TranslatableError {
	constructor() {
		super(phrase('errors.home.notFound'), 'HomeGoneError');
	}
}

const emptyChange = (): HomeChange => ({
	create: null,
	update: null,
	dropFields: [],
	addFields: [],
	join: [],
	leave: []
});

const orNull = (value: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

async function requireVisible(deps: HomeDeps, viewer: Viewer, contactIds: readonly string[]) {
	for (const id of contactIds) {
		if (!(await deps.contacts.findByIdVisibleTo(viewer, id))) throw new ContactGoneError();
	}
}

/** The address being shared: one of the person's own fields, or a home they already live in. */
export type SharedAddress = { field: string } | { home: string };

export interface ShareInput {
	contactId: string;
	address: SharedAddress;
	/** Who moves in with them. */
	withIds: readonly string[];
	/**
	 * Unset on the first try: then a different address someone picked already has is asked
	 * about rather than kept or replaced. Set, it is the ids (fields and homes) to replace;
	 * every other different address stays theirs.
	 */
	replace: readonly string[] | null;
}

/** A different address someone picked already has, for the editor to ask about. */
export interface AddressToDecide {
	contactId: string;
	id: string;
	value: string;
}

export type ShareOutcome =
	| { status: 'shared'; homeId: string; joined: number }
	| { status: 'decide'; addresses: AddressToDecide[] };

/**
 * Share someone's address with the people picked. A same line someone already has — after
 * folding — gives way silently; a different one is asked about first, and then kept unless it
 * was ticked to be replaced. An own field shared becomes a home and leaves their fields.
 */
export async function shareAddress(
	deps: HomeDeps,
	viewer: Viewer,
	input: ShareInput
): Promise<ShareOutcome> {
	await requireVisible(deps, viewer, [input.contactId]);
	const joining = [...new Set(input.withIds)].filter((id) => id !== input.contactId);
	await requireVisible(deps, viewer, joining);

	const now = deps.clock.now();
	const change = emptyChange();
	let home: { id: string; value: string; memberIds: Set<string> };

	if ('home' in input.address) {
		const found = await deps.homes.findForMemberVisibleTo(viewer, input.address.home, input.contactId);
		if (!found) throw new HomeGoneError();
		home = { id: found.id, value: found.value, memberIds: new Set(found.members.map((m) => m.contactId)) };
	} else {
		const fieldId = input.address.field;
		const [own] = (await deps.homes.addressesOf([input.contactId])).filter(
			(a) => a.source === 'field' && a.id === fieldId
		);
		if (!own) throw new HomeGoneError();
		const id = deps.ids.next();
		change.create = {
			id,
			householdId: viewer.householdId,
			label: own.label,
			value: own.value,
			meta: own.meta,
			createdBy: viewer.id,
			createdAt: now,
			updatedAt: now
		};
		change.dropFields.push({ contactId: input.contactId, fieldId });
		change.join.push({ homeId: id, contactId: input.contactId, createdBy: viewer.id, createdAt: now });
		home = { id, value: own.value, memberIds: new Set([input.contactId]) };
	}

	const newcomers = joining.filter((id) => !home.memberIds.has(id));
	const theirs = (await deps.homes.addressesOf(newcomers)).filter(
		(a) => !(a.source === 'home' && a.id === home.id)
	);
	const different = theirs.filter((a) => !isSameAddress(a.value, home.value));
	if (input.replace === null && different.length > 0) {
		return {
			status: 'decide',
			addresses: different.map(({ contactId, id, value }) => ({ contactId, id, value }))
		};
	}

	const replace = new Set(input.replace ?? []);
	for (const address of theirs) {
		if (!isSameAddress(address.value, home.value) && !replace.has(address.id)) continue;
		if (address.source === 'field') {
			change.dropFields.push({ contactId: address.contactId, fieldId: address.id });
		} else {
			change.leave.push({ homeId: address.id, contactId: address.contactId });
		}
	}
	for (const contactId of newcomers) {
		change.join.push({ homeId: home.id, contactId, createdBy: viewer.id, createdAt: now });
	}

	await deps.homes.apply(change);
	return { status: 'shared', homeId: home.id, joined: newcomers.length };
}

export interface ChangeLineInput {
	contactId: string;
	homeId: string;
	label: string | null;
	value: string;
	/** *For everyone here* rewrites the home; *Only for* moves this person out with the new line. */
	scope: 'everyone' | 'only';
}

/**
 * Rewrite a home's address. For everyone, the members the viewer may not see are split off
 * first and keep the old line as their own — their records change only by their owner
 * (docs/03 §3.7). Only for this person moves them out with the new line as their own, unless
 * nobody else lives there. Answers how many people's address changed, for the toast.
 */
export async function changeHomeLine(
	deps: HomeDeps,
	viewer: Viewer,
	input: ChangeLineInput
): Promise<{ changedFor: number }> {
	const value = input.value.trim();
	if (value.length === 0) throw new Error('An address needs a line.');
	await requireVisible(deps, viewer, [input.contactId]);
	const home = await deps.homes.findForMemberVisibleTo(viewer, input.homeId, input.contactId);
	if (!home) throw new HomeGoneError();

	const now = deps.clock.now();
	const label = orNull(input.label);
	const change = emptyChange();
	const someoneElse = home.members.some((m) => m.contactId !== input.contactId);

	if (input.scope === 'only' && someoneElse) {
		change.leave.push({ homeId: home.id, contactId: input.contactId });
		change.addFields.push(ownField(deps, input.contactId, label, value, home.meta, now));
		await deps.homes.apply(change);
		return { changedFor: 1 };
	}

	const unseen = home.members.filter((m) => !m.visible);
	for (const { contactId } of unseen) {
		change.leave.push({ homeId: home.id, contactId });
		change.addFields.push(ownField(deps, contactId, home.label, home.value, home.meta, now));
	}
	change.update = { id: home.id, label, value, updatedAt: now };
	await deps.homes.apply(change);
	return { changedFor: home.members.length - unseen.length };
}

function ownField(
	deps: HomeDeps,
	contactId: string,
	label: string | null,
	value: string,
	meta: string | null,
	now: number
): NewContactField {
	return {
		id: deps.ids.next(),
		contactId,
		kind: 'address',
		label,
		value,
		meta,
		sortOrder: 0,
		createdAt: now,
		updatedAt: now
	};
}

/**
 * Someone moved out: they leave the home, everyone else stays. A home they were the last to
 * leave goes with them. Leaving a home they are no longer in is not an error, so a second tap
 * — or another member's — changes nothing.
 */
export async function leaveHome(
	deps: HomeDeps,
	viewer: Viewer,
	input: { contactId: string; homeId: string }
): Promise<void> {
	await requireVisible(deps, viewer, [input.contactId]);
	const change = emptyChange();
	change.leave.push({ homeId: input.homeId, contactId: input.contactId });
	await deps.homes.apply(change);
}

/** The homes someone lives in, as the viewer may see them. */
export async function listHomesOf(
	deps: { homeReads: HomeReads },
	viewer: Viewer,
	contactId: string
): Promise<HomeOf[]> {
	return deps.homeReads.listForContactVisibleTo(viewer, contactId);
}
