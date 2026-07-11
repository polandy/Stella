import { beforeAll, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { alias } from 'drizzle-orm/sqlite-core';
import * as schema from '../db/schema';
import { contact, note, relationship } from '../db/schema';
import {
	childRecordVisibleTo,
	contactVisibleTo,
	relationshipVisibleTo
} from './query-scoping';
import {
	canViewChildRecord,
	canViewContact,
	canViewRelationship,
	type Viewer
} from './visibility';

/*
 * Integration spec for the query-scoping adapter (docs/03 §3.7, docs/08 §8.3).
 * The adapter turns the pure visibility rules into SQL WHERE conditions. Its
 * correctness property: for any viewer, the scoped query returns EXACTLY the rows the
 * pure canView* predicates would allow. We assert that equivalence against a real
 * in-memory SQLite seeded with a representative mix of records.
 */

const H1 = 'household-1';
const H2 = 'household-2';
const U1 = 'user-1-owner';
const U2 = 'user-2-member';
const U3 = 'user-3-foreign';

const viewerU1: Viewer = { id: U1, householdId: H1 };
const viewerU2: Viewer = { id: U2, householdId: H1 };
const viewerForeign: Viewer = { id: U3, householdId: H2 };

let db: BunSQLiteDatabase<typeof schema>;

beforeAll(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });

	db.insert(schema.household).values([
		{ id: H1, name: 'Household One' },
		{ id: H2, name: 'Household Two' }
	]).run();

	db.insert(schema.user).values([
		{ id: U1, householdId: H1, email: 'u1@example.test', name: 'Owner' },
		{ id: U2, householdId: H1, email: 'u2@example.test', name: 'Member' },
		{ id: U3, householdId: H2, email: 'u3@example.test', name: 'Foreign' }
	]).run();

	db.insert(schema.relationshipType).values({
		id: 'rt-friend',
		key: 'friend',
		forwardLabel: 'Friend',
		reverseLabel: 'Friend',
		category: 'social',
		symmetric: 1
	}).run();

	// Contacts covering every visibility/household/owner combination.
	db.insert(contact).values([
		{ id: 'c-shared', householdId: H1, createdBy: U1, visibility: 'shared', displayName: 'Shared' },
		{ id: 'c-priv-u1', householdId: H1, createdBy: U1, visibility: 'private', displayName: 'Private of U1' },
		{ id: 'c-priv-u2', householdId: H1, createdBy: U2, visibility: 'private', displayName: 'Private of U2' },
		{ id: 'c-foreign', householdId: H2, createdBy: U3, visibility: 'shared', displayName: 'Foreign' }
	]).run();

	// Notes: shared/private children on a shared contact, plus a child on a private contact.
	db.insert(note).values([
		{ id: 'n-shared', contactId: 'c-shared', createdBy: U1, visibility: 'shared', body: 'shared note' },
		{ id: 'n-priv-u1', contactId: 'c-shared', createdBy: U1, visibility: 'private', body: 'u1 private' },
		{ id: 'n-priv-u2', contactId: 'c-shared', createdBy: U2, visibility: 'private', body: 'u2 private' },
		{ id: 'n-on-priv', contactId: 'c-priv-u1', createdBy: U1, visibility: 'shared', body: 'on private contact' }
	]).run();

	// Relationships: one with both endpoints visible to U2, one with a hidden endpoint.
	db.insert(relationship).values([
		{ id: 'r-both-visible', householdId: H1, fromContactId: 'c-shared', toContactId: 'c-priv-u2', typeId: 'rt-friend', createdBy: U1 },
		{ id: 'r-hidden-endpoint', householdId: H1, fromContactId: 'c-shared', toContactId: 'c-priv-u1', typeId: 'rt-friend', createdBy: U1 }
	]).run();
});

/** Ids allowed by the pure contact predicate — the ground truth to match. */
function expectedContactIds(viewer: Viewer): string[] {
	return db
		.select()
		.from(contact)
		.all()
		.filter((c) =>
			canViewContact(viewer, {
				householdId: c.householdId,
				ownerId: c.createdBy,
				visibility: c.visibility
			})
		)
		.map((c) => c.id)
		.sort();
}

function scopedContactIds(viewer: Viewer): string[] {
	return db
		.select({ id: contact.id })
		.from(contact)
		.where(contactVisibleTo(viewer))
		.all()
		.map((r) => r.id)
		.sort();
}

