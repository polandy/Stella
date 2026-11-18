import { TranslatableError } from '../../../i18n/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import { FULL_DATE_SHAPE, isRealCalendarDay } from '../../../dates/calendar';
import { giftLink, hasGiftDay, type GiftState } from '../../../gifts/gifts';
import type { PartialDate } from '../../../dates/partial-date';
import { todayFor } from '../../../dates/today';
import { ideaState, ideaWaits as waitsOn } from '../../../gifts/idea-when';
import type { WhenState } from '../../../when/state';
import { birthOf, checkWhen, whenDay } from '../../../when/resolve';
import { sameWhen, type When } from '../../../when/when';
import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { ContactLookup } from '../contacts/contacts';
import { ContactGoneError } from '../contacts/require-visible';

/*
 * Gift use-cases (docs/dev/02 §2.25). A gift belongs to the one person it is for: an idea, a
 * gift the household gave, or one it received. An idea and the gift it became are the same
 * record — *Mark as given* only adds the day and the occasion.
 *
 * A gift is a child record of its person, so visibility follows the central rule (docs/dev/03
 * §3.7): shared with the household unless its author made it private. Whoever may see a gift
 * may change it, mark it given or remove it — a present is the household's, and the member who
 * buys the teapot is rarely the one who noted it. Only its author may make it private, so
 * nobody can hide a gift from the one who wrote it down. Every read goes through the adapter's
 * scoped queries.
 */

export type { GiftState };

/** A gift as stored and as read back. */
export interface Gift {
	id: string;
	/** The person it is for. */
	contactId: string;
	/** Who noted it; shown as *noted by*. Not who gave it — that is usually several people. */
	createdBy: string;
	visibility: Visibility;
	/** A shared gift kept from the member whose own person it is for (§2.25.10); never a private one. */
	hiddenFromRecipient: boolean;
	state: GiftState;
	title: string;
	note: string | null;
	/** A web address only (`giftLink`). */
	url: string | null;
	/** ISO `YYYY-MM-DD`; null while an idea or bought, the day for a given or received gift. */
	givenOn: string | null;
	/** A preset key (`GIFT_OCCASION_PRESETS`) or free text. */
	occasion: string | null;
	/** When an idea is meant for (docs/dev/02 §2.25.8); null for *now*, and for any given gift. */
	when: When | null;
	/** The day somebody last answered whether the idea still stands (§2.25.8); null if never. */
	whenCheckedOn: string | null;
	/** The idea it was noted with for several people (§2.25.11); null for one noted alone. */
	groupId: string | null;
	createdAt: number;
	updatedAt: number;
}

/** A given or received gift: one with a day, as the story shows it. */
export type DatedGift = Gift & { state: 'given' | 'received'; givenOn: string };

/** An open idea with the person it is for, as the household's list shows it (docs/dev/02 §2.25.6). */
export type OpenIdea = Gift & { contactName: string; avatarPhotoId: string | null };

/** An open idea read with its person's birth date, so whether it still waits can be told. */
export type IdeaWithBirth<T extends Pick<Gift, 'when'>> = T & { birth: PartialDate | null };

/** Where a page of the story's gifts resumes: strictly older than this. */
export interface GiftStoryCursor {
	givenOn: string;
	createdAt: number;
}

