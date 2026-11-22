import { todayFor } from '../../../dates/today';
import {
	GIFT_GROUP_MAX_RECIPIENTS,
	planGiftGroup,
	type GroupRecipient,
	type RecipientProblem
} from '../../../gifts/group-plan';
import { phrase } from '../../../i18n/phrase';
import { birthOf } from '../../../when/resolve';
import type { PartialDate } from '../../../dates/partial-date';
import type { When } from '../../../when/when';
import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { checkBirthEstimate } from '../contacts/birth-year';
import type { ContactLookup } from '../contacts/contacts';
import { orNull, viewerOf, type OwnPersonReads } from '../shared/idea-on-person';
import { InvalidGiftError, NO_GIVER, titleOf, urlOf, type Gift, type GiftActor } from './gifts';

// One idea for several people (docs/dev/02 §2.25.11, ADR-134): a gift each, bound by a group.

/** What several people's ideas share, as noted. */
export interface GiftGroup {
	id: string;
	householdId: string;
	createdBy: string;
	title: string;
	note: string | null;
	url: string | null;
	/** The shared when as noted; each gift stores what it came to for its person. */
	when: When | null;
	/** The occasion offered when one of them is given. */
	occasion: string | null;
	/** Every gift of the group has it too. */
	visibility: Visibility;
	/** A surprise for each of them (§2.25.10); never on a private group. */
	hiddenFromRecipients: boolean;
	createdAt: number;
	updatedAt: number;
}

/** A gift of a group with the person it is for, as the group's panel lists it. */
export type GroupGift = Gift & { contactName: string; birth: PartialDate | null };

/** A group with the gifts of it a viewer may see, by name. */
export interface VisibleGiftGroup {
	group: GiftGroup;
	gifts: GroupGift[];
}

/** One change to a group, stored whole or not at all. */
export interface GroupWrite {
	group?: GiftGroup;
	insert?: readonly Gift[];
	update?: readonly Gift[];
	remove?: readonly string[];
	/** Gifts that go on alone; a group left without any gift goes with the last. */
	release?: readonly string[];
}

/** Port the domain owns; the Drizzle adapter implements it with visibility-scoped reads. */
export interface GiftGroupRepository {
	/** Store a group and its gifts together, or neither. */
	insert(group: GiftGroup, gifts: readonly Gift[]): Promise<void>;
	/** The group with the gifts of it the viewer may see; null when they see none of them. */
	findVisibleTo(viewer: Viewer, groupId: string): Promise<VisibleGiftGroup | null>;
	/** These groups, each with the gifts of it the viewer may see; one they see none of is left out. */
	listVisibleTo(viewer: Viewer, groupIds: readonly string[]): Promise<VisibleGiftGroup[]>;
	/** The groups with a gift the viewer may see on this person, each with all it shows them. */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<VisibleGiftGroup[]>;
	write(change: GroupWrite): Promise<void>;
}

/** Keeps a birth year, as the dates context's repository does; its own port, so no cycle. */
export interface BirthYearWriter {
	setBirthYear(
		viewer: Viewer,
		contactId: string,
		year: string | null,
		updatedAt: number
	): Promise<boolean>;
}

export interface GiftGroupDeps {
	groups: GiftGroupRepository;
	ownPeople: Pick<OwnPersonReads, 'memberWhoseOwnPerson'>;
	contacts: ContactLookup;
	/** Where an estimated birth year named while noting is kept (D5). */
	birthYears: BirthYearWriter;
	ids: IdGenerator;
	clock: Clock;
}

/** One person it is for. */
export interface GroupRecipientInput {
	contactId: string;
	/** A when of their own instead of the shared one; absent: the shared one. */
	when?: When | null;
	/** Their estimated birth year, for someone with no birth date at all: kept on them once noted. */
	birthYear?: string;
}

export interface AddGiftGroupInput {
	title: string;
	note: string | null;
	url: string | null;
	/** The shared when; null for *now*. */
	when: When | null;
	occasion: string | null;
	visibility: Visibility;
	/** Kept from each person it is for (§2.25.10). */
	hiddenFromRecipients?: boolean;
	/** Who it is for, in the order named. */
	recipients: readonly GroupRecipientInput[];
}

/** A person named who got no idea: why the when does not fit them, or `gone` — not to be seen. */
export interface SkippedRecipient {
	contactId: string;
	problem: RecipientProblem | 'gone';
}

