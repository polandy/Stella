import type { Locale } from '../../../i18n/locales';
import { phrase } from '../../../i18n/phrase';
import { TranslatableError } from '../../../i18n/translatable';
import type { ReviewAnswer } from '../../../import-match/review';
import type { Viewer, Visibility } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { activityRecord, type ActivityOf } from '../activity/activity';
import { ContactGoneError } from '../contacts/require-visible';
import {
	planMonicaImport,
	type ImportedPhoto,
	type ImportPlan,
	type ImportWording
} from './monica/plan';
import { cardsToReview, completionOf, isCompleting, type PersonCompletion } from './review-cards';
import type { ContactSourceRepository, ReviewScope, SourceLink } from './source-links';
import { readReviewExport } from './review-export';

/*
 * Applying the matching review of another address book's export (docs/02 §2.16). The member
 * answered each card the review asked about — *Same person* (possibly someone they picked),
 * *New person* or *Skip* — and the answers are written as one: the new people through the
 * import's own mapping, what the people already here are missing, and every answer to
 * remember, so the next run of the same export asks only about what is new or changed.
 */

/** The member's answer for one card; the review step's own shape. */
export type CardAnswer = ReviewAnswer;

/** Some card the review asked about came back without an answer. */
export class ReviewUnansweredError extends TranslatableError {
	constructor() {
		super(phrase('import.review.error.unanswered'), 'ReviewUnansweredError');
	}
}

/** Everything one review writes, in one transaction. */
export interface ReviewWrite {
	/** The import plan, narrowed to the cards answered *New person*. */
	newPeople: ImportPlan;
	/** What the people answered *Same person* gain; only those who gain something. */
	completions: PersonCompletion[];
	links: SourceLink[];
	/** When the review was applied: the people's `updatedAt`. */
	at: number;
}

/** Port the domain owns; the adapter writes a review atomically. */
export interface ContactReviewWriter {
	/**
	 * Writes the review, refusing it whole (`ContactGoneError`) when a person it names is no
	 * longer one `viewer` may browse. Returns how many people were added and completed.
	 */
	applyReview(
		viewer: Viewer,
		write: ReviewWrite,
		audit: ActivityOf<'contacts.reviewed'> | null
	): Promise<{ people: number; completed: number }>;
}

export interface ContactReviewDeps {
	sources: ContactSourceRepository;
	writer: ContactReviewWriter;
	clock: Clock;
	ids: IdGenerator;
}

export interface ContactReviewRequest {
	viewer: Viewer;
	text: string;
	/** By card key (`IncomingCard.key`). */
	answers: ReadonlyMap<string, CardAnswer>;
	/** Visibility every new person gets (the wizard's choice). */
	visibility: Visibility;
	wording: ImportWording;
	locale: Locale;
	/** Set when the cards are the linked book's rather than an uploaded file's. */
	scope?: ReviewScope;
}

export interface ContactReviewOutcome {
	added: number;
	completed: number;
	skipped: number;
	/** The pictures the wizard's photo step brings in next, a known person's as their photo. */
	photos: ImportedPhoto[];
	/** Cards whose picture is only a link, which is never fetched. */
	linkPhotos: number;
}

/** Keeps only what belongs to the given people. */
function narrowPlan(plan: ImportPlan, ids: ReadonlySet<string>): ImportPlan {
	const contactTags = plan.contactTags.filter((t) => ids.has(t.contactId));
	const tagIds = new Set(contactTags.map((t) => t.tagId));
	const own = <T extends { contactId: string }>(rows: T[]) =>
		rows.filter((r) => ids.has(r.contactId));
	return {
		...plan,
		contacts: plan.contacts.filter((c) => ids.has(c.id)),
		contactFields: own(plan.contactFields),
		// A vCard carries no relationships, gifts, tasks or activities; nothing of theirs is kept.
		relationshipTypes: [],
		relationships: [],
		gifts: [],
		todos: [],
		interactions: [],
		notes: own(plan.notes),
		tags: plan.tags.filter((t) => tagIds.has(t.id)),
		contactTags,
		photos: own(plan.photos)
	};
}

export async function applyContactReview(
	deps: ContactReviewDeps,
	request: ContactReviewRequest
): Promise<ContactReviewOutcome> {
	const { viewer, scope = {} } = request;
	const now = deps.clock.now();
	const read = readReviewExport(request.text);
	const { cards, linkPhotos, exp, planIdOf } = read;
	const source = scope.source ?? read.source;

	const [remembered, people] = await Promise.all([
		deps.sources.answersFor(viewer, source),
		deps.sources.matchablePeople(viewer, scope)
	]);
	const review = cardsToReview(cards, remembered, people);
	const byId = new Map(people.map((p) => [p.id, p]));
	const plan = planMonicaImport(exp, {
		householdId: viewer.householdId,
		userId: viewer.id,
		visibility: request.visibility,
		now,
		wording: request.wording,
		locale: request.locale
	});

	const newIds = new Set<string>();
	const completions: PersonCompletion[] = [];
	const links: SourceLink[] = [];
	const photos: ImportedPhoto[] = [];
	let skipped = 0;
	for (const { card } of review) {
		const answer = request.answers.get(card.key);
		if (!answer) throw new ReviewUnansweredError();
		const planId = planIdOf.get(card.key)!;
		const link = (contactId: string | null): SourceLink => ({
			source,
			externalUid: card.key,
			contactId,
			state: contactId === null ? 'skipped' : 'linked',
			cardName: card.displayName,
			cardHash: card.hash,
			answeredBy: viewer.id,
			answeredAt: now
		});

		if (answer.kind === 'skip') {
			skipped++;
			links.push(link(null));
		} else if (answer.kind === 'new') {
			if (!plan.contacts.some((c) => c.id === planId)) {
				throw new Error(`the import plan has no person for card ${card.key}`);
			}
			newIds.add(planId);
			links.push(link(planId));
		} else {
			const person = byId.get(answer.personId);
			if (!person) throw new ContactGoneError();
			const completion = completionOf(card, person, answer.takeCard, {
				ids: deps.ids,
				now,
				wording: request.wording,
				locale: request.locale
			});
			if (isCompleting(completion)) completions.push(completion);
			const picture = completion.photo
				? (plan.photos.find((p) => p.contactId === planId && p.isAvatar) ??
					plan.photos.find((p) => p.contactId === planId))
				: undefined;
			if (picture) photos.push({ ...picture, contactId: person.id, isAvatar: true });
			links.push(link(person.id));
		}
	}

	const newPeople = narrowPlan(plan, newIds);
	photos.unshift(...newPeople.photos);
	if (links.length === 0) return { added: 0, completed: 0, skipped: 0, photos: [], linkPhotos };

	// A review that only remembered answers changed nobody, and "imported 0 people" is noise.
	const audit =
		newPeople.contacts.length + completions.length === 0
			? null
			: activityRecord(
					deps,
					viewer,
					{
						kind: 'contacts.reviewed',
						people: newPeople.contacts.length,
						completed: completions.length,
						source,
						visibility: request.visibility,
						locale: request.locale
					},
					now
				);
	const written = await deps.writer.applyReview(
		viewer,
		{ newPeople, completions, links, at: now },
		audit
	);
	return { added: written.people, completed: written.completed, skipped, photos, linkPhotos };
}
