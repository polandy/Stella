import { FULL_DATE_SHAPE, isRealCalendarDay } from '../dates/calendar';
import { PARENT_CHILD_TYPE_KEY } from './type-keys';
import type { RelationshipSide } from './type-options';

/*
 * The since day a new link starts out with (docs/02 §2.4). A parent–child link began the
 * day the child was born, and that day is already on file — so the form offers it rather
 * than asking for it a second time. It is a suggestion in an editable field, never a
 * stored value: whoever enters the link can clear or change it.
 */

/** What this needs to know about either endpoint; `null` while nobody is picked. */
export interface BirthDated {
	/** `YYYY-MM-DD`, a year-less `--MM-DD`, or a bare year — see docs/03 §3.4. */
	birthDate?: string | null;
}

/** The type and side a picker entry reads, as `decodeRelationshipChoice` returns them. */
export interface KinChoice {
	typeKey: string;
	side: RelationshipSide;
}

/** Whichever of the two is the child, given how the sentence is read from `self`'s page. */
function childOf(choice: KinChoice, self: BirthDated | null, target: BirthDated | null) {
	if (choice.typeKey !== PARENT_CHILD_TYPE_KEY) return null;
	// `parent_child` is stored parent → child: read forward, self is the parent (docs/02 §2.4).
	return choice.side === 'forward' ? target : self;
}

/**
 * The since day to prefill for a link about to be entered from `self`'s page, or `''` when
 * there is nothing to suggest. Only a whole day qualifies — a since day must be one
 * (`parseRelationshipDetails`), so a month-and-day birthday or an estimated year names none.
 */
export function sinceDateFromBirth(
	choice: KinChoice,
	self: BirthDated | null,
	target: BirthDated | null
): string {
	const birthDate = childOf(choice, self, target)?.birthDate;
	if (!birthDate) return '';
	if (!FULL_DATE_SHAPE.test(birthDate) || !isRealCalendarDay(birthDate)) return '';
	return birthDate;
}
