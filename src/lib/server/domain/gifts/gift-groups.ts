import { todayFor } from '../../../dates/today';
import {
	GIFT_GROUP_MAX_RECIPIENTS,
	planGiftGroup,
	type GroupRecipient,
	type RecipientProblem
} from '../../../gifts/group-plan';
import { phrase } from '../../../i18n/phrase';
import { birthOf } from '../../../when/resolve';
import type { When } from '../../../when/when';
import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { ContactLookup } from '../contacts/contacts';
import {
	InvalidGiftError,
	orNull,
	titleOf,
	urlOf,
	viewerOf,
	type Gift,
	type GiftActor,
	type GiftRepository
} from './gifts';

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

/** Port the domain owns; the Drizzle adapter implements it with visibility-scoped reads. */
export interface GiftGroupRepository {
	/** Store a group and its gifts together, or neither. */
	insert(group: GiftGroup, gifts: readonly Gift[]): Promise<void>;
	/** The group with the gifts of it the viewer may see; null when they see none of them. */
	findVisibleTo(
		viewer: Viewer,
		groupId: string
	): Promise<{ group: GiftGroup; gifts: Gift[] } | null>;
}

export interface GiftGroupDeps {
	groups: GiftGroupRepository;
	gifts: Pick<GiftRepository, 'memberWhoseOwnPerson'>;
	contacts: ContactLookup;
	ids: IdGenerator;
	clock: Clock;
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
	/** Who it is for, each maybe with a when of their own instead of the shared one. */
	recipients: readonly { contactId: string; when?: When | null }[];
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

	const skipped: SkippedRecipient[] = [];
	const seen: GroupRecipient[] = [];
	for (const recipient of input.recipients) {
		const contact = await deps.contacts.findByIdVisibleTo(viewerOf(author), recipient.contactId);
		if (contact) seen.push({ ...recipient, birth: birthOf(contact) });
		else if (!skipped.some((s) => s.contactId === recipient.contactId))
			skipped.push({ contactId: recipient.contactId, problem: 'gone' });
	}
	const plans = planGiftGroup(input.when, seen, todayFor(deps.clock));
	const fitting = plans.flatMap((plan) => (plan.ok ? [plan] : []));
	const unfit = plans.flatMap((p) =>
		p.ok ? [] : [{ contactId: p.contactId, problem: p.problem }]
	);
	if (fitting.length === 0) throw new InvalidGiftError(phrase('errors.giftGroup.nobody'));

	const hidden = input.visibility === 'shared' && (input.hiddenFromRecipients ?? false);
	if (hidden) {
		for (const { contactId } of fitting) {
			const member = await deps.gifts.memberWhoseOwnPerson(author.householdId, contactId);
			if (member === author.userId) throw new InvalidGiftError(phrase('errors.gift.ownSurprise'));
		}
	}

	const now = deps.clock.now();
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
	const gifts: Gift[] = fitting.map((plan) => ({
		id: deps.ids.next(),
		contactId: plan.contactId,
		createdBy: author.userId,
		visibility: group.visibility,
		hiddenFromRecipient: hidden,
		state: 'idea',
		title,
		note: group.note,
		url,
		givenOn: null,
		// The occasion belongs to the day; each is asked for it when given, the group's offered.
		occasion: null,
		when: plan.when,
		whenCheckedOn: null,
		groupId: group.id,
		createdAt: now,
		updatedAt: now
	}));
	await deps.groups.insert(group, gifts);
	const named = input.recipients.map((r) => r.contactId);
	const left = [...unfit, ...skipped].sort(
		(a, b) => named.indexOf(a.contactId) - named.indexOf(b.contactId)
	);
	return { groupId: group.id, giftIds: gifts.map((g) => g.id), skipped: left };
}
