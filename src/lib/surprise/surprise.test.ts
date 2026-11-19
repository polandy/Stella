import { describe, expect, it } from 'bun:test';
import { SURPRISE, surpriseFromForm } from './surprise';

/* The form's three-way choice a gift and an outing share. */

describe('surpriseFromForm', () => {
	it('reads *Everyone but them* as shared and kept from the person', () => {
		expect(surpriseFromForm(SURPRISE)).toEqual({ visibility: 'shared', keptFromPerson: true });
	});

	it('reads *Private* as kept from nobody, since only a shared record can be a surprise', () => {
		expect(surpriseFromForm('private')).toEqual({ visibility: 'private', keptFromPerson: false });
	});

	it('reads *Shared*, anything else, or nothing as shared — the household default', () => {
		for (const chosen of ['shared', 'everyone', null])
			expect(surpriseFromForm(chosen)).toEqual({ visibility: 'shared', keptFromPerson: false });
	});
});
