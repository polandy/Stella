import { TranslatableError } from '../../../i18n/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import { isWholeDay } from '../../../dates/calendar';
import {
	BIOLOGICAL_PARENT_KIND,
	isParentKind,
	type ParentKind
} from '../../../relationships/parent-kinds';
import { PARENT_CHILD_TYPE_KEY } from '../../../relationships/type-keys';
import {
	CURRENT_RELATIONSHIP_STATUS,
	FORMER_RELATIONSHIP_STATUS,
	RELATIONSHIP_STATUSES,
	type RelationshipStatus
} from '../../../relationships/status';

/*
 * What a relationship carries beyond its type (docs/dev/02 §2.4), and the one check every writer
 * of it — creating, editing, importing — runs before anything is stored.
 */

/** The specifics a relationship carries beyond its type (docs/dev/02 §2.4). */
export interface RelationshipDetails {
	/** Free text: how these two connect, e.g. "met through Peter at the ski course". */
	description: string | null;
	/** A full ISO day the link dates from, or null. */
	sinceDate: string | null;
	/** A full ISO day the link ended on, or null; a day already past makes the link former. */
	untilDate: string | null;
	/** Whether the tie still holds. A link that exists is `current` until someone ends it. */
	status: RelationshipStatus;
	/** A parent link's kind (biological, adoptive, foster, step); null on every other type. */
	parentKind: ParentKind | null;
}

/**
 * The same four as they arrive from a form. For the two free fields, absent, blank and null
 * all mean "not said"; for the status they mean `current`, the only state a link that exists
 * can be in until it is explicitly ended (docs/dev/02 §2.4).
 */
export interface RelationshipDetailsInput {
	description?: string | null;
	sinceDate?: string | null;
	untilDate?: string | null;
	status?: string | null;
	parentKind?: string | null;
}

export class InvalidRelationshipDetailsError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'InvalidRelationshipDetailsError');
	}
}

const blankToNull = (value: string | null | undefined): string | null =>
	(value ?? '').trim() || null;

/** The trimmed day, or null when blank; refuses one that does not exist (or is not whole). */
function wholeDayOrNull(value: string | null | undefined): string | null {
	const day = blankToNull(value);
	if (day && !isWholeDay(day)) {
		throw new InvalidRelationshipDetailsError(phrase('errors.relationship.noSuchDay', { day }));
	}
	return day;
}

/**
 * Normalise and check the details, so nothing unreal is ever stored. A since or until day must
 * be a whole day that exists: `--06-01` is legal for a birthday but says nothing about *when* a
 * relationship began, and `2019-02-30` would silently roll into March downstream.
 */
export function parseRelationshipDetails(
	input: RelationshipDetailsInput,
	typeKey: string,
	today: string
): RelationshipDetails {
	const sinceDate = wholeDayOrNull(input.sinceDate);
	const untilDate = wholeDayOrNull(input.untilDate);
	if (sinceDate && untilDate && untilDate < sinceDate) {
		throw new InvalidRelationshipDetailsError(phrase('errors.relationship.untilBeforeSince'));
	}

	const status = blankToNull(input.status);
	if (status && !RELATIONSHIP_STATUSES.includes(status as RelationshipStatus)) {
		throw new InvalidRelationshipDetailsError(phrase('errors.relationship.currentOrFormer'));
	}

	// A tie that ended before today is a former one; the status stays the saved truth.
	const ended = untilDate !== null && untilDate < today;
	return {
		parentKind: parentKindFor(typeKey, input.parentKind),
		description: blankToNull(input.description),
		sinceDate,
		untilDate,
		status: ended
			? FORMER_RELATIONSHIP_STATUS
			: ((status as RelationshipStatus | null) ?? CURRENT_RELATIONSHIP_STATUS)
	};
}

/**
 * A parent link's kind, biological when unsaid; any other type carries none, and naming one
 * there is refused rather than dropped, so a caller that sends it learns it is wrong.
 */
export function parentKindFor(
	typeKey: string,
	value: string | null | undefined
): ParentKind | null {
	const kind = blankToNull(value);
	if (typeKey !== PARENT_CHILD_TYPE_KEY) {
		if (kind) {
			throw new InvalidRelationshipDetailsError(
				phrase('errors.relationship.parentKindOnlyForParents')
			);
		}
		return null;
	}
	if (kind === null) return BIOLOGICAL_PARENT_KIND;
	if (!isParentKind(kind)) {
		throw new InvalidRelationshipDetailsError(phrase('errors.relationship.noSuchParentKind'));
	}
	return kind;
}
