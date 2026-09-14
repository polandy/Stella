import { FULL_DATE_SHAPE, isRealCalendarDay } from '../dates/calendar';
import type { RelationshipCategory } from './categories';
import type { RelationshipSide } from './type-options';

/*
 * The since day a new link starts out with (docs/02 §2.4). A family tie begins the day the
 * younger of the two was born — a child gains a parent, a grandparent and a godparent at
 * birth, and a sibling the day the second of them arrives — and that day is already on file,
 * so the form offers it rather than asking for it a second time. Outside the family a link
 * begins at a meeting, a wedding or a first day at work, which no birthday knows.
 *
 * It is a suggestion in an editable field, never a stored value: whoever enters the link can
 * clear or change it.
 */

/** What this needs to know about either endpoint; `null` while nobody is picked. */
export interface BirthDated {
	/** `YYYY-MM-DD`, a year-less `--MM-DD`, or a bare year — see docs/03 §3.4. */
	birthDate?: string | null;
}

/** The type and side a picker entry reads, as far as this rule cares. */
export interface KinChoice {
	category: RelationshipCategory;
	symmetric: boolean;
	side: RelationshipSide;
}

/** The value only if it names a whole day that happened; a since day has to be one. */
function wholeDay(value: string | null | undefined): string | null {
	if (!value) return null;
	return FULL_DATE_SHAPE.test(value) && isRealCalendarDay(value) ? value : null;
}

/**
 * Whichever of the two was born later, given how the sentence is read from `self`'s page.
 *
 * An asymmetric family type names the elder role forward and the younger one in reverse —
 * "Parent of", "Grandparent of", the household's own "Godparent of" — so the side alone says
 * who the younger is, and the elder's own birthday need not be on file. A symmetric one
 * (sibling) says nothing about age, so it takes the later of the two days and needs both.
 */
function youngerOf(
	choice: KinChoice,
	self: BirthDated | null,
	target: BirthDated | null
): string | null {
	if (choice.category !== 'family') return null;
	if (!choice.symmetric) return wholeDay((choice.side === 'forward' ? target : self)?.birthDate);

	const ours = wholeDay(self?.birthDate);
	const theirs = wholeDay(target?.birthDate);
	if (!ours || !theirs) return null;
	// Both are full ISO days, which sort as text.
	return ours > theirs ? ours : theirs;
}

/**
 * The since day to prefill for a link about to be entered from `self`'s page, or `''` when
 * there is nothing to suggest.
 */
export function sinceDateFromBirth(
	choice: KinChoice,
	self: BirthDated | null,
	target: BirthDated | null
): string {
	return youngerOf(choice, self, target) ?? '';
}
