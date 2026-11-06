import { TranslatableError } from '../../../i18n/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import { isWholeDay } from '../../../dates/calendar';
import {
	CURRENT_RELATIONSHIP_STATUS,
	RELATIONSHIP_STATUSES,
	type RelationshipStatus
} from '../../../relationships/status';

/*
 * What a relationship carries beyond its type (docs/02 §2.4), and the one check every writer
 * of it — creating, editing, importing — runs before anything is stored.
 */

/** The specifics a relationship carries beyond its type (docs/02 §2.4). */
export interface RelationshipDetails {
	/** Free text: how these two connect, e.g. "met through Peter at the ski course". */
	description: string | null;
	/** A full ISO day the link dates from, or null. */
	sinceDate: string | null;
	/** Whether the tie still holds. A link that exists is `current` until someone ends it. */
	status: RelationshipStatus;
}

/**
 * The same three as they arrive from a form. For the two free fields, absent, blank and null
 * all mean "not said"; for the status they mean `current`, the only state a link that exists
 * can be in until it is explicitly ended (docs/02 §2.4).
 */
export interface RelationshipDetailsInput {
	description?: string | null;
	sinceDate?: string | null;
	status?: string | null;
}

export class InvalidRelationshipDetailsError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'InvalidRelationshipDetailsError');
	}
}

const blankToNull = (value: string | null | undefined): string | null =>
	(value ?? '').trim() || null;

/**
 * Normalise and check the details, so nothing unreal is ever stored. A since-day must be a
 * whole day that exists: `--06-01` is legal for a birthday but says nothing about *when* a
 * relationship began, and `2019-02-30` would silently roll into March downstream.
 */
export function parseRelationshipDetails(input: RelationshipDetailsInput): RelationshipDetails {
	const sinceDate = blankToNull(input.sinceDate);
	if (sinceDate && !isWholeDay(sinceDate)) {
		throw new InvalidRelationshipDetailsError(
			phrase('errors.relationship.noSuchDay', { day: sinceDate })
		);
	}

	const status = blankToNull(input.status);
	if (status && !RELATIONSHIP_STATUSES.includes(status as RelationshipStatus)) {
		throw new InvalidRelationshipDetailsError(phrase('errors.relationship.currentOrFormer'));
	}

	return {
		description: blankToNull(input.description),
		sinceDate,
		status: (status as RelationshipStatus | null) ?? CURRENT_RELATIONSHIP_STATUS
	};
}
