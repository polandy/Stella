import { TranslatableError } from '../../../i18n/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import { giftLink } from '../../../gifts/gifts';
import type { PartialDate } from '../../../dates/partial-date';
import { todayFor } from '../../../dates/today';
import { birthOf, checkWhen } from '../../../when/resolve';
import { sameWhen, type When } from '../../../when/when';
import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { ContactLookup } from '../contacts/contacts';
import { ContactGoneError } from '../contacts/require-visible';

/*
 * Outing use-cases (docs/dev/02 §2.27). An outing idea belongs to the one person it is to be
 * done with: a line, maybe a note, a link and a when; *booked* once a date is fixed, then done.
 *
 * Visibility is a gift's (docs/dev/03 §3.7): shared unless its author made it private, and a
 * shared one may be kept from the member whose own person it is with — a surprise. Whoever may
 * see one may change it, book it, tick it or remove it; only its author changes who sees it.
 * Every read goes through the adapter's scoped queries.
 */

/** An outing idea as stored and as read back. */
export interface Plan {
	id: string;
	/** The person it is to be done with. */
	contactId: string;
	createdBy: string;
	visibility: Visibility;
	/** A shared idea kept from the member whose own person it is with; never a private one. */
	hiddenFromPerson: boolean;
	title: string;
	note: string | null;
	/** A web address only (`giftLink`). */
	url: string | null;
	/** When it is meant for; null for *some time*. */
	when: When | null;
	/** When somebody fixed it (epoch ms); null while only an idea. */
	bookedAt: number | null;
	bookedBy: string | null;
	/** When it was ticked off (epoch ms); null while open. */
	doneAt: number | null;
	/** The household's ISO day it was ticked; null while open. */
	doneOn: string | null;
	doneBy: string | null;
	/** The moment written about it (a later slice); null until then. */
	momentId: string | null;
	createdAt: number;
	updatedAt: number;
}

/** Port the domain owns; the Drizzle adapter implements it with visibility-scoped reads. */
export interface PlanRepository {
	insert(plan: Plan): Promise<void>;
	/** The idea on `contactId` the viewer may see, open or done, or null. */
	findVisibleTo(viewer: Viewer, contactId: string, planId: string): Promise<Plan | null>;
	/** Store an idea's new state; the caller found it through `findVisibleTo`. */
	update(plan: Plan): Promise<void>;
	/** Remove an idea; the caller found it through `findVisibleTo`. */
	remove(planId: string): Promise<void>;
	/** Every idea on a person the viewer may see, open and done, newest noted first. */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<Plan[]>;
	/** The current member whose own person `contactId` is, in the household, or null. */
	memberWhoseOwnPerson(householdId: string, contactId: string): Promise<string | null>;
}

/** Collaborators the use-cases need, injected by the composition root. */
export interface PlanDeps {
	plans: PlanRepository;
	contacts: ContactLookup;
	ids: IdGenerator;
	clock: Clock;
}

/** The member doing it. */
export interface PlanActor {
	userId: string;
	householdId: string;
}

/** What an idea says, as a form or a command hands it over. */
export interface PlanContent {
	title: string;
	note: string | null;
	url: string | null;
	visibility: Visibility;
	/** Kept from the person it is with; absent — no, or as it was on an edit. */
	hiddenFromPerson?: boolean;
	/** Absent — *some time* on an addition, as it was on an edit. */
	when?: When | null;
}

export interface AddPlanInput extends PlanContent {
	contactId: string;
}

export interface EditPlanInput extends PlanContent {
	contactId: string;
	planId: string;
}

/** Which idea a booking, a tick, an undo or a removal is about. */
export interface PlanRef {
	contactId: string;
	planId: string;
}

/** An idea that cannot be stored as asked: no line, a link that is not one, a when gone by. */
export class InvalidPlanError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'InvalidPlanError');
	}
}

/** The idea is not one the member can see (any more): removed, or made private by its author. */
export class PlanGoneError extends TranslatableError {
	constructor() {
		super(phrase('errors.plan.gone'), 'PlanGoneError');
	}
}

