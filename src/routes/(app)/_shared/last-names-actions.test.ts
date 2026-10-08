import { describe, expect, it } from 'bun:test';
import { fail, isActionFailure, isHttpError } from '@sveltejs/kit';
import { createTranslator } from '$lib/i18n/translate';
import type { Viewer } from '$lib/server/access/visibility';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import type { NameWrite } from '$lib/server/domain/contacts/name-parts';
import { setLastNamesFromForm, type LastNameServices } from './last-names-actions';

/*
 * The one action behind every path that gives several people a last name (docs/02 §2.2.4).
 * `setLastNames` has its own suite; pinned here is the edge's part — the form read, which
 * failure becomes a form message and which a 404 — against a fake of the one port it writes.
 */

const t = createTranslator('en');
const viewer: Viewer = { id: 'u1', householdId: 'h1' };

const person = (id: string, firstName: string, lastName: string | null) =>
	({
		id,
		firstName,
		lastName,
		nickname: null,
		displayName: firstName,
		visibility: 'shared'
	}) as Contact;

const form = (lastName: string, contactIds: string[], replaceIds: string[] = []) => {
	const data = new FormData();
	data.set('lastName', lastName);
	for (const id of contactIds) data.append('contactId', id);
	for (const id of replaceIds) data.append('replaceId', id);
	return data;
};

function fakes(visible: Contact[]) {
	const written: NameWrite[][] = [];
	const people: LastNameServices = {
		lastNameDeps: {
			names: {
				findByIdVisibleTo: async (_v, id) => visible.find((c) => c.id === id) ?? null,
				writeNames: async (writes) => {
					written.push([...writes]);
				}
			},
			ids: { next: () => 'id-1' },
			clock: { now: () => 42 }
		}
	};
	return { people, written };
}

const lea = person('lea', 'Lea', null);
const max = person('max', 'Max', 'Muster');

describe('setLastNamesFromForm', () => {
	it('gives every listed person the name and says how many', async () => {
		const f = fakes([lea]);
		const result = await setLastNamesFromForm(f.people, viewer, form('Brunner', ['lea']), 'en', t);
		expect(result).toEqual({ lastNamesSet: 1 });
		expect(f.written[0]?.map((w) => w.lastName)).toEqual(['Brunner']);
	});

	it('replaces a last name only where it was ticked to', async () => {
		const f = fakes([max]);
		const result = await setLastNamesFromForm(
			f.people,
			viewer,
			form('Brunner', ['max'], ['max']),
			'en',
			t
		);
		expect(result).toEqual({ lastNamesSet: 1 });
	});

	it('refuses a blank name as a form message', async () => {
		const f = fakes([lea]);
		const result = await setLastNamesFromForm(f.people, viewer, form('  ', ['lea']), 'en', t);
		expect(result).toEqual(fail(400, { lastNamesError: t('errors.contact.emptyLastName') }));
	});

	it('refuses to overwrite a name nobody ticked, and writes nothing', async () => {
		const f = fakes([lea, max]);
		const result = await setLastNamesFromForm(
			f.people,
			viewer,
			form('Brunner', ['lea', 'max']),
			'en',
			t
		);
		expect(isActionFailure(result) && result.status).toBe(400);
		expect(f.written).toEqual([]);
	});

	it('answers 404 when one of the people is not visible', async () => {
		const f = fakes([lea]);
		const thrown = await setLastNamesFromForm(
			f.people,
			viewer,
			form('Brunner', ['lea', 'ghost']),
			'en',
			t
		).catch((err: unknown) => err);
		expect(isHttpError(thrown, 404)).toBe(true);
		expect(f.written).toEqual([]);
	});
});
