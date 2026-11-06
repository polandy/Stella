import { TranslatableError } from '../../../i18n/translatable';
import { phrase } from '../../../i18n/phrase';
import type { Viewer } from '../../access/visibility';
import { isGender, type Gender } from '../../../people/gender';
import { JOB_FIELD_MAX_LENGTH, type Job } from '../../../people/job';
import type { ContactDeps } from './contacts';

/*
 * Edits to a contact's profile in place (docs/02 §2.2): description, gender and job. Each one
 * reads the contact through the viewer first, so a hidden one answers like a missing one.
 */

/** A field as typed, trimmed, or null when nothing is left. */
export const orNull = (value?: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** Thrown when a gender is not one of the three Stella records (docs/02 §2.2). */
export class InvalidGenderError extends TranslatableError {
	constructor() {
		super(phrase('errors.contact.invalidGender'), 'InvalidGenderError');
	}
}

/** A gender as given, or none; anything but the three is refused rather than stored. */
export function checkedGender(gender: Gender | null | undefined): Gender | null {
	if (gender === null || gender === undefined) return null;
	if (!isGender(gender)) throw new InvalidGenderError();
	return gender;
}

/** Thrown when an edit would leave a contact with no name at all; the edge shows it to whoever typed the blank. */
export class EmptyContactNameError extends TranslatableError {
	constructor() {
		super(phrase('errors.contact.emptyName'), 'EmptyContactNameError');
	}
}

/** What the hero's description edit sends (docs/02 §2.2); the name has its own editor. */
export interface ProfileEdit {
	description: string | null;
}

/**
 * Reword a contact's description, in place; the name is kept as stored — renaming goes through
 * `editNameParts`, so there is one way to do it. Returns false when the contact is not visible
 * to the viewer, so a route answers 404 the same way it does for a missing one — the visibility
 * check is the read, exactly as everywhere else (docs/03 §3.7).
 */
export async function editProfile(
	deps: Pick<ContactDeps, 'contacts' | 'clock'>,
	viewer: Viewer,
	id: string,
	edit: ProfileEdit
): Promise<boolean> {
	const contact = await deps.contacts.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	// No name in the write: one read before it would put back a name renamed meanwhile.
	return deps.contacts.updateProfile(viewer, id, {
		description: orNull(edit.description),
		updatedAt: deps.clock.now()
	});
}

/**
 * Record a person's gender, or take it off the record with null (docs/02 §2.2). Returns false
 * when the contact is not visible to the viewer, like `editProfile`.
 */
export async function setGender(
	deps: Pick<ContactDeps, 'contacts' | 'clock'>,
	viewer: Viewer,
	id: string,
	gender: Gender | null
): Promise<boolean> {
	const checked = checkedGender(gender);
	const contact = await deps.contacts.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	return deps.contacts.setGender(viewer, id, checked, deps.clock.now());
}

/** Thrown when a job title or company is longer than Stella keeps (docs/02 §2.2). */
export class JobFieldTooLongError extends TranslatableError {
	constructor() {
		super(
			phrase('errors.contact.jobFieldTooLong', { max: JOB_FIELD_MAX_LENGTH }),
			'JobFieldTooLongError'
		);
	}
}

/** One job field trimmed, a blank one as null; longer than Stella keeps is refused, not cut. */
function checkedJobField(value: string | null): string | null {
	const trimmed = orNull(value);
	if (trimmed !== null && trimmed.length > JOB_FIELD_MAX_LENGTH) throw new JobFieldTooLongError();
	return trimmed;
}

/**
 * Record what a person does and where, from the profile card's one editor (docs/02 §2.2): both
 * fields at once, each trimmed, an emptied one taken off the record. Returns false when the
 * contact is not visible to the viewer, like `editProfile`.
 */
export async function setJob(
	deps: Pick<ContactDeps, 'contacts' | 'clock'>,
	viewer: Viewer,
	id: string,
	job: Job
): Promise<boolean> {
	const checked: Job = {
		jobTitle: checkedJobField(job.jobTitle),
		company: checkedJobField(job.company)
	};
	const contact = await deps.contacts.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	return deps.contacts.setJob(viewer, id, checked, deps.clock.now());
}

export class EmptyDescriptionError extends TranslatableError {
	constructor() {
		super(phrase('errors.contact.emptyDescription'), 'EmptyDescriptionError');
	}
}

/**
 * Give someone a description and nothing else — the clean-up list's one field, for people
 * known by a first name only (docs/02 §2.2.3). Their name stays as it is. Returns false when
 * the contact is not visible to the viewer, like `editProfile`.
 */
export async function describeContact(
	deps: Pick<ContactDeps, 'contacts' | 'clock'>,
	viewer: Viewer,
	id: string,
	description: string
): Promise<boolean> {
	const written = description.trim();
	if (written.length === 0) throw new EmptyDescriptionError();

	const contact = await deps.contacts.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	return deps.contacts.updateProfile(viewer, id, {
		description: written,
		updatedAt: deps.clock.now()
	});
}