const orNull = (value: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

function titleOf(raw: string): string {
	const title = raw.trim();
	if (title.length === 0) throw new InvalidPlanError(phrase('errors.plan.needTitle'));
	return title;
}

function urlOf(raw: string | null): string | null {
	const link = giftLink(raw ?? '');
	if (!link.ok) throw new InvalidPlanError(phrase('errors.plan.badLink'));
	return link.url;
}

function whenOf(when: When | null, birth: PartialDate | null, today: string): When | null {
	const check = checkWhen(when, birth, today);
	if (!check.ok) throw new InvalidPlanError(phrase(`errors.when.${check.problem}`));
	return check.when;
}

const viewerOf = (actor: PlanActor): Viewer => ({
	id: actor.userId,
	householdId: actor.householdId
});

async function birthOfVisible(
	deps: Pick<PlanDeps, 'contacts'>,
	actor: PlanActor,
	contactId: string
): Promise<PartialDate | null> {
	const contact = await deps.contacts.findByIdVisibleTo(viewerOf(actor), contactId);
	if (!contact) throw new ContactGoneError();
	return birthOf(contact);
}

/** Only a shared idea can be kept from its person, and never by that person's own member. */
async function hiddenOf(
	deps: Pick<PlanDeps, 'plans'>,
	author: PlanActor,
	contactId: string,
	visibility: Visibility,
	asked: boolean
): Promise<boolean> {
	if (!asked || visibility !== 'shared') return false;
	const member = await deps.plans.memberWhoseOwnPerson(author.householdId, contactId);
	if (member === author.userId) throw new InvalidPlanError(phrase('errors.plan.ownSurprise'));
	return true;
}

export async function requireVisiblePlan(
	deps: Pick<PlanDeps, 'plans'>,
	actor: PlanActor,
	{ contactId, planId }: PlanRef
): Promise<Plan> {
	const plan = await deps.plans.findVisibleTo(viewerOf(actor), contactId, planId);
	if (!plan) throw new PlanGoneError();
	return plan;
}

/** Note an outing idea with a person the author can see. */
export async function addPlan(
	deps: PlanDeps,
	author: PlanActor,
	input: AddPlanInput
): Promise<{ planId: string }> {
	const birth = await birthOfVisible(deps, author, input.contactId);
	const title = titleOf(input.title);
	const url = urlOf(input.url);
	const when = whenOf(input.when ?? null, birth, todayFor(deps.clock));
	const hiddenFromPerson = await hiddenOf(
		deps,
		author,
		input.contactId,
		input.visibility,
		input.hiddenFromPerson ?? false
	);
	const now = deps.clock.now();
	const planId = deps.ids.next();
	await deps.plans.insert({
		id: planId,
		contactId: input.contactId,
		createdBy: author.userId,
		visibility: input.visibility,
		hiddenFromPerson,
		title,
		note: orNull(input.note),
		url,
		when,
		bookedAt: null,
		bookedBy: null,
		doneAt: null,
		doneOn: null,
		doneBy: null,
		momentId: null,
		createdAt: now,
		updatedAt: now
	});
	return { planId };
}

/** Rewrite what an idea says; only its author may change who sees it. */
export async function editPlan(
	deps: PlanDeps,
	editor: PlanActor,
	input: EditPlanInput
): Promise<{ planId: string }> {
	const plan = await requireVisiblePlan(deps, editor, input);
	// A when left as it was stays, even once its day is over; a new one must still be ahead.
	const asked = input.when === undefined ? plan.when : input.when;
	const when = sameWhen(asked, plan.when)
		? plan.when
		: whenOf(asked, await birthOfVisible(deps, editor, plan.contactId), todayFor(deps.clock));
	const mine = plan.createdBy === editor.userId;
	const visibility = mine ? input.visibility : plan.visibility;
	const asksHidden = mine
		? (input.hiddenFromPerson ?? plan.hiddenFromPerson)
		: plan.hiddenFromPerson;
	// Only a surprise asked for anew is checked; one already kept stays as it is.
	const hiddenFromPerson =
		asksHidden && plan.hiddenFromPerson
			? visibility === 'shared'
			: await hiddenOf(deps, editor, plan.contactId, visibility, asksHidden);
	await deps.plans.update({
		...plan,
		title: titleOf(input.title),
		note: orNull(input.note),
		url: urlOf(input.url),
		when,
		visibility,
		hiddenFromPerson,
		updatedAt: deps.clock.now()
	});
	return { planId: plan.id };
}

/** Remove an idea the member can see, done or not. */
export async function removePlan(
	deps: PlanDeps,
	actor: PlanActor,
	ref: PlanRef
): Promise<{ planId: string }> {
	const plan = await requireVisiblePlan(deps, actor, ref);
	await deps.plans.remove(plan.id);
	return { planId: plan.id };
}

/** The ideas on a person the viewer may see, open and done. */
export async function listPlansForContact(
	deps: Pick<PlanDeps, 'plans'>,
	viewer: Viewer,
	contactId: string
): Promise<Plan[]> {
	return deps.plans.listForContactVisibleTo(viewer, contactId);
}