/** Port the domain owns; the Drizzle adapter implements it with visibility-scoped reads. */
export interface GiftRepository {
	insert(gift: Gift): Promise<void>;
	/** The gift on `contactId` the viewer may see, or null. */
	findVisibleTo(viewer: Viewer, contactId: string, giftId: string): Promise<Gift | null>;
	/** Store a gift's new state; the caller found it through `findVisibleTo`. */
	update(gift: Gift): Promise<void>;
	/** Remove a gift; the caller found it through `findVisibleTo`. */
	remove(giftId: string): Promise<void>;
	/**
	 * Every gift on a person the viewer may see: ideas newest first, then given and received
	 * newest day first.
	 */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<Gift[]>;
	/**
	 * When each open idea the viewer may see on `contactIds` is meant for, with its person's
	 * birth date — what Home's *Coming up* hint counts (docs/dev/02 §2.13.3).
	 */
	listOpenIdeaWhensVisibleTo(
		viewer: Viewer,
		contactIds: readonly string[]
	): Promise<IdeaWithBirth<Pick<Gift, 'contactId' | 'when' | 'whenCheckedOn' | 'createdAt'>>[]>;
	/**
	 * Every open idea the viewer may see, newest noted first, on the people the household still
	 * browses — an archived person's ideas stay on their page only (docs/dev/02 §2.25.6).
	 */
	listOpenIdeasVisibleTo(viewer: Viewer): Promise<IdeaWithBirth<OpenIdea>[]>;
	/**
	 * One keyset page of the person's given and received gifts, newest day first, then latest
	 * noted — the story's order (docs/dev/02 §2.23). Ideas are never in it.
	 */
	listStoryPageForContactVisibleTo(
		viewer: Viewer,
		contactId: string,
		opts: { limit: number; before?: GiftStoryCursor }
	): Promise<DatedGift[]>;
	/** The bought gifts the viewer may see on `contactIds`, oldest bought first (§2.25.9). */
	listBoughtVisibleTo(
		viewer: Viewer,
		contactIds: readonly string[]
	): Promise<Pick<Gift, 'id' | 'contactId' | 'title'>[]>;
	/** The current member whose own person `contactId` is, in the household, or null. */
	memberWhoseOwnPerson(householdId: string, contactId: string): Promise<string | null>;
	/** Every current member of the household who has an own person, with that person. */
	membersOwnPeople(householdId: string): Promise<{ memberId: string; contactId: string }[]>;
}

/** Collaborators the use-cases need, injected by the composition root. */
export interface GiftDeps {
	gifts: GiftRepository;
	contacts: ContactLookup;
	ids: IdGenerator;
	clock: Clock;
}

/** The member doing it. */
export interface GiftActor {
	userId: string;
	householdId: string;
}

/** What a gift says, as a form or a command hands it over. */
export interface GiftContent {
	title: string;
	note: string | null;
	url: string | null;
	givenOn: string | null;
	occasion: string | null;
	visibility: Visibility;
	/** Kept from the person it is for (§2.25.10); absent on an older command — no, or as it was. */
	hiddenFromRecipient?: boolean;
	/** An idea's when; absent on a command from before whens — *now*, or as it was on an edit. */
	when?: When | null;
}

export interface AddGiftInput extends GiftContent {
	contactId: string;
	state: Exclude<GiftState, 'bought'>;
}

export interface EditGiftInput extends GiftContent {
	contactId: string;
	giftId: string;
}

export interface MarkGiftGivenInput {
	contactId: string;
	giftId: string;
	givenOn: string;
	occasion: string | null;
}

export interface AnswerIdeaWhenInput {
	contactId: string;
	giftId: string;
	when: When | null;
}

export interface RemoveGiftInput {
	contactId: string;
	giftId: string;
}

/** A gift that cannot be stored as asked: no title, no real day, a link that is not one. */
export class InvalidGiftError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'InvalidGiftError');
	}
}

/** The gift is not one the member can see (any more): removed, or made private by its author. */
export class GiftGoneError extends TranslatableError {
	constructor() {
		super(phrase('errors.gift.gone'), 'GiftGoneError');
	}
}

