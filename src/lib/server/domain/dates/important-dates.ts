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

/** A full ISO day, or a year-less `--MM-DD`. */
const DATE_SHAPE = /^(?:(\d{4})-(\d{2})-(\d{2})|--(\d{2})-(\d{2}))$/;

/**
 * A shape check is not enough: `--02-30` and `--99-99` both match it, and the date maths
 * downstream would silently roll them into some other day rather than refuse them. A
 * year-less date is validated against a leap year so 29 February stays legal.
 */
function isRealCalendarDay(value: string): boolean {
	const m = DATE_SHAPE.exec(value);
	if (!m) return false;
	const year = m[1] ? Number(m[1]) : 2000;
	const month = Number(m[2] ?? m[4]);
	const day = Number(m[3] ?? m[5]);
	if (month < 1 || month > 12 || day < 1) return false;
	const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return day <= lastDayOfMonth;
}

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
	if (!isRealCalendarDay(date)) {
		throw new InvalidImportantDateError(`There is no such day in the calendar: ${date}.`);
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

/**
 * Whether these explicit dates take over the birthday derived from the contact's birth date
 * (docs/02 §2.13.2). The same rule decides what the person page shows and what `upcomingDates`
 * keeps, so it is stated once here.
 */
export function overridesDerivedBirthday(dates: readonly Pick<ImportantDate, 'kind'>[]): boolean {
	return dates.some((d) => d.kind === 'birthday');
}

/** Remove an important date from a contact the viewer may see. */
export async function removeImportantDate(
	deps: Pick<ImportantDateDeps, 'dates'>,
	contactId: string,
	dateId: string
): Promise<void> {
	await deps.dates.remove(contactId, dateId);
}
