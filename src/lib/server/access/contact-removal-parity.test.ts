import { beforeAll, describe, expect, it } from 'bun:test';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type * as schema from '../db/schema';
import { contact } from '../db/schema';
import { contactDeletableBy, contactMergeableBy } from './query-scoping';
import { REMOVERS, seedParityDb } from './visibility-parity.fixture';
import { canDeleteContact, canMergeContacts, type ContactAccess, type Remover } from './visibility';

/*
 * Who may end a person's record (docs/02 §2.2, docs/03 §3.7): deleting and merging are an
 * admin's, on the contacts they see. Stated twice like every rule here and held to the same
 * rows — the parity fixture's contacts, two households, shared and private.
 */

let db: BunSQLiteDatabase<typeof schema>;

beforeAll(() => {
	db = seedParityDb();
});

function accessRows(): { id: string; access: ContactAccess }[] {
	return db
		.select()
		.from(contact)
		.all()
		.map((c) => ({
			id: c.id,
			access: { householdId: c.householdId, ownerId: c.createdBy, visibility: c.visibility }
		}));
}

const sorted = (ids: string[]) => [...ids].sort();

const deletable = {
	ts: (remover: Remover) =>
		sorted(
			accessRows()
				.filter((c) => canDeleteContact(remover, c.access))
				.map((c) => c.id)
		),
	sql: (remover: Remover) =>
		sorted(
			db
				.select({ id: contact.id })
				.from(contact)
				.where(contactDeletableBy(remover))
				.all()
				.map((c) => c.id)
		)
};

/** A record may take part in a merge when merging it with itself would be allowed. */
const mergeable = {
	ts: (remover: Remover) =>
		sorted(
			accessRows()
				.filter((c) => canMergeContacts(remover, c.access, c.access))
				.map((c) => c.id)
		),
	sql: (remover: Remover) =>
		sorted(
			db
				.select({ id: contact.id })
				.from(contact)
				.where(contactMergeableBy(remover))
				.all()
				.map((c) => c.id)
		)
};

describe('canDeleteContact and contactDeletableBy pick the same rows', () => {
	for (const [name, remover] of Object.entries(REMOVERS)) {
		it(`remover ${name}`, () => {
			expect(deletable.sql(remover)).toEqual(deletable.ts(remover));
		});
	}
});

describe('canMergeContacts and contactMergeableBy pick the same rows', () => {
	for (const [name, remover] of Object.entries(REMOVERS)) {
		it(`remover ${name}`, () => {
			expect(mergeable.sql(remover)).toEqual(mergeable.ts(remover));
		});
	}
});

describe('each refused removal has an allowed control', () => {
	it('an admin deletes and merges the contacts they see, their own private one included', () => {
		for (const side of [
			deletable.ts(REMOVERS.u1Admin),
			deletable.sql(REMOVERS.u1Admin),
			mergeable.ts(REMOVERS.u1Admin),
			mergeable.sql(REMOVERS.u1Admin)
		]) {
			expect(side).toEqual(['c-priv-u1', 'c-shared']);
		}
	});

	it("an admin never reaches another member's private contact or another household", () => {
		for (const side of [deletable.sql(REMOVERS.u1Admin), mergeable.sql(REMOVERS.u1Admin)]) {
			expect(side).not.toContain('c-priv-u2');
			expect(side).not.toContain('c-foreign');
		}
		// The control: household 2's admin reaches its own.
		expect(deletable.sql(REMOVERS.u3Admin)).toEqual(['c-foreign', 'c-foreign-priv']);
	});

	it('a member deletes and merges nobody, not even their own private contact', () => {
		for (const remover of [REMOVERS.u2, REMOVERS.u4]) {
			for (const side of [
				deletable.ts(remover),
				deletable.sql(remover),
				mergeable.ts(remover),
				mergeable.sql(remover)
			]) {
				expect(side).toEqual([]);
			}
		}
	});

	it('a merge needs both records in reach', () => {
		const rows = new Map(accessRows().map((c) => [c.id, c.access]));
		const pick = (id: string): ContactAccess => {
			const row = rows.get(id);
			if (!row) throw new Error(`no contact row ${id}`);
			return row;
		};
		expect(canMergeContacts(REMOVERS.u1Admin, pick('c-shared'), pick('c-priv-u1'))).toBe(true);
		expect(canMergeContacts(REMOVERS.u1Admin, pick('c-shared'), pick('c-priv-u2'))).toBe(false);
		expect(canMergeContacts(REMOVERS.u1Admin, pick('c-foreign'), pick('c-shared'))).toBe(false);
	});
});
