import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { IMPORTANT_DATE_KINDS, type ImportantDateKind, type UpcomingSource } from './upcoming';

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
	/** Remove a date, scoped to its contact (the caller ensures the contact is visible). */
	remove(contactId: string, dateId: string): Promise<void>;
	/** Every date the viewer may see, explicit rows and derived birthdays alike. */
	listSourcesVisibleTo(viewer: Viewer): Promise<UpcomingSource[]>;
}

export interface ImportantDateDeps {
	dates: ImportantDateRepository;
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

/** Accepts a full ISO day or a year-less `--MM-DD`. */
const DATE_SHAPE = /^(\d{4}-\d{2}-\d{2}|--\d{2}-\d{2})$/;

/** Thrown when a date is malformed or its kind is unknown. */
export class InvalidImportantDateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidImportantDateError';
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
		throw new InvalidImportantDateError(`Unknown important date kind: ${input.kind}`);
	}
	const date = input.date.trim();
	if (!DATE_SHAPE.test(date)) {
		throw new InvalidImportantDateError('A date must be YYYY-MM-DD, or --MM-DD without a year.');
	}
	const label = orNull(input.label);
	if (input.kind === 'custom' && label === null) {
		throw new InvalidImportantDateError('Give the date a name so it means something later.');
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

/** Remove an important date from a contact the viewer may see. */
export async function removeImportantDate(
	deps: Pick<ImportantDateDeps, 'dates'>,
	contactId: string,
	dateId: string
): Promise<void> {
	await deps.dates.remove(contactId, dateId);
}
