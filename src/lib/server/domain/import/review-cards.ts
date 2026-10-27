import type { PartialDate } from '../../../dates/partial-date';
import type { Locale } from '../../../i18n/locales';
import { matchCard, type CardMatch } from '../../../import-match/candidates';
import type { CardLabel, IncomingCard, StellaPerson } from '../../../import-match/card';
import { mergePlan, type Conflict } from '../../../import-match/merge-plan';
import { withNameParts, type NamePartsChange } from '../../../people/display-name';
import type { IdGenerator } from '../../id';
import type { NewContactField } from '../contact-fields/contact-fields';
import type { ImportWording } from './monica/plan';
import type { RememberedAnswer } from './source-links';

/*
 * The pure half of the matching review (docs/02 §2.16): which cards of an export still need an
 * answer, and what *Same person* writes onto the person. No I/O; the use-case reads the answers
 * and people, and the writer applies the result in one transaction.
 */

/** A card the member is asked about, with who it may be. */
export interface CardToReview {
	card: IncomingCard;
	match: CardMatch;
	/** The person the card was linked to before it changed; it is offered as theirs again. */
	linkedTo: string | null;
}

const ORDER: Record<CardMatch['kind'], number> = { strong: 0, weak: 1, several: 2, none: 3 };
const rank = (r: CardToReview) => (r.linkedTo ? 0 : ORDER[r.match.kind]);

/**
 * The cards that need an answer: new ones and linked ones that changed since. A skipped card,
 * an unchanged linked one and one linked to somebody out of the member's reach are left alone.
 * The sure ones come first, so the member can confirm them in one go.
 */
export function cardsToReview(
	cards: readonly IncomingCard[],
	remembered: ReadonlyMap<string, RememberedAnswer>,
	people: StellaPerson[]
): CardToReview[] {
	const review: CardToReview[] = [];
	for (const card of cards) {
		const answer = remembered.get(card.key);
		if (answer?.state === 'skipped' || answer?.state === 'out-of-reach') continue;
		if (answer?.state === 'linked' && answer.cardHash === card.hash) continue;
		review.push({
			card,
			match: matchCard(card, people),
			linkedTo: answer?.state === 'linked' ? answer.personId : null
		});
	}
	// Array.prototype.sort is stable, so the file's order holds within a kind.
	return review.sort((a, b) => rank(a) - rank(b));
}

/** The profile columns *Same person* may fill. */
export interface ProfileChange {
	firstName?: string | null;
	lastName?: string | null;
	displayName?: string;
	nickname?: string | null;
	company?: string;
	jobTitle?: string;
	birthDate?: string;
	birthDatePrecision?: PartialDate['precision'];
}

/** What *Same person* writes onto one person. */
export interface PersonCompletion {
	personId: string;
	fields: NewContactField[];
	set: ProfileChange;
	/** Groups to tag them with; the id is used only if the household has no tag of that name. */
	tags: { id: string; name: string }[];
	/** Whether the card's picture becomes their photo. */
	photo: boolean;
}

export interface CompletionContext {
	ids: IdGenerator;
	now: number;
	wording: Pick<ImportWording, 'fieldLabel'>;
	locale: Locale;
}

const labelText = (label: CardLabel | null, wording: CompletionContext['wording']) =>
	label === null ? null : 'known' in label ? wording.fieldLabel(label.known) : label.typed;

/**
 * What the card gives the person: what they are missing, and the card's side of each conflict
 * named in `takeCard` — of one that exists; a stale choice for a conflict that is gone is ignored.
 */
export function completionOf(
	card: IncomingCard,
	person: StellaPerson,
	takeCard: readonly Conflict['kind'][],
	ctx: CompletionContext
): PersonCompletion {
	const plan = mergePlan(card, person);
	const completion: PersonCompletion = {
		personId: person.id,
		fields: [],
		set: {},
		tags: [],
		photo: false
	};
	const names: NamePartsChange = {};

	for (const fact of plan.add) {
		switch (fact.kind) {
			case 'email':
			case 'phone':
			case 'address':
			case 'url':
				completion.fields.push({
					id: ctx.ids.next(),
					contactId: person.id,
					kind: fact.kind,
					label: labelText(fact.label, ctx.wording),
					value: fact.value,
					meta: null,
					sortOrder: person.fields.length + completion.fields.length,
					createdAt: ctx.now,
					updatedAt: ctx.now
				});
				break;
			case 'lastName':
			case 'nickname':
				names[fact.kind] = fact.value;
				break;
			case 'company':
			case 'jobTitle':
				completion.set[fact.kind] = fact.value;
				break;
			case 'birthday':
				completion.set.birthDate = fact.date.value;
				completion.set.birthDatePrecision = fact.date.precision;
				break;
			case 'photo':
				completion.photo = true;
				break;
			case 'tag':
				completion.tags.push({ id: ctx.ids.next(), name: fact.name });
				break;
		}
	}

	for (const conflict of plan.conflicts) {
		if (!takeCard.includes(conflict.kind)) continue;
		if (conflict.kind === 'birthday') {
			completion.set.birthDate = conflict.card.value;
			completion.set.birthDatePrecision = conflict.card.precision;
		} else {
			names[conflict.kind] = conflict.card;
		}
	}

	// A name part goes through the one rule every name change follows, so a shown name the parts
	// made follows them and one a member chose stays (docs/02 §2.2).
	if (Object.keys(names).length > 0) {
		Object.assign(completion.set, withNameParts(person, names, ctx.locale));
	}
	return completion;
}

/** Whether a completion writes anything at all. */
export const isCompleting = (c: PersonCompletion): boolean =>
	c.fields.length > 0 || c.tags.length > 0 || c.photo || Object.keys(c.set).length > 0;