/** Text as stored: trimmed, null when empty. */
export const orNull = (value: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** A gift's title, required. */
export function titleOf(raw: string): string {
	const title = raw.trim();
	if (title.length === 0) throw new InvalidGiftError(phrase('errors.gift.needTitle'));
	return title;
}

/** A gift's link, a web address or none. */
export function urlOf(raw: string | null): string | null {
	const link = giftLink(raw ?? '');
	if (!link.ok) throw new InvalidGiftError(phrase('errors.gift.badLink'));
	return link.url;
}

/** The day a given or received gift needs; an idea or a bought one has none. */
function dayOf(state: GiftState, raw: string | null): string | null {
	if (!hasGiftDay(state)) return null;
	const day = (raw ?? '').trim();
	if (!FULL_DATE_SHAPE.test(day)) throw new InvalidGiftError(phrase('errors.gift.needDay'));
	if (!isRealCalendarDay(day)) throw new InvalidGiftError(phrase('errors.gift.noSuchDay', { day }));
	return day;
}

/** The when an idea for someone born so may keep, checked against the household's day. */
function whenOf(when: When | null, birth: PartialDate | null, today: string): When | null {
	const check = checkWhen(when, birth, today);
	if (!check.ok) throw new InvalidGiftError(phrase(`errors.when.${check.problem}`));
	return check.when;
}

/** The birth date of the person a gift is for, who the author must be able to see. */
async function birthOfVisible(
	deps: Pick<GiftDeps, 'contacts'>,
	actor: GiftActor,
	contactId: string
): Promise<PartialDate | null> {
	const contact = await deps.contacts.findByIdVisibleTo(viewerOf(actor), contactId);
	if (!contact) throw new ContactGoneError();
	return birthOf(contact);
}

/** What a gift says once its content is checked, for its state. */
function checkedContent(state: GiftState, content: GiftContent) {
	return {
		title: titleOf(content.title),
		note: orNull(content.note),
		url: urlOf(content.url),
		givenOn: dayOf(state, content.givenOn),
		// The occasion belongs to the day; an idea is asked for it when it is given.
		occasion: hasGiftDay(state) ? orNull(content.occasion) : null
	};
}

/**
 * Whether a gift is kept from the person it is for: only a shared one can be, and never by the
 * member whose own person that is — nobody keeps a surprise from themselves.
 */
async function hiddenOf(
	deps: Pick<GiftDeps, 'gifts'>,
	author: GiftActor,
	contactId: string,
	visibility: Visibility,
	asked: boolean
): Promise<boolean> {
	if (!asked || visibility !== 'shared') return false;
	const member = await deps.gifts.memberWhoseOwnPerson(author.householdId, contactId);
	if (member === author.userId) throw new InvalidGiftError(phrase('errors.gift.ownSurprise'));
	return true;
}

export const viewerOf = (actor: GiftActor): Viewer => ({
	id: actor.userId,
	householdId: actor.householdId
});

export async function requireVisibleGift(
	deps: Pick<GiftDeps, 'gifts'>,
	actor: GiftActor,
	contactId: string,
	giftId: string
): Promise<Gift> {
	const gift = await deps.gifts.findVisibleTo(viewerOf(actor), contactId, giftId);
	if (!gift) throw new GiftGoneError();
	return gift;
}

/** Note a gift for a person the author can see: an idea, or one given or received. */
export async function addGift(
	deps: GiftDeps,
	author: GiftActor,
	input: AddGiftInput
): Promise<{ giftId: string }> {
	const birth = await birthOfVisible(deps, author, input.contactId);
	const content = checkedContent(input.state, input);
	const now = deps.clock.now();
	// Only an idea waits; what was given or received happened.
	const when =
		input.state === 'idea' ? whenOf(input.when ?? null, birth, todayFor(deps.clock)) : null;
	const giftId = deps.ids.next();
	await deps.gifts.insert({
		id: giftId,
		contactId: input.contactId,
		createdBy: author.userId,
		visibility: input.visibility,
		hiddenFromRecipient: await hiddenOf(
			deps,
			author,
			input.contactId,
			input.visibility,
			input.hiddenFromRecipient ?? false
		),
		state: input.state,
		...content,
		when,
		whenCheckedOn: null,
		groupId: null,
		createdAt: now,
		updatedAt: now
	});
	return { giftId };
}

/** Rewrite what a gift says. Its state stays; only its author may change who sees it. */
export async function editGift(
	deps: GiftDeps,
	editor: GiftActor,
	input: EditGiftInput
): Promise<{ giftId: string }> {
	const gift = await requireVisibleGift(deps, editor, input.contactId, input.giftId);
	// A when left as it was stays, even once its day is over; a new one must still be ahead.
	const asked = input.when === undefined ? gift.when : input.when;
	const today = todayFor(deps.clock);
	const kept = gift.state !== 'idea' || sameWhen(asked, gift.when);
	const mine = gift.createdBy === editor.userId;
	const visibility = mine ? input.visibility : gift.visibility;
	const asksHidden = mine
		? (input.hiddenFromRecipient ?? gift.hiddenFromRecipient)
		: gift.hiddenFromRecipient;
	// Only a surprise asked for anew is checked; one already kept stays as it is.
	const hidden =
		asksHidden && gift.hiddenFromRecipient
			? visibility === 'shared'
			: await hiddenOf(deps, editor, gift.contactId, visibility, asksHidden);
	const when = kept
		? gift.when
		: whenOf(asked, await birthOfVisible(deps, editor, gift.contactId), today);
	await deps.gifts.update({
		...gift,
		...checkedContent(gift.state, input),
		when,
		// A when chosen anew is an answer too: *later* is not asked about again straight away.
		whenCheckedOn: kept ? gift.whenCheckedOn : today,
		visibility,
		hiddenFromRecipient: hidden,
		updatedAt: deps.clock.now()
	});
	return { giftId: gift.id };
}

/** An idea given, or a bought one handed over (§2.25, §2.25.9): the same record, now with its day. */
export async function markGiftGiven(
	deps: GiftDeps,
	actor: GiftActor,
	input: MarkGiftGivenInput
): Promise<{ giftId: string }> {
	const gift = await requireVisibleGift(deps, actor, input.contactId, input.giftId);
	if (hasGiftDay(gift.state)) throw new InvalidGiftError(phrase('errors.gift.alreadyGiven'));
	await deps.gifts.update({
		...gift,
		state: 'given',
		givenOn: dayOf('given', input.givenOn),
		occasion: orNull(input.occasion),
		when: null,
		whenCheckedOn: null,
		updatedAt: deps.clock.now()
	});
	return { giftId: gift.id };
}

/**
 * *Still current?* answered for an idea whose day went by, or a *later* one at its yearly look
 * (docs/dev/02 §2.25.8): kept as a plain idea (`when` null), or given a new when, checked
 * against today like any other. Removing it is `removeGift`.
 */
export async function answerIdeaWhen(
	deps: GiftDeps,
	actor: GiftActor,
	input: AnswerIdeaWhenInput
): Promise<{ giftId: string }> {
	const gift = await requireVisibleGift(deps, actor, input.contactId, input.giftId);
	if (gift.state !== 'idea') throw new InvalidGiftError(phrase('errors.gift.alreadyGiven'));
	const today = todayFor(deps.clock);
	const when =
		input.when === null
			? null
			: whenOf(input.when, await birthOfVisible(deps, actor, gift.contactId), today);
	await deps.gifts.update({ ...gift, when, whenCheckedOn: today, updatedAt: deps.clock.now() });
	return { giftId: gift.id };
}

/** Remove a gift the member can see. */
export async function removeGift(
	deps: GiftDeps,
	actor: GiftActor,
	input: RemoveGiftInput
): Promise<{ giftId: string }> {
	const gift = await requireVisibleGift(deps, actor, input.contactId, input.giftId);
	await deps.gifts.remove(gift.id);
	return { giftId: gift.id };
}

/** The gifts on a person the viewer may see. */
export async function listGiftsForContact(
	deps: Pick<GiftDeps, 'gifts'>,
	viewer: Viewer,
	contactId: string
): Promise<Gift[]> {
	return deps.gifts.listForContactVisibleTo(viewer, contactId);
}

/** Whether an open idea still waits for its time, so only its person's card shows it (§2.25.8). */
export function ideaWaits(
	idea: Pick<Gift, 'state' | 'when' | 'whenCheckedOn' | 'createdAt'>,
	birth: PartialDate | null,
	today: string
): boolean {
	return idea.state === 'idea' && waitsOn(idea, birth, today);
}

/**
 * The open ideas the viewer may see on each of these people, less those still waiting; one with
 * none is left out.
 */
export async function countOpenIdeas(
	deps: Pick<GiftDeps, 'gifts' | 'clock'>,
	viewer: Viewer,
	contactIds: readonly string[]
): Promise<Map<string, number>> {
	const today = todayFor(deps.clock);
	const counts = new Map<string, number>();
	for (const idea of await deps.gifts.listOpenIdeaWhensVisibleTo(viewer, [
		...new Set(contactIds)
	])) {
		if (waitsOn(idea, idea.birth, today)) continue;
		counts.set(idea.contactId, (counts.get(idea.contactId) ?? 0) + 1);
	}
	return counts;
}

/**
 * Every open idea the viewer may see, with whom it is for — the household's list (§2.25.6); each
 * says where it stands against its when, so the list can keep the waiting ones folded away.
 */
export async function listOpenIdeas(
	deps: Pick<GiftDeps, 'gifts' | 'clock'>,
	viewer: Viewer
): Promise<(OpenIdea & { whenState: WhenState | null })[]> {
	const today = todayFor(deps.clock);
	const ideas = await deps.gifts.listOpenIdeasVisibleTo(viewer);
	const listed = ideas.map(({ birth, ...idea }) => ({
		idea: { ...idea, whenState: ideaState(idea, birth, today) },
		// '~' sorts after every ISO day by code point, so *later* comes last.
		due: idea.when ? (whenDay(idea.when, birth)?.on ?? '~') : '~'
	}));
	const waits = (entry: (typeof listed)[number]) => entry.idea.whenState?.kind === 'waiting';
	// The waiting ones soonest first, after the rest, as on the Gifts card (§2.25.8).
	const waiting = listed.filter(waits).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
	return [...listed.filter((entry) => !waits(entry)), ...waiting].map((entry) => entry.idea);
}
