import { describe, expect, it } from 'bun:test';
import {
	canViewActivity,
	canViewChildRecord,
	canViewCirclePhoto,
	canViewContact,
	canViewRelationship,
	canEditAuthored,
	canRemoveAuthored,
	canRemoveCirclePhoto,
	type ChildRecordAccess,
	type ContactAccess,
	type Remover,
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

function childOn(
	parent: ContactAccess,
	overrides: Partial<ChildRecordAccess> = {}
): ChildRecordAccess {
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

describe('canViewCirclePhoto', () => {
	const circle = (visibility: 'shared' | 'private', ownerId = OWNER) => ({
		householdId: HOUSEHOLD,
		ownerId,
		visibility
	});

	it('shows a shared photo of a shared circle to the whole household', () => {
		expect(
			canViewCirclePhoto(viewerOther, {
				ownerId: OWNER,
				visibility: 'shared',
				circle: circle('shared')
			})
		).toBe(true);
	});

	it('shows a private photo only to whoever added it', () => {
		const photo = { ownerId: OWNER, visibility: 'private' as const, circle: circle('shared') };
		expect(canViewCirclePhoto(viewerOwner, photo)).toBe(true);
		expect(canViewCirclePhoto(viewerOther, photo)).toBe(false);
	});

	it('hides every photo of a private circle from everyone but its owner', () => {
		const photo = {
			ownerId: OTHER_MEMBER,
			visibility: 'shared' as const,
			circle: circle('private')
		};
		expect(canViewCirclePhoto(viewerOther, photo)).toBe(false);
		expect(canViewCirclePhoto(viewerOwner, photo)).toBe(true);
	});

	it('never crosses households', () => {
		const foreign = { householdId: OTHER_HOUSEHOLD, ownerId: OWNER, visibility: 'shared' as const };
		expect(
			canViewCirclePhoto(viewerOwner, { ownerId: OWNER, visibility: 'shared', circle: foreign })
		).toBe(false);
	});
});

describe('canViewActivity', () => {
	const entry = (visibility: 'shared' | 'private', householdId = HOUSEHOLD) => ({
		householdId,
		actorId: OWNER,
		visibility
	});

	it('shows a shared entry to the whole household', () => {
		expect(canViewActivity(viewerOther, entry('shared'))).toBe(true);
	});

	it('shows a private entry only to whoever did it', () => {
		expect(canViewActivity(viewerOwner, entry('private'))).toBe(true);
		expect(canViewActivity(viewerOther, entry('private'))).toBe(false);
	});

	it('never crosses households', () => {
		expect(canViewActivity(viewerForeign, entry('shared'))).toBe(false);
		expect(canViewActivity(viewerOwner, entry('shared', OTHER_HOUSEHOLD))).toBe(false);
	});
});

describe('canRemoveAuthored (docs/03 §3.7: author always, admin on a shared record)', () => {
	const author: Remover = { ...viewerOwner, isAdmin: false };
	const admin: Remover = { ...viewerOther, isAdmin: true };
	const member: Remover = { ...viewerOther, isAdmin: false };
	const foreignAdmin: Remover = { ...viewerForeign, isAdmin: true };
	const shared = childOn(contact());
	const priv = childOn(contact(), { visibility: 'private' });

	it('lets the author remove their record, shared or private', () => {
		expect(canRemoveAuthored(author, shared)).toBe(true);
		expect(canRemoveAuthored(author, priv)).toBe(true);
	});

	it("lets an admin remove another member's shared record", () => {
		expect(canRemoveAuthored(admin, shared)).toBe(true);
	});

	it("gives an admin nothing on another member's private record", () => {
		expect(canRemoveAuthored(admin, priv)).toBe(false);
	});

	it("refuses a member on someone else's shared record", () => {
		expect(canRemoveAuthored(member, shared)).toBe(false);
		expect(canRemoveAuthored(member, childOn(contact(), { ownerId: OTHER_MEMBER }))).toBe(true);
	});

	it('refuses an admin of another household', () => {
		expect(canRemoveAuthored(foreignAdmin, shared)).toBe(false);
	});

	it('refuses an admin on a shared record under a contact they cannot see', () => {
		const hidden = childOn(contact({ visibility: 'private' }));
		expect(canRemoveAuthored(admin, hidden)).toBe(false);
		expect(canRemoveAuthored(author, hidden)).toBe(true);
	});
});

describe('canRemoveCirclePhoto (docs/03 §3.7: author always, admin on a shared photo)', () => {
	const author: Remover = { ...viewerOwner, isAdmin: false };
	const admin: Remover = { ...viewerOther, isAdmin: true };
	const member: Remover = { ...viewerOther, isAdmin: false };
	const foreignAdmin: Remover = { ...viewerForeign, isAdmin: true };
	const circle = (visibility: 'shared' | 'private', ownerId = OWNER) => ({
		householdId: HOUSEHOLD,
		ownerId,
		visibility
	});
	const shared = { ownerId: OWNER, visibility: 'shared' as const, circle: circle('shared') };
	const priv = { ...shared, visibility: 'private' as const };

	it('lets whoever added the photo remove it, shared or private', () => {
		expect(canRemoveCirclePhoto(author, shared)).toBe(true);
		expect(canRemoveCirclePhoto(author, priv)).toBe(true);
	});

	it("lets an admin remove another member's shared photo", () => {
		expect(canRemoveCirclePhoto(admin, shared)).toBe(true);
	});

	it("gives an admin nothing on another member's private photo", () => {
		expect(canRemoveCirclePhoto(admin, priv)).toBe(false);
	});

	it("refuses a member on someone else's shared photo", () => {
		expect(canRemoveCirclePhoto(member, shared)).toBe(false);
	});

	it('refuses an admin of another household', () => {
		expect(canRemoveCirclePhoto(foreignAdmin, shared)).toBe(false);
	});

	it('refuses an admin on a shared photo of a private circle they cannot see', () => {
		const hidden = { ...shared, circle: circle('private') };
		expect(canRemoveCirclePhoto(admin, hidden)).toBe(false);
		expect(canRemoveCirclePhoto(author, hidden)).toBe(true);
	});
});

describe('canEditAuthored (docs/03 §3.7: the author only)', () => {
	const author: Viewer = viewerOwner;
	const admin: Remover = { ...viewerOther, isAdmin: true };
	const shared = childOn(contact());
	const priv = childOn(contact(), { visibility: 'private' });

	it('lets the author edit their record, shared or private', () => {
		expect(canEditAuthored(author, shared)).toBe(true);
		expect(canEditAuthored(author, priv)).toBe(true);
	});

	it("refuses an admin on another member's shared record: an admin removes, never edits", () => {
		expect(canEditAuthored(admin, shared)).toBe(false);
		expect(canRemoveAuthored(admin, shared)).toBe(true);
	});

	it("refuses a member on someone else's shared record", () => {
		expect(canEditAuthored(viewerOther, shared)).toBe(false);
	});

	it('refuses a user of another household', () => {
		expect(canEditAuthored(viewerForeign, shared)).toBe(false);
	});

	it("refuses the author once the record's contact is private to someone else", () => {
		const ownContact = contact({ ownerId: OTHER_MEMBER, visibility: 'private' });
		expect(canEditAuthored(viewerOther, childOn(ownContact, { ownerId: OTHER_MEMBER }))).toBe(true);
		expect(canEditAuthored(viewerOwner, childOn(ownContact))).toBe(false);
	});
});
