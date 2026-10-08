import * as v from 'valibot';
import type { Translate } from '$lib/i18n/translate';
import type { Viewer } from '$lib/server/access/visibility';
import { getContact, type ContactLookupDeps } from '$lib/server/domain/contacts/contacts';
import {
	ContradictoryRelationshipError,
	DuplicateRelationshipError,
	createRelationship,
	type CreateRelationshipDeps
} from '$lib/server/domain/relationships/relationships';
import {
	dismissSuggestion,
	restoreSuggestion,
	type SuggestionReviewDeps
} from '$lib/server/domain/relationships/suggestion-review';
import { RELATIONS } from '$lib/suggestions/types';

/*
 * Answering a suggestion, wherever it was offered (docs/02 §2.4.1, docs/04 ADR-117).
 *
 * The same three answers now reach a household from two screens — the person page's review
 * panel and the household-wide pass in Settings — and they must mean exactly the same thing on
 * both. One claim written into two routes is one claim that drifts: a guard tightened on one
 * screen and not the other is how a suggestion gets stored that manual entry would refuse.
 *
 * So the routes keep what differs — which page to go back to — and the answer itself lives
 * here. Each function returns `null` when it wrote what was asked, or a `RefusedAnswer`;
 * neither redirects, because where "back" is belongs to the screen. They take the slices of
 * `locals.services` they reach and the request's translator as arguments, so a route hands
 * them in and a test hands in fakes (docs/08 §8.3).
 */

/**
 * The part of `AppServices` the answers reach — its shape, narrowed to what they call, so a
 * route passes `locals.services` as it is.
 */
export interface ClaimAnswerServices {
	people: { contactDeps: ContactLookupDeps };
	relationships: {
		relationshipDeps: CreateRelationshipDeps;
		suggestionReviewDeps: SuggestionReviewDeps;
	};
}

/**
 * Why an answer was refused, and what to say about it. The `status` travels with the reason
 * rather than being recovered from the sentence: a route that matched the message text to pick
 * a code would silently start answering 400 the day someone rewords a translation.
 */
export interface RefusedAnswer {
	status: 400 | 409;
	message: string;
}

const refused = (message: string, status: 400 | 409 = 400): RefusedAnswer => ({ status, message });

/** A claim being answered: the relation and the two people, from either end. */
const ClaimSchema = v.object({
	relation: v.picklist(RELATIONS),
	fromId: v.pipe(v.string(), v.minLength(1)),
	toId: v.pipe(v.string(), v.minLength(1))
});

/** A claim being accepted, which stores a link and so names the type it would be stored as. */
const AcceptSchema = v.object({
	fromId: v.pipe(v.string(), v.minLength(1)),
	toId: v.pipe(v.string(), v.minLength(1)),
	typeId: v.pipe(v.string(), v.minLength(1))
});

/** The fields a form hands over, whichever screen it sits on. */
export type AnswerForm = Pick<FormData, 'get'>;

const read = (form: AnswerForm, ...names: string[]) =>
	Object.fromEntries(names.map((name) => [name, form.get(name)]));

/**
 * Store the link a claim offers, through the same checked use-case a manual entry goes
 * through — a suggestion that would contradict the graph is refused exactly like anything a
 * member types.
 */
export async function acceptClaim(
	services: ClaimAnswerServices,
	viewer: Viewer,
	form: AnswerForm,
	t: Translate
): Promise<RefusedAnswer | null> {
	const parsed = v.safeParse(AcceptSchema, read(form, 'fromId', 'toId', 'typeId'));
	if (!parsed.success) return refused(t('errors.relationship.badSuggestion'));

	const [from, to] = await Promise.all([
		getContact(services.people.contactDeps, viewer, parsed.output.fromId),
		getContact(services.people.contactDeps, viewer, parsed.output.toId)
	]);
	if (!from || !to) return refused(t('errors.person.notFound'));

	try {
		await createRelationship(services.relationships.relationshipDeps, viewer, {
			fromContactId: parsed.output.fromId,
			toContactId: parsed.output.toId,
			typeId: parsed.output.typeId,
			description: null
		});
	} catch (err) {
		// A suggestion the household already contradicted says why; a duplicate is silent,
		// since the link it offered is there either way.
		if (err instanceof ContradictoryRelationshipError) {
			return refused(t('errors.relationship.contradiction'), 409);
		}
		if (!(err instanceof DuplicateRelationshipError)) {
			return refused(t('errors.relationship.couldNotAdd'));
		}
	}
	return null;
}

/**
 * Decline a claim, so it stops being offered however a rule reaches it later (§6.4). The
 * household decided, so the *no* holds for every member.
 */
export async function declineClaim(
	services: ClaimAnswerServices,
	viewer: Viewer,
	form: AnswerForm,
	t: Translate
): Promise<RefusedAnswer | null> {
	const parsed = v.safeParse(ClaimSchema, read(form, 'relation', 'fromId', 'toId'));
	if (!parsed.success) return refused(t('errors.relationship.badSuggestion'));

	return (await dismissSuggestion(
		services.relationships.suggestionReviewDeps,
		viewer,
		parsed.output
	))
		? null
		: refused(t('errors.person.notFound'));
}

/** Take a *no* back, so the claim is offered again on the next review (§6.5). */
export async function restoreClaim(
	services: ClaimAnswerServices,
	viewer: Viewer,
	form: AnswerForm,
	t: Translate
): Promise<RefusedAnswer | null> {
	const parsed = v.safeParse(ClaimSchema, read(form, 'relation', 'fromId', 'toId'));
	if (!parsed.success) return refused(t('errors.relationship.badSuggestion'));

	// Nothing to take back is not a failure worth a message: the claim is offered either way.
	await restoreSuggestion(services.relationships.suggestionReviewDeps, viewer, parsed.output);
	return null;
}