/** Note one gift each; whoever the when does not fit is left out and named (F11). */
export async function addGiftGroup(
	deps: GiftGroupDeps,
	author: GiftActor,
	input: AddGiftGroupInput
): Promise<{ groupId: string; giftIds: string[]; skipped: SkippedRecipient[] }> {
	const title = titleOf(input.title);
	const url = urlOf(input.url);
	const count = input.recipients.length;
	if (count === 0 || count > GIFT_GROUP_MAX_RECIPIENTS)
		throw new InvalidGiftError(phrase('errors.giftGroup.recipients'));

	const now = deps.clock.now();
	const planned = await planRecipients(deps, author, input.when, input.recipients);
	if (planned.fitting.length === 0) throw new InvalidGiftError(phrase('errors.giftGroup.nobody'));
	const hidden = input.visibility === 'shared' && (input.hiddenFromRecipients ?? false);
	if (hidden) await refuseOwnSurprise(deps, author, planned.fitting);

	const group: GiftGroup = {
		id: deps.ids.next(),
		householdId: author.householdId,
		createdBy: author.userId,
		title,
		note: orNull(input.note),
		url,
		when: input.when,
		occasion: orNull(input.occasion),
		visibility: input.visibility,
		hiddenFromRecipients: hidden,
		createdAt: now,
		updatedAt: now
	};
	const gifts = planned.fitting.map((plan) => groupIdeaFor(deps, author, group, plan, now));
	await deps.groups.insert(group, gifts);
	await keepEstimates(deps, author, planned, now);
	return { groupId: group.id, giftIds: gifts.map((g) => g.id), skipped: planned.skipped };
}

/** Who a when fits, and who it leaves out, in the order named; estimates to keep on whom it fits. */
export interface PlannedRecipients {
	fitting: { contactId: string; when: When | null }[];
	skipped: SkippedRecipient[];
	estimates: Map<string, string>;
}

export async function planRecipients(
	deps: Pick<GiftGroupDeps, 'contacts' | 'clock'>,
	author: GiftActor,
	when: When | null,
	recipients: readonly GroupRecipientInput[]
): Promise<PlannedRecipients> {
	const now = deps.clock.now();
	const gone: SkippedRecipient[] = [];
	const seen: GroupRecipient[] = [];
	const estimates = new Map<string, string>();
	for (const { birthYear, ...recipient } of recipients) {
		if (birthYear !== undefined) checkBirthEstimate(birthYear, now);
		const contact = await deps.contacts.findByIdVisibleTo(viewerOf(author), recipient.contactId);
		// An estimate stands in only where nothing is on record, as `setBirthEstimate` keeps it.
		if (contact && birthYear !== undefined && contact.birthDate === null) {
			estimates.set(recipient.contactId, birthYear);
			seen.push({ ...recipient, birth: { value: birthYear, precision: 'age' } });
		} else if (contact) seen.push({ ...recipient, birth: birthOf(contact) });
		else if (!gone.some((s) => s.contactId === recipient.contactId))
			gone.push({ contactId: recipient.contactId, problem: 'gone' });
	}
	const plans = planGiftGroup(when, seen, todayFor(deps.clock));
	const fitting = plans.flatMap((p) => (p.ok ? [{ contactId: p.contactId, when: p.when }] : []));
	const unfit = plans.flatMap((p) =>
		p.ok ? [] : [{ contactId: p.contactId, problem: p.problem }]
	);
	const named = recipients.map((r) => r.contactId);
	const skipped = [...unfit, ...gone].sort(
		(a, b) => named.indexOf(a.contactId) - named.indexOf(b.contactId)
	);
	return { fitting, skipped, estimates };
}

/** Nobody keeps a surprise from themselves (§2.25.10). */
export async function refuseOwnSurprise(
	deps: Pick<GiftGroupDeps, 'ownPeople'>,
	author: GiftActor,
	fitting: readonly { contactId: string }[]
): Promise<void> {
	for (const { contactId } of fitting) {
		const member = await deps.ownPeople.memberWhoseOwnPerson(author.householdId, contactId);
		if (member === author.userId) throw new InvalidGiftError(phrase('errors.gift.ownSurprise'));
	}
}

/** One person's idea from what the group notes, at the when it came to for them. */
export function groupIdeaFor(
	deps: Pick<GiftGroupDeps, 'ids'>,
	author: GiftActor,
	group: GiftGroup,
	plan: { contactId: string; when: When | null },
	now: number
): Gift {
	return {
		id: deps.ids.next(),
		contactId: plan.contactId,
		createdBy: author.userId,
		visibility: group.visibility,
		hiddenFromRecipient: group.hiddenFromRecipients,
		state: 'idea',
		title: group.title,
		note: group.note,
		url: group.url,
		givenOn: null,
		// The occasion belongs to the day; each is asked for it when given, the group's offered.
		occasion: null,
		when: plan.when,
		whenCheckedOn: null,
		groupId: group.id,
		...NO_GIVER,
		storedAt: null,
		createdAt: now,
		updatedAt: now
	};
}

/** Keep each estimated birth year on the person whose idea was noted with it (D5). */
export async function keepEstimates(
	deps: Pick<GiftGroupDeps, 'birthYears'>,
	author: GiftActor,
	planned: PlannedRecipients,
	now: number
): Promise<void> {
	for (const { contactId } of planned.fitting) {
		const year = planned.estimates.get(contactId);
		if (year !== undefined)
			await deps.birthYears.setBirthYear(viewerOf(author), contactId, year, now);
	}
}
