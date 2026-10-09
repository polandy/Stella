import { describe, expect, it } from 'bun:test';
import { formOf } from '$lib/server/testing';
import { readPeopleAndRole } from './people-form';

/*
 * The pick the circle page posts to add people or re-role them (docs/02 §2.4.2): who was
 * chosen, and the role they are to take. A blank role reaches the use-case, which reads it as
 * none; nobody chosen is no pick at all.
 */

describe('readPeopleAndRole', () => {
	it('reads everyone chosen, in order, and the role trimmed', () => {
		const form = formOf({ contactId: ['anna', 'ben'], role: '  Alto  ' });
		expect(readPeopleAndRole(form)).toEqual({ contactIds: ['anna', 'ben'], role: 'Alto' });
	});

	it('hands a blank or missing role on as it came, for the use-case to read as none', () => {
		expect(readPeopleAndRole(formOf({ contactId: 'anna', role: '   ' }))).toEqual({
			contactIds: ['anna'],
			role: ''
		});
		expect(readPeopleAndRole(formOf({ contactId: 'anna' }))).toEqual({ contactIds: ['anna'] });
	});

	it('reads no pick when nobody was chosen, or a choice is blank', () => {
		for (const form of [
			formOf({ role: 'Alto' }),
			formOf({ contactId: ['anna', ''] }),
			formOf({ contactId: new File(['x'], 'x.txt') })
		]) {
			expect(readPeopleAndRole(form)).toBeNull();
		}
	});

	it('reads no pick when the role is not text', () => {
		expect(readPeopleAndRole(formOf({ contactId: 'anna', role: new File(['x'], 'x') }))).toBeNull();
	});
});
