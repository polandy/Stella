import { describe, expect, it } from 'bun:test';
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { answerOf, formOf, MEMBER, routeEvent } from '.';

/*
 * The fake request event route tests hand a load or an action (docs/08 §8.5), and the one
 * reading of what the edge answered — data, a `fail`, a redirect or an `error`.
 */

describe('routeEvent', () => {
	it('signs a member in, in English, unless the test says otherwise', () => {
		const event = routeEvent<RequestEvent>({ services: {} });
		expect(event.locals.user).toEqual(MEMBER);
		expect(event.locals.locale).toBe('en');
		expect(routeEvent<RequestEvent>({ services: {}, user: null }).locals.user).toBeNull();
	});

	it('posts the form it was given, and carries the params and the address', async () => {
		const event = routeEvent<RequestEvent>({
			services: {},
			params: { id: 'anna' },
			url: '/contacts/anna?propose=x',
			form: formOf({ name: 'Anna', pick: ['a', 'b'] })
		});
		const posted = await event.request.formData();
		expect([posted.get('name'), posted.getAll('pick')]).toEqual(['Anna', ['a', 'b']]);
		expect(event.params).toEqual({ id: 'anna' });
		expect(event.url.searchParams.get('propose')).toBe('x');
	});

	it('hands over the services the test gave, and fails loud on any other', () => {
		const contactDeps = { contacts: {} } as never;
		const event = routeEvent<RequestEvent>({ services: { people: { contactDeps }, immich: null } });
		expect(event.locals.services.people.contactDeps).toBe(contactDeps);
		expect(event.locals.services.immich).toBeNull();
		expect(() => event.locals.services.gifts).toThrow(
			'locals.services.gifts was not expected in this test'
		);
		expect(() => event.locals.services.people.contactNameDeps).toThrow(
			'locals.services.people.contactNameDeps was not expected in this test'
		);
	});
});

describe('formOf', () => {
	it('repeats a field given a list, and keeps a file a file', () => {
		const photo = new File([new Uint8Array([1])], 'a.webp');
		const form = formOf({ id: ['1', '2'], image: photo });
		expect(form.getAll('id')).toEqual(['1', '2']);
		expect(form.get('image')).toBeInstanceOf(File);
	});
});

describe('answerOf', () => {
	it('reads what the edge returned as data', async () => {
		expect(await answerOf(Promise.resolve({ ok: 1 }))).toEqual({ kind: 'data', data: { ok: 1 } });
	});

	it('reads a fail with its status and data', async () => {
		expect(await answerOf(Promise.resolve(fail(409, { error: 'no' })))).toEqual({
			kind: 'fail',
			status: 409,
			data: { error: 'no' }
		});
	});

	it('reads a thrown redirect and a thrown error', async () => {
		const redirecting = async () => redirect(303, '/somewhere');
		const refusing = async () => error(404, 'Not found');
		expect(await answerOf(redirecting())).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/somewhere'
		});
		expect(await answerOf(refusing())).toEqual({
			kind: 'error',
			status: 404,
			message: 'Not found'
		});
	});

	it('lets anything else through, as the edge would', async () => {
		const breaking = async () => {
			throw new Error('ours');
		};
		await expect(answerOf(breaking())).rejects.toThrow('ours');
	});
});
