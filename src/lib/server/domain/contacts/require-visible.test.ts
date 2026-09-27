import { describe, expect, it } from 'bun:test';
import type { Contact } from './contacts';
import { ContactGoneError, onVisibleContact, requireVisibleContact } from './require-visible';

/*
 * Every addition on a person — a note, a call, a tag, a circle — first needs that person to be
 * one the author can see (docs/03 §3.7). Arriving from a phone days later, they may not be.
 */

const contacts = {
	findByIdVisibleTo: async (_v: unknown, id: string) => (id === 'julia' ? ({ id } as Contact) : null)
};
const author = { userId: 'u1', householdId: 'h1' };

describe('requireVisibleContact', () => {
	it('lets a visible person through and refuses anyone else', async () => {
		await expect(requireVisibleContact(contacts, author, 'julia')).resolves.toBeUndefined();
		await expect(requireVisibleContact(contacts, author, 'gone')).rejects.toBeInstanceOf(ContactGoneError);
	});
});

describe('onVisibleContact', () => {
	it('applies an addition only to a person the author can still see', async () => {
		const applied: string[] = [];
		const tag = onVisibleContact(contacts, async (_a, p: { contactId: string; name: string }) => {
			applied.push(`${p.contactId}:${p.name}`);
			return p.name;
		});
		expect(await tag(author, { contactId: 'julia', name: 'choir' })).toBe('choir');
		await expect(tag(author, { contactId: 'gone', name: 'choir' })).rejects.toBeInstanceOf(ContactGoneError);
		expect(applied).toEqual(['julia:choir']);
	});
});
