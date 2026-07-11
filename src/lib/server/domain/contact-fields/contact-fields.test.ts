import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import {
	addContactField,
	fieldHref,
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
	const repo: ContactFieldRepository = {
		insert: async (f) => {
			inserted = f;
		},
		listForContactVisibleTo: async () => [],
		remove: async () => {}
	};
	return {
		repo,
		get inserted() {
			return inserted;
		}
	};
}

const deps = (repo: ContactFieldRepository) => ({ fields: repo, ids: idGen('field-1'), clock });

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
