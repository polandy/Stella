import { describe, expect, it } from 'bun:test';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locales';
import { createTranslator } from '../../i18n/translate';
import { requireAdmin, requireUser, requireViewer } from './guards';
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
	role,
	locale: DEFAULT_LOCALE,
	selfContactId: null
});

/** The guards read only `user` off a request's locals, and the language to refuse in. */
type GuardLocals = Pick<App.Locals, 'user' | 'locale'>;
const locals = (user: AuthUser | null, locale: Locale = 'en'): GuardLocals => ({ user, locale });

function thrownBy(
	locals: GuardLocals,
	guard: (locals: GuardLocals) => unknown = requireAdmin
): unknown {
	try {
		guard(locals);
	} catch (e) {
		return e;
	}
	return null;
}

describe('requireAdmin', () => {
	it('returns the signed-in admin', () => {
		expect(requireAdmin(locals(user('admin')))).toMatchObject({ id: 'u1', role: 'admin' });
	});

	it('sends an anonymous visitor to the login page', () => {
		const e = thrownBy(locals(null));
		expect(isRedirect(e)).toBe(true);
		expect(e).toMatchObject({ status: 302, location: '/login' });
	});

	it('answers a signed-in member with 403 in their language instead of hiding the page', () => {
		for (const locale of ['en', 'de'] as const) {
			const e = thrownBy(locals(user('member'), locale));
			expect(isHttpError(e)).toBe(true);
			expect(e).toMatchObject({
				status: 403,
				body: { message: createTranslator(locale)('errors.admin.only') }
			});
		}
	});
});

describe('requireViewer', () => {
	it('returns only the identity an access decision needs', () => {
		expect(requireViewer(locals(user('member')))).toEqual({ id: 'u1', householdId: 'h1' });
	});

	it('sends an anonymous visitor to the login page', () => {
		const e = thrownBy(locals(null), requireViewer);
		expect(isRedirect(e)).toBe(true);
		expect(e).toMatchObject({ status: 302, location: '/login' });
	});
});

describe('requireUser', () => {
	it('returns the whole signed-in account, whatever its role', () => {
		expect(requireUser(locals(user('member')))).toMatchObject({ id: 'u1', role: 'member' });
	});

	it('sends an anonymous visitor to the login page', () => {
		const e = thrownBy(locals(null), requireUser);
		expect(isRedirect(e)).toBe(true);
		expect(e).toMatchObject({ status: 302, location: '/login' });
	});
});
