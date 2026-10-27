import { fullName, type IncomingCard, type StellaPerson } from '../../../import-match/card';
import type { MatchReason } from '../../../import-match/candidates';
import { mergePlan } from '../../../import-match/merge-plan';
import { foldName } from '../../../import-match/normalise';
import type { ContactReview, ReviewCandidate, ReviewCard } from '../../../import-match/review';
import type { Viewer } from '../../access/visibility';
import { readContactCards } from './contact-cards';
import { readReviewExport } from './review-export';
import { cardsToReview, type CardToReview } from './review-cards';
import type {
	ContactSource,
	ContactSourceRepository,
	ReviewScope,
	SkippedCard
} from './source-links';

/*
 * What the wizard's review step reads (docs/02 §2.16): the cards that need an answer with who
 * each may be, a search for someone else, whose photo a reviewed card's picture becomes, and
 * the skipped cards with their *Ask again*. Every person here comes from `matchablePeople`, so
 * the member only ever sees people they may browse.
 */

export interface ReviewViewDeps {
	sources: ContactSourceRepository;
}

/** How many people a search for *Pick someone else* offers. */
const SEARCH_LIMIT = 8;

function candidateOf(
	card: IncomingCard,
	person: StellaPerson,
	reasons: MatchReason[]
): ReviewCandidate {
	return {
		personId: person.id,
		displayName: person.displayName,
		birthday: person.birthday,
		reasons,
		plan: mergePlan(card, person)
	};
}

function reviewCardOf(
	{ card, match, linkedTo }: CardToReview,
	byId: ReadonlyMap<string, StellaPerson>
): ReviewCard {
	const { hash: _hash, ...shown } = card;
	const linked = linkedTo === null ? undefined : byId.get(linkedTo);
	if (linked) return { kind: 'linked', card: shown, candidates: [candidateOf(card, linked, [])] };
	if (match.kind === 'none') return { kind: 'none', card: shown, candidates: [] };
	const found = match.kind === 'several' ? match.candidates : [match.candidate];
	return {
		kind: match.kind,
		card: shown,
		candidates: found.map((c) => candidateOf(card, byId.get(c.personId)!, c.reasons))
	};
}

/** The review of one export: what is asked, and what is not and why. */
export async function prepareContactReview(
	deps: ReviewViewDeps,
	viewer: Viewer,
	text: string,
	scope: ReviewScope = {}
): Promise<ContactReview> {
	const read = readContactCards(text);
	const { cards, linkPhotos } = read;
	const source = scope.source ?? read.source;
	const [remembered, people] = await Promise.all([
		deps.sources.answersFor(viewer, source),
		deps.sources.matchablePeople(viewer, scope)
	]);
	const byId = new Map(people.map((p) => [p.id, p]));
	const asked = cardsToReview(cards, remembered, people);
	const skippedBefore = cards.filter((c) => remembered.get(c.key)?.state === 'skipped').length;
	return {
		source,
		total: cards.length,
		settled: cards.length - asked.length - skippedBefore,
		skippedBefore,
		linkPhotos,
		cards: asked.map((r) => reviewCardOf(r, byId))
	};
}

/** People whose name holds `query`, each with what *Same person* would do with this card. */
export async function findForReview(
	deps: ReviewViewDeps,
	viewer: Viewer,
	text: string,
	request: { key: string; query: string },
	scope: ReviewScope = {}
): Promise<ReviewCandidate[]> {
	const wanted = foldName(request.query);
	if (wanted.length < 2) return [];
	const card = readContactCards(text).cards.find((c) => c.key === request.key);
	if (!card) return [];
	const people = await deps.sources.matchablePeople(viewer, scope);
	return people
		.filter((p) =>
			[fullName(p), p.displayName, p.nickname ?? ''].some((n) => foldName(n).includes(wanted))
		)
		.sort((a, b) => a.displayName.localeCompare(b.displayName))
		.slice(0, SEARCH_LIMIT)
		.map((p) => candidateOf(card, p, []));
}

/**
 * Whose photo a picture of a reviewed card becomes, from the answer remembered for it: a new
 * person's own, or the picture as the photo of the person the card was linked to — their
 * avatar only when they had none. Null when the card was skipped or never answered.
 */
export async function reviewedPhotoTarget(
	deps: ReviewViewDeps,
	viewer: Viewer,
	text: string,
	photo: { contactId: string; isAvatar: boolean }
): Promise<{ contactId: string; isAvatar: boolean } | null> {
	const { source, planIdOf } = readReviewExport(text);
	const key = [...planIdOf].find(([, planId]) => planId === photo.contactId)?.[0];
	if (key === undefined) return null;
	const remembered = (await deps.sources.answersFor(viewer, source)).get(key);
	if (remembered?.state !== 'linked') return null;
	if (remembered.personId === photo.contactId) return photo;
	// A person already here gains the card's one picture, never its others.
	if (!photo.isAvatar) return null;
	const person = (await deps.sources.matchablePeople(viewer)).find(
		(p) => p.id === remembered.personId
	);
	if (!person) return null;
	return { contactId: person.id, isAvatar: !person.hasPhoto };
}

/** The household's skipped cards, for *Skipped contacts*. */
export const skippedContacts = (deps: ReviewViewDeps, viewer: Viewer): Promise<SkippedCard[]> =>
	deps.sources.skippedFor(viewer);

/** Forget one skip, so the next import of that address book asks about the card again. */
export const askAgain = (
	deps: ReviewViewDeps,
	viewer: Viewer,
	source: ContactSource,
	externalUid: string
): Promise<boolean> => deps.sources.askAgain(viewer, source, externalUid);
