import { TranslatableError } from '../../../i18n/translatable';
import { phrase } from '../../../i18n/phrase';
import { namesADay } from '../../../dates/partial-date';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { ContactLookup } from '../contacts/contacts';
import { checkBirthEstimate } from '../contacts/birth-year';
import { ContactGoneError } from '../contacts/require-visible';
import type { ImportantDateRepository } from './important-dates';

/* Setting or removing the estimated birth year on its own (docs/dev/02 §2.13.1). */

/** Thrown when the profile already holds a birthday that names a day: an estimate never replaces it. */
export class BirthDayOnRecordError extends TranslatableError {
	constructor() {
		super(phrase('errors.date.birthDayOnRecord'), 'BirthDayOnRecordError');
	}
}

export interface BirthEstimateDeps {
	dates: Pick<ImportantDateRepository, 'setBirthYear'>;
	contacts: ContactLookup;
	clock: Clock;
}

/**
 * Keep `year` as the person's estimated birth year, replacing an earlier estimate, or remove
 * the year alone with `null`. A profile birthday that names a day is never overwritten.
 */
export async function setBirthEstimate(
	deps: BirthEstimateDeps,
	viewer: Viewer,
	input: { contactId: string; year: string | null }
): Promise<void> {
	const now = deps.clock.now();
	if (input.year !== null) checkBirthEstimate(input.year, now);
	const contact = await deps.contacts.findByIdVisibleTo(viewer, input.contactId);
	if (!contact) throw new ContactGoneError();
	if (contact.birthDate !== null && namesADay(contact.birthDatePrecision)) {
		// Removing is asked of a year alone only; a day on record is already no estimate.
		if (input.year === null) return;
		throw new BirthDayOnRecordError();
	}
	if (!(await deps.dates.setBirthYear(viewer, input.contactId, input.year, now))) {
		throw new ContactGoneError();
	}
}
