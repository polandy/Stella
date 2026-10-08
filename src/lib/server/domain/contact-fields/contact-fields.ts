import { CONTACT_FIELD_KINDS, type ContactFieldKind } from '../../../people/contact-fields';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';

/*
 * Contact field use-cases (docs/02 §2.3). Fields are child records of a contact and have
 * no visibility of their own — they inherit the contact's, enforced by the adapter's
 * visibility-scoped reads. Orchestration and link derivation are pure.
 */

/** A clickable link for a field, or null when the kind has no natural action. */
export function fieldHref(kind: ContactFieldKind, value: string): string | null {
	const trimmed = value.trim();
	switch (kind) {
		case 'phone':
			return `tel:${trimmed.replace(/[^+\d]/g, '')}`;
		case 'email':
			return `mailto:${trimmed}`;
		case 'url':
			return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
		case 'address':
			return `https://www.openstreetmap.org/search?query=${encodeURIComponent(trimmed)}`;
		default:
			return null;
	}
}

export interface NewContactField {
	id: string;
	contactId: string;
	kind: ContactFieldKind;
	label: string | null;
	value: string;
	meta: string | null;
	sortOrder: number;
	createdAt: number;
	updatedAt: number;
}

export interface ContactField extends NewContactField {}

export interface ContactFieldRepository {
	insert(field: NewContactField): Promise<void>;
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<ContactField[]>;
	/** Remove a field, scoped to its contact (the caller ensures the contact is visible). */
	remove(contactId: string, fieldId: string): Promise<void>;
	/** Rewrite a field's label and value, scoped to its contact (the caller checked it is visible). */
	update(
		contactId: string,
		fieldId: string,
		change: { label: string | null; value: string; updatedAt: number }
	): Promise<void>;
}

export interface ContactFieldDeps {
	fields: ContactFieldRepository;
	ids: IdGenerator;
	clock: Clock;
}

export interface AddContactFieldInput {
	contactId: string;
	kind: ContactFieldKind;
	label?: string | null;
	value: string;
	meta?: string | null;
	sortOrder?: number;
}

const orNull = (value?: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** Add a contact field. The caller must have verified the contact is visible. */
export async function addContactField(
	deps: ContactFieldDeps,
	input: AddContactFieldInput
): Promise<string> {
	if (!CONTACT_FIELD_KINDS.includes(input.kind)) {
		throw new Error(`Unknown contact field kind: ${input.kind}`);
	}
	const value = input.value.trim();
	if (value.length === 0) {
		throw new Error('A contact field needs a value.');
	}

	const now = deps.clock.now();
	const id = deps.ids.next();
	await deps.fields.insert({
		id,
		contactId: input.contactId,
		kind: input.kind,
		label: orNull(input.label),
		value,
		meta: orNull(input.meta),
		sortOrder: input.sortOrder ?? 0,
		createdAt: now,
		updatedAt: now
	});
	return id;
}

/**
 * Rewrite a field where it is read — the identity card's address (docs/02 §2.2). The kind
 * stays: a phone does not become an address by being edited. An empty value is refused, since
 * taking a field off is removing it, which has its own undo. The caller must have verified the
 * contact is visible.
 */
export async function editContactField(
	deps: Pick<ContactFieldDeps, 'fields' | 'clock'>,
	input: { contactId: string; fieldId: string; label: string | null; value: string }
): Promise<void> {
	const value = input.value.trim();
	if (value.length === 0) throw new Error('A contact field needs a value.');
	await deps.fields.update(input.contactId, input.fieldId, {
		label: orNull(input.label),
		value,
		updatedAt: deps.clock.now()
	});
}

/** List the fields of a contact the viewer may see. */
export async function listContactFields(
	deps: Pick<ContactFieldDeps, 'fields'>,
	viewer: Viewer,
	contactId: string
): Promise<ContactField[]> {
	return deps.fields.listForContactVisibleTo(viewer, contactId);
}