describe('contactVisibleTo', () => {
	it('matches the pure predicate for a normal household member', () => {
		expect(scopedContactIds(viewerU2)).toEqual(expectedContactIds(viewerU2));
		expect(scopedContactIds(viewerU2)).toEqual(['c-priv-u2', 'c-shared']);
	});

	it('matches the pure predicate for the owner of private contacts', () => {
		expect(scopedContactIds(viewerU1)).toEqual(expectedContactIds(viewerU1));
		expect(scopedContactIds(viewerU1)).toEqual(['c-priv-u1', 'c-shared']);
	});

	it('never leaks across households', () => {
		expect(scopedContactIds(viewerForeign)).toEqual(['c-foreign']);
	});
});

describe('childRecordVisibleTo (notes joined to their contact)', () => {
	function scopedNoteIds(viewer: Viewer): string[] {
		return db
			.select({ id: note.id })
			.from(note)
			.innerJoin(contact, eq(note.contactId, contact.id))
			.where(childRecordVisibleTo(viewer, { visibility: note.visibility, createdBy: note.createdBy }))
			.all()
			.map((r) => r.id)
			.sort();
	}

	function expectedNoteIds(viewer: Viewer): string[] {
		return db
			.select()
			.from(note)
			.innerJoin(contact, eq(note.contactId, contact.id))
			.all()
			.filter((row) =>
				canViewChildRecord(viewer, {
					ownerId: row.note.createdBy,
					visibility: row.note.visibility,
					contact: {
						householdId: row.contact.householdId,
						ownerId: row.contact.createdBy,
						visibility: row.contact.visibility
					}
				})
			)
			.map((row) => row.note.id)
			.sort();
	}

	it('shows shared notes and the members own private notes, hiding others', () => {
		expect(scopedNoteIds(viewerU2)).toEqual(expectedNoteIds(viewerU2));
		// n-shared (shared), n-priv-u2 (owned). Not n-priv-u1, not n-on-priv (private parent).
		expect(scopedNoteIds(viewerU2)).toEqual(['n-priv-u2', 'n-shared']);
	});

	it('lets the private-contact owner see notes under it', () => {
		expect(scopedNoteIds(viewerU1)).toEqual(expectedNoteIds(viewerU1));
		expect(scopedNoteIds(viewerU1)).toContain('n-on-priv');
	});
});

describe('relationshipVisibleTo (both endpoints must be visible)', () => {
	function scopedRelationshipIds(viewer: Viewer): string[] {
		const fromContact = alias(contact, 'from_contact');
		const toContact = alias(contact, 'to_contact');
		return db
			.select({ id: relationship.id })
			.from(relationship)
			.innerJoin(fromContact, eq(relationship.fromContactId, fromContact.id))
			.innerJoin(toContact, eq(relationship.toContactId, toContact.id))
			.where(relationshipVisibleTo(viewer, fromContact, toContact))
			.all()
			.map((r) => r.id)
			.sort();
	}

	function expectedRelationshipIds(viewer: Viewer): string[] {
		const fromContact = alias(contact, 'from_c');
		const toContact = alias(contact, 'to_c');
		return db
			.select({ id: relationship.id, from: fromContact, to: toContact })
			.from(relationship)
			.innerJoin(fromContact, eq(relationship.fromContactId, fromContact.id))
			.innerJoin(toContact, eq(relationship.toContactId, toContact.id))
			.all()
			.filter((row) =>
				canViewRelationship(viewer, {
					from: { householdId: row.from.householdId, ownerId: row.from.createdBy, visibility: row.from.visibility },
					to: { householdId: row.to.householdId, ownerId: row.to.createdBy, visibility: row.to.visibility }
				})
			)
			.map((row) => row.id)
			.sort();
	}

	it('hides a relationship whose endpoint is a private contact the viewer cannot see', () => {
		// U2 can see c-shared and owns c-priv-u2 → r-both-visible shown; r-hidden-endpoint
		// touches U1's private c-priv-u1 → hidden.
		expect(scopedRelationshipIds(viewerU2)).toEqual(expectedRelationshipIds(viewerU2));
		expect(scopedRelationshipIds(viewerU2)).toEqual(['r-both-visible']);
	});

	it('shows only relationships whose every endpoint the viewer can see', () => {
		// U1 owns c-priv-u1 (→ r-hidden-endpoint visible) but cannot see U2's private
		// c-priv-u2 (→ r-both-visible hidden). Ownership of one contact is not blanket access.
		expect(scopedRelationshipIds(viewerU1)).toEqual(expectedRelationshipIds(viewerU1));
		expect(scopedRelationshipIds(viewerU1)).toEqual(['r-hidden-endpoint']);
	});
});
