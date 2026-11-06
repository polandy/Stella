import { TranslatableError } from '../../../i18n/translatable';
import { phrase } from '../../../i18n/phrase';
import { deriveDisplayName } from '../../../people/display-name';
import { isKnownByMoreThanAFirstName } from '../../../people/new-person';
import { partialDateOfDay } from '../../../dates/partial-date';
import type {
	BirthDatePrecision,
	ContactCreator,
	ContactDeps,
	CreateContactInput,
	NewContact
} from './contacts';
import { checkedGender, orNull } from './profile';

/*
 * Adding a person by hand (docs/02 §2.2): the shown name derived, the birth date parsed, and
 * someone known by a first name alone refused (docs/02 §2.2.3).
 */

/** Thrown when a birth date is not a shape we can compute a birthday from. */
export class InvalidBirthDateError extends TranslatableError {
	constructor() {
		super(phrase('errors.contact.birthDateFormat'), 'InvalidBirthDateError');
	}
}

/** Parse an optional birth date into its stored value and precision. */
function parseBirthDate(value?: string | null): {
	birthDate: string | null;
	birthDatePrecision: BirthDatePrecision;
} {
	const trimmed = (value ?? '').trim();
	if (trimmed.length === 0) return { birthDate: null, birthDatePrecision: 'full' };
	// A birth date is entered as a full ISO day or a year-less `--MM-DD`.
	const date = partialDateOfDay(trimmed);
	if (!date) throw new InvalidBirthDateError();
	return { birthDate: date.value, birthDatePrecision: date.precision };
}

/**
 * Thrown when a person is being added by a first name alone: with no last name and no line to
 * know them by, they cannot be told from the next person of that name (docs/02 §2.2.3).
 */
export class NeedsSomethingToKnowThemByError extends TranslatableError {
	constructor() {
		super(phrase('errors.contact.needsSomethingToKnowThemBy'), 'NeedsSomethingToKnowThemByError');
	}
}

/**
 * Create a contact, deriving its display name and defaulting its visibility. Everyone added by
 * hand comes through here; imports write through their own adapters and keep what they carry.
 */
export async function createContact(
	deps: ContactDeps,
	creator: ContactCreator,
	input: CreateContactInput
): Promise<string> {
	const displayName = deriveDisplayName(input, creator.locale);
	if (!isKnownByMoreThanAFirstName(input)) throw new NeedsSomethingToKnowThemByError();
	const { birthDate, birthDatePrecision } = parseBirthDate(input.birthDate);
	const gender = checkedGender(input.gender);
	const now = deps.clock.now();
	const id = deps.ids.next();

	const contact: NewContact = {
		id,
		householdId: creator.householdId,
		createdBy: creator.userId,
		visibility: input.visibility ?? creator.defaultVisibility,
		displayName,
		firstName: orNull(input.firstName),
		lastName: orNull(input.lastName),
		nickname: orNull(input.nickname),
		description: orNull(input.description),
		howWeMet: orNull(input.howWeMet),
		metDate: orNull(input.metDate),
		metPlace: orNull(input.metPlace),
		birthDate,
		birthDatePrecision,
		gender,
		createdAt: now,
		updatedAt: now
	};

	await deps.contacts.insert(contact);
	return id;
}
