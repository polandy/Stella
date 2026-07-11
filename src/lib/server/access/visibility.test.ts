import { describe, expect, it } from 'bun:test';
import {
	canViewChildRecord,
	canViewContact,
	canViewRelationship,
	type ChildRecordAccess,
	type ContactAccess,
	type Viewer
} from './visibility';

/*
 * Behavior specification for the central access-control rules (docs/03 §3.7).
 * These are pure functions — no DB, no DI. They are the single source of truth
 * for "who may see what"; every query is filtered through them.
 */

const HOUSEHOLD = 'household-1';
const OTHER_HOUSEHOLD = 'household-2';
const OWNER = 'user-owner';
const OTHER_MEMBER = 'user-other';

const viewerOwner: Viewer = { id: OWNER, householdId: HOUSEHOLD };
const viewerOther: Viewer = { id: OTHER_MEMBER, householdId: HOUSEHOLD };
const viewerForeign: Viewer = { id: 'user-foreign', householdId: OTHER_HOUSEHOLD };

function contact(overrides: Partial<ContactAccess> = {}): ContactAccess {
	return {
		householdId: HOUSEHOLD,
		ownerId: OWNER,
		visibility: 'shared',
		...overrides
	};
}

function childOn(parent: ContactAccess, overrides: Partial<ChildRecordAccess> = {}): ChildRecordAccess {
	return {
		ownerId: OWNER,
		visibility: 'shared',
		contact: parent,
		...overrides
	};
}

describe('canViewContact', () => {
	it('lets any household member see a shared contact', () => {
		const shared = contact({ visibility: 'shared' });
		expect(canViewContact(viewerOwner, shared)).toBe(true);
		expect(canViewContact(viewerOther, shared)).toBe(true);
	});

	it('lets the owner see their private contact', () => {
		const priv = contact({ visibility: 'private', ownerId: OWNER });
		expect(canViewContact(viewerOwner, priv)).toBe(true);
	});

	it('hides a private contact from other household members (admins get no exception)', () => {
		const priv = contact({ visibility: 'private', ownerId: OWNER });
		expect(canViewContact(viewerOther, priv)).toBe(false);
	});

	it('hides any contact from members of a different household', () => {
		const shared = contact({ visibility: 'shared' });
		expect(canViewContact(viewerForeign, shared)).toBe(false);
	});
});

describe('canViewChildRecord (note / photo / interaction)', () => {
	it('shows a shared child on a shared contact to any household member', () => {
		const record = childOn(contact({ visibility: 'shared' }), { visibility: 'shared' });
		expect(canViewChildRecord(viewerOther, record)).toBe(true);
	});

	it('shows a private child only to its author, even on a shared contact', () => {
		const record = childOn(contact({ visibility: 'shared' }), {
			visibility: 'private',
			ownerId: OWNER
		});
		expect(canViewChildRecord(viewerOwner, record)).toBe(true);
		expect(canViewChildRecord(viewerOther, record)).toBe(false);
	});

	it('hides every child of a private contact from non-owners, regardless of child visibility', () => {
		const privateContact = contact({ visibility: 'private', ownerId: OWNER });
		const sharedChild = childOn(privateContact, { visibility: 'shared', ownerId: OWNER });
		expect(canViewChildRecord(viewerOther, sharedChild)).toBe(false);
		// ...but the owner of the private contact still sees it.
		expect(canViewChildRecord(viewerOwner, sharedChild)).toBe(true);
	});
});

describe('canViewRelationship', () => {
	it('is visible when both endpoints are visible', () => {
		const from = contact({ visibility: 'shared' });
		const to = contact({ visibility: 'shared' });
		expect(canViewRelationship(viewerOther, { from, to })).toBe(true);
	});

	it('is hidden when one endpoint is a private contact the viewer cannot see', () => {
		const from = contact({ visibility: 'shared' });
		const to = contact({ visibility: 'private', ownerId: OWNER });
		expect(canViewRelationship(viewerOther, { from, to })).toBe(false);
	});

	it('is visible to the owner of a private endpoint', () => {
		const from = contact({ visibility: 'shared' });
		const to = contact({ visibility: 'private', ownerId: OWNER });
		expect(canViewRelationship(viewerOwner, { from, to })).toBe(true);
	});
});
