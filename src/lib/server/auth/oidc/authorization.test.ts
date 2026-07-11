import { describe, expect, it } from 'bun:test';
import { isAuthorized, mapRole } from './authorization';

/*
 * Group→role mapping and the sign-in authorization gate (docs/02 §2.1.2). Pure functions.
 */

describe('mapRole', () => {
	it('grants admin when a group is in the admin set', () => {
		expect(mapRole(['stella-users', 'stella-admins'], ['stella-admins'])).toBe('admin');
	});

	it('defaults to member without an admin group', () => {
		expect(mapRole(['stella-users'], ['stella-admins'])).toBe('member');
		expect(mapRole([], [])).toBe('member');
	});
});

describe('isAuthorized', () => {
	it('allows any authenticated user when no gates are configured', () => {
		expect(isAuthorized({ groups: [], email: 'a@x.test' }, { allowedGroups: [], allowedEmails: [] })).toBe(true);
	});

	it('enforces the allowed-groups gate', () => {
		const policy = { allowedGroups: ['stella-users'], allowedEmails: [] };
		expect(isAuthorized({ groups: ['stella-users'], email: null }, policy)).toBe(true);
		expect(isAuthorized({ groups: ['other'], email: null }, policy)).toBe(false);
	});

	it('enforces the email allowlist case-insensitively', () => {
		const policy = { allowedGroups: [], allowedEmails: ['Andy@Example.test'] };
		expect(isAuthorized({ groups: [], email: 'andy@example.test' }, policy)).toBe(true);
		expect(isAuthorized({ groups: [], email: 'someone@example.test' }, policy)).toBe(false);
		expect(isAuthorized({ groups: [], email: null }, policy)).toBe(false);
	});

	it('requires both gates when both are configured', () => {
		const policy = { allowedGroups: ['stella-users'], allowedEmails: ['andy@example.test'] };
		expect(isAuthorized({ groups: ['stella-users'], email: 'andy@example.test' }, policy)).toBe(true);
		expect(isAuthorized({ groups: ['stella-users'], email: 'other@example.test' }, policy)).toBe(false);
	});
});
