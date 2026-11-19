import { todayFor } from '../../../dates/today';
import { GIFT_GROUP_MAX_RECIPIENTS } from '../../../gifts/group-plan';
import { hasGiftDay } from '../../../gifts/gifts';
import { phrase } from '../../../i18n/phrase';
import { checkWhen } from '../../../when/resolve';
import { sameWhen, type When } from '../../../when/when';
import type { Viewer } from '../../access/visibility';
import {
	groupIdeaFor,
	keepEstimates,
	planRecipients,
	refuseOwnSurprise,
	type GiftGroupDeps,
	type GroupGift,
	type GroupRecipientInput,
	type SkippedRecipient,
	type VisibleGiftGroup
} from './gift-groups';
import { orNull, viewerOf } from '../shared/idea-on-person';
import {
	GiftGoneError,
	InvalidGiftError,
	titleOf,
	urlOf,
	type Gift,
	type GiftActor
} from './gifts';

// Following a group up (docs/dev/02 §2.25.11): who has it, who is still to get it, and the rest.

export interface GiftGroupRef {
	groupId: string;
}

export interface GroupGiftRef extends GiftGroupRef {
	giftId: string;
}

export interface AddToGiftGroupInput extends GiftGroupRef {
	recipients: readonly GroupRecipientInput[];
}

export interface EditGiftGroupInput extends GiftGroupRef {
	/** Only this person's gift; absent: the group and every gift of it still open. */
	giftId?: string;
	title: string;
	note: string | null;
	url: string | null;
	/** Absent: the when stays as it is. */
	when?: When | null;
}

const isOpen = (gift: Gift) => !hasGiftDay(gift.state);

async function requireGroup(
	deps: Pick<GiftGroupDeps, 'groups'>,
	actor: GiftActor,
	groupId: string
): Promise<VisibleGiftGroup> {
	const found = await deps.groups.findVisibleTo(viewerOf(actor), groupId);
	if (!found) throw new GiftGoneError();
	return found;
}

function requireMember(found: VisibleGiftGroup, giftId: string): GroupGift {
	const gift = found.gifts.find((g) => g.id === giftId);
	if (!gift) throw new GiftGoneError();
	return gift;
}

/** Strip what the panel adds before a gift is stored again. */
function stored({ contactName: _name, birth: _birth, ...gift }: GroupGift): Gift {
	return gift;
}

/** The groups on this person's card, each with everyone in it the viewer may see. */
export function readGiftGroupsOf(
	deps: Pick<GiftGroupDeps, 'groups'>,
	viewer: Viewer,
	contactId: string
): Promise<VisibleGiftGroup[]> {
	return deps.groups.listForContactVisibleTo(viewer, contactId);
}

/** These groups as the viewer sees them, for `/gifts`' *also for* lines. */
export function readGiftGroups(
	deps: Pick<GiftGroupDeps, 'groups'>,
	viewer: Viewer,
	groupIds: readonly string[]
): Promise<VisibleGiftGroup[]> {
	return deps.groups.listVisibleTo(viewer, groupIds);
}

/** Add people to a group: each gets its idea at the group's when, worked out for them (F11). */
export async function addToGiftGroup(
	deps: GiftGroupDeps,
	author: GiftActor,
	input: AddToGiftGroupInput
): Promise<{ groupId: string; giftIds: string[]; skipped: SkippedRecipient[] }> {
	const found = await requireGroup(deps, author, input.groupId);
	if (input.recipients.length === 0 || input.recipients.length > GIFT_GROUP_MAX_RECIPIENTS)
		throw new InvalidGiftError(phrase('errors.giftGroup.recipients'));
	// Someone who still has it open needs no second one.
	const holding = new Set(found.gifts.filter(isOpen).map((g) => g.contactId));
	const asked = input.recipients.filter((r) => !holding.has(r.contactId));
	if (asked.length === 0) return { groupId: found.group.id, giftIds: [], skipped: [] };

	const planned = await planRecipients(deps, author, found.group.when, asked);
	if (planned.fitting.length === 0) throw new InvalidGiftError(phrase('errors.giftGroup.nobody'));
	if (found.group.hiddenFromRecipients) await refuseOwnSurprise(deps, author, planned.fitting);
	const now = deps.clock.now();
	const gifts = planned.fitting.map((plan) => groupIdeaFor(deps, author, found.group, plan, now));
	await deps.groups.write({ insert: gifts });
	await keepEstimates(deps, author, planned, now);
	return { groupId: found.group.id, giftIds: gifts.map((g) => g.id), skipped: planned.skipped };
}

