import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { Contact } from '../contacts/contacts';
import { ContactGoneError } from '../contacts/require-visible';
import {
	addContactField,
	editContactField,
	fieldHref,
	removeContactField,
	type ContactFieldRepository,
	type NewContactField
} from './contact-fields';

/*
 * Contact fields (docs/02 §2.3): repeatable contact methods. Pure link derivation
 * (tap-to-call/mail/map) and the addContactField use-case, tested with fakes.
 */

describe('fieldHref', () => {
	it('builds a tel: link, stripping formatting', () => {
		expect(fieldHref('phone', '+41 79 123 45 67')).toBe('tel:+41791234567');
	});

	it('builds a mailto: link', () => {
		expect(fieldHref('email', 'andy@example.test')).toBe('mailto:andy@example.test');
	});

	it('ensures a scheme for url fields', () => {
		expect(fieldHref('url', 'example.test')).toBe('https://example.test');
		expect(fieldHref('url', 'http://example.test')).toBe('http://example.test');
	});

	it('builds a map search link for addresses', () => {
		expect(fieldHref('address', 'Bahnhofstrasse 1, Zürich')).toContain(
			'openstreetmap.org/search?query=Bahnhofstrasse'
		);
	});

	it('returns null for kinds without a natural link', () => {
		expect(fieldHref('social', '@handle')).toBeNull();
		expect(fieldHref('custom', 'anything')).toBeNull();
	});
});

const NOW = 1_700_000_000_000;
const clock: Clock = { now: () => NOW };
const idGen = (v: string): IdGenerator => ({ next: () => v });

function fakeRepo() {
	let inserted: NewContactField | null = null;
	const updates: unknown[] = [];
	const removed: { contactId: string; fieldId: string }[] = [];
	const repo: ContactFieldRepository = {
		insert: async (f) => {
			inserted = f;
		},
		listForContactVisibleTo: async () => [],
		remove: async (contactId, fieldId) => {
			removed.push({ contactId, fieldId });
		},
		update: async (contactId, fieldId, change) => {
			updates.push({ contactId, fieldId, ...change });
		}
	};
	return {
		repo,
		get inserted() {
			return inserted;
		},
		updates,
		removed
	};
}

/** Only `contact-1` is a person the viewer sees. */
const contacts = {
	findByIdVisibleTo: async (_viewer: unknown, id: string) =>
		id === 'contact-1' ? ({ id } as Contact) : null
};
const viewer = { id: 'u1', householdId: 'h1' };

const deps = (repo: ContactFieldRepository) => ({
	fields: repo,
	contacts,
	ids: idGen('field-1'),
	clock
});

describe('addContactField', () => {
	it('persists a field with a normalised label and timestamps', async () => {
		const f = fakeRepo();
		const id = await addContactField(deps(f.repo), {
			contactId: 'contact-1',
			kind: 'phone',
			label: '  Mobile  ',
			value: '+41 79 123 45 67'
		});
		expect(id).toBe('field-1');
		expect(f.inserted).toMatchObject({
			id: 'field-1',
			contactId: 'contact-1',
			kind: 'phone',
			label: 'Mobile',
			value: '+41 79 123 45 67',
			createdAt: NOW
		});
	});

	it('rejects an empty value', async () => {
		const f = fakeRepo();
		await expect(
			addContactField(deps(f.repo), { contactId: 'c', kind: 'email', value: '   ' })
		).rejects.toThrow();
	});

	it('rejects an unknown kind', async () => {
		const f = fakeRepo();
		await expect(
			// @ts-expect-error testing runtime guard against an invalid kind
			addContactField(deps(f.repo), { contactId: 'c', kind: 'telepathy', value: 'x' })
		).rejects.toThrow();
	});
});

describe('editContactField', () => {
	it('rewrites the label and value, trimmed, a blank label as none', async () => {
		const f = fakeRepo();
		await editContactField(deps(f.repo), {
			contactId: 'contact-1',
			fieldId: 'field-1',
			label: '   ',
			value: '  Thunstrasse 12\n3074 Muri  '
		});
		expect(f.updates).toEqual([
			{
				contactId: 'contact-1',
				fieldId: 'field-1',
				label: null,
				value: 'Thunstrasse 12\n3074 Muri',
				updatedAt: NOW
			}
		]);
	});

	it('refuses an empty value: taking a field off is removing it', async () => {
		const f = fakeRepo();
		await expect(
			editContactField(deps(f.repo), { contactId: 'c', fieldId: 'f', label: null, value: ' ' })
		).rejects.toThrow();
		expect(f.updates).toEqual([]);
	});
});

describe('removeContactField', () => {
	it('scopes the delete to the contact it belongs to', async () => {
		const f = fakeRepo();
		await removeContactField(deps(f.repo), viewer, { contactId: 'contact-1', fieldId: 'field-1' });
		expect(f.removed).toEqual([{ contactId: 'contact-1', fieldId: 'field-1' }]);
	});

	it('refuses a person the viewer does not see, removing nothing', async () => {
		const f = fakeRepo();
		await expect(
			removeContactField(deps(f.repo), viewer, { contactId: 'hidden', fieldId: 'field-1' })
		).rejects.toBeInstanceOf(ContactGoneError);
		expect(f.removed).toEqual([]);
	});
});
