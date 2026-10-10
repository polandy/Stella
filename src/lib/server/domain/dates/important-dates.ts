import { TranslatableError } from '../../../i18n/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { ContactLookup } from '../contacts/contacts';
import { ContactGoneError } from '../contacts/require-visible';
import { DATE_SHAPE, isRealCalendarDay } from '../../../dates/calendar';
import { IMPORTANT_DATE_KINDS, type ImportantDateKind } from '../../../dates/kinds';
import type { UpcomingSource } from './upcoming';

/*
 * Important date use-cases (docs/02 §2.13). Dates are child records of a contact and have no
 * visibility of their own — they inherit the contact's, enforced by the adapter's
 * visibility-scoped reads. Birthdays are usually derived from `contact.birth_date`; an
 * explicit row is for anniversaries, one-offs, and for overriding or muting a birthday.
 */

export interface NewImportantDate {
	id: string;
	contactId: string;
	kind: ImportantDateKind;
	label: string | null;
	/** ISO `YYYY-MM-DD`, or `--MM-DD` when the year is unknown. */
	date: string;
	recursYearly: boolean;
	remind: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface ImportantDate extends NewImportantDate {}

export interface ImportantDateRepository {
	insert(date: NewImportantDate): Promise<void>;
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<ImportantDate[]>;
	/** Remove a date, scoped to its contact (`removeImportantDate` checked it is visible). */
	remove(contactId: string, dateId: string): Promise<void>;
	/** Every date the viewer may see, explicit rows and derived birthdays alike. */
	listSourcesVisibleTo(viewer: Viewer): Promise<UpcomingSource[]>;
}

export interface ImportantDateDeps {
	dates: ImportantDateRepository;
	contacts: ContactLookup;
	ids: IdGenerator;
	clock: Clock;
}

export interface AddImportantDateInput {
	contactId: string;
	kind: ImportantDateKind;
	label?: string | null;
	date: string;
	recursYearly?: boolean;
	remind?: boolean;
}

/** Thrown when a date is malformed or its kind is unknown. */
export class InvalidImportantDateError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'InvalidImportantDateError');
	}
}

const orNull = (value?: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/**
 * Add an important date. The caller must have verified the contact is visible. A `custom`
 * date needs a label — without one it would show up in the stream as an unnamed reminder.
 */
export async function addImportantDate(
	deps: ImportantDateDeps,
	input: AddImportantDateInput
): Promise<string> {
	if (!IMPORTANT_DATE_KINDS.includes(input.kind)) {
		throw new InvalidImportantDateError(phrase('errors.date.unknownKind', { kind: input.kind }));
	}
	const date = input.date.trim();
	if (!DATE_SHAPE.test(date)) {
		throw new InvalidImportantDateError(phrase('errors.date.format'));
	}
	if (!isRealCalendarDay(date)) {
		throw new InvalidImportantDateError(phrase('errors.date.noSuchDay', { day: date }));
	}
	const label = orNull(input.label);
	if (input.kind === 'custom' && label === null) {
		throw new InvalidImportantDateError(phrase('errors.date.needsLabel'));
	}

	const now = deps.clock.now();
	const id = deps.ids.next();
	await deps.dates.insert({
		id,
		contactId: input.contactId,
		kind: input.kind,
		label,
		date,
		recursYearly: input.recursYearly ?? true,
		remind: input.remind ?? true,
		createdAt: now,
		updatedAt: now
	});
	return id;
}

/** List the important dates of a contact the viewer may see. */
export async function listImportantDates(
	deps: Pick<ImportantDateDeps, 'dates'>,
	viewer: Viewer,
	contactId: string
): Promise<ImportantDate[]> {
	return deps.dates.listForContactVisibleTo(viewer, contactId);
}

/**
 * Whether these explicit dates take over the birthday derived from the contact's birth date
 * (docs/02 §2.13.2). The same rule decides what the person page shows and what `upcomingDates`
 * keeps, so it is stated once here.
 */
export function overridesDerivedBirthday(dates: readonly Pick<ImportantDate, 'kind'>[]): boolean {
	return dates.some((d) => d.kind === 'birthday');
}

/**
 * Remove an important date. Anyone who sees the person may: a date is a household fact, not
 * anyone's authored record (docs/03 §3.7). A person the viewer does not see is refused with
 * `ContactGoneError`; a date already gone is not an error, so a second tap changes nothing.
 */
export async function removeImportantDate(
	deps: Pick<ImportantDateDeps, 'dates' | 'contacts'>,
	viewer: Viewer,
	input: { contactId: string; dateId: string }
): Promise<void> {
	if (!(await deps.contacts.findByIdVisibleTo(viewer, input.contactId))) {
		throw new ContactGoneError();
	}
	await deps.dates.remove(input.contactId, input.dateId);
}