/**
 * Change what a group says. For one person, only their open gift, and a when that does not fit
 * them is refused. For everyone, the group and each open gift; each idea is timed anew, and one
 * the new when no longer fits keeps its own and is named in `kept` (D6).
 */
export async function editGiftGroup(
	deps: GiftGroupDeps,
	editor: GiftActor,
	input: EditGiftGroupInput
): Promise<{ groupId: string; giftIds: string[]; kept: string[] }> {
	const found = await requireGroup(deps, editor, input.groupId);
	const content = { title: titleOf(input.title), note: orNull(input.note), url: urlOf(input.url) };
	const today = todayFor(deps.clock);
	const now = deps.clock.now();

	if (input.giftId !== undefined) {
		const gift = requireMember(found, input.giftId);
		if (!isOpen(gift)) throw new InvalidGiftError(phrase('errors.gift.alreadyGiven'));
		const asked = input.when === undefined ? gift.when : input.when;
		const keep = gift.state !== 'idea' || sameWhen(asked, gift.when);
		const check = keep ? null : checkWhen(asked, gift.birth, today);
		if (check && !check.ok) throw new InvalidGiftError(phrase(`errors.when.${check.problem}`));
		const updated: Gift = {
			...stored(gift),
			...content,
			when: check ? check.when : gift.when,
			whenCheckedOn: check ? today : gift.whenCheckedOn,
			updatedAt: now
		};
		await deps.groups.write({ update: [updated] });
		return { groupId: found.group.id, giftIds: [gift.id], kept: [] };
	}

	const when = input.when === undefined ? found.group.when : input.when;
	const retime = !sameWhen(when, found.group.when);
	const kept: string[] = [];
	const update = found.gifts.filter(isOpen).map((gift): Gift => {
		const base = { ...stored(gift), ...content, updatedAt: now };
		// A bought gift keeps the time it was bought for.
		if (!retime || gift.state !== 'idea') return base;
		const check = checkWhen(when, gift.birth, today);
		if (!check.ok) {
			kept.push(gift.contactId);
			return base;
		}
		return { ...base, when: check.when, whenCheckedOn: today };
	});
	await deps.groups.write({
		group: { ...found.group, ...content, when, updatedAt: now },
		update
	});
	return { groupId: found.group.id, giftIds: update.map((g) => g.id), kept };
}

/** Every idea of the group bought at once (§2.25.9); a bought or given one stays as it is. */
export async function markGiftGroupBought(
	deps: Pick<GiftGroupDeps, 'groups' | 'clock'>,
	actor: GiftActor,
	input: GiftGroupRef
): Promise<{ groupId: string; giftIds: string[] }> {
	const found = await requireGroup(deps, actor, input.groupId);
	const now = deps.clock.now();
	const update = found.gifts
		.filter((g) => g.state === 'idea')
		.map((g): Gift => ({ ...stored(g), state: 'bought', updatedAt: now }));
	await deps.groups.write({ update });
	return { groupId: found.group.id, giftIds: update.map((g) => g.id) };
}

/** Remove every gift of the group still open; the given ones stay in it. */
export async function removeOpenOfGiftGroup(
	deps: Pick<GiftGroupDeps, 'groups'>,
	actor: GiftActor,
	input: GiftGroupRef
): Promise<{ groupId: string; giftIds: string[] }> {
	const found = await requireGroup(deps, actor, input.groupId);
	const remove = found.gifts.filter(isOpen).map((g) => g.id);
	await deps.groups.write({ remove });
	return { groupId: found.group.id, giftIds: remove };
}

/** Let every gift of the group go on alone; the group goes with them. */
export async function dissolveGiftGroup(
	deps: Pick<GiftGroupDeps, 'groups'>,
	actor: GiftActor,
	input: GiftGroupRef
): Promise<{ groupId: string; giftIds: string[] }> {
	const found = await requireGroup(deps, actor, input.groupId);
	const release = found.gifts.map((g) => g.id);
	await deps.groups.write({ release });
	return { groupId: found.group.id, giftIds: release };
}

/** Let one gift go on alone, out of the group. */
export async function detachFromGiftGroup(
	deps: Pick<GiftGroupDeps, 'groups'>,
	actor: GiftActor,
	input: GroupGiftRef
): Promise<{ groupId: string; giftId: string }> {
	const found = await requireGroup(deps, actor, input.groupId);
	const gift = requireMember(found, input.giftId);
	await deps.groups.write({ release: [gift.id] });
	return { groupId: found.group.id, giftId: gift.id };
}
