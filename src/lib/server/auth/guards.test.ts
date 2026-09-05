import { describe, expect, it } from 'bun:test';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { requireAdmin } from './guards';
import type { AuthUser } from './accounts';

/*
 * Admin-only surfaces (docs/02 §2.16 import, §2.17 "Data") — the guard every such route calls.
 * Both failure paths are asserted, and the admin path proves the guard can pass at all.
 */

const user = (role: AuthUser['role']): AuthUser => ({
	id: 'u1',
	householdId: 'h1',
	email: 'p@example.org',
	name: 'P',
	role
});

function thrownBy(locals: App.Locals): unknown {
	try {
		requireAdmin(locals);
	} catch (e) {
		return e;
	}
	return null;
}

describe('requireAdmin', () => {
	it('returns the signed-in admin', () => {
		expect(requireAdmin({ user: user('admin') })).toMatchObject({ id: 'u1', role: 'admin' });
	});

	it('sends an anonymous visitor to the login page', () => {
		const e = thrownBy({ user: null });
		expect(isRedirect(e)).toBe(true);
		expect(e).toMatchObject({ status: 302, location: '/login' });
	});

	it('answers a signed-in member with 403 instead of hiding the page', () => {
		const e = thrownBy({ user: user('member') });
		expect(isHttpError(e)).toBe(true);
		expect(e).toMatchObject({ status: 403 });
	});
});
