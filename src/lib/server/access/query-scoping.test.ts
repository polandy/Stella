import { beforeAll, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from '../db/schema';
import { contact } from '../db/schema';
import { contactBrowsableBy, contactVisibleTo } from './query-scoping';
import type { Viewer } from './visibility';

/*
 * The one condition of the query-scoping adapter with no twin in `visibility.ts`:
 * `contactBrowsableBy` (docs/04 §4.9). Every other condition is held to its pure rule by
 * `visibility-parity.test.ts`.
 */

const H1 = 'household-1';
const U1 = 'user-1-owner';
const U2 = 'user-2-member';

const viewerU1: Viewer = { id: U1, householdId: H1 };
const viewerU2: Viewer = { id: U2, householdId: H1 };

let db: BunSQLiteDatabase<typeof schema>;

beforeAll(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });

	db.insert(schema.household).values({ id: H1, name: 'Household One' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H1, email: 'u1@example.test', name: 'Owner' },
			{ id: U2, householdId: H1, email: 'u2@example.test', name: 'Member' }
		])
		.run();
	db.insert(contact)
		.values([
			{
				id: 'c-shared',
				householdId: H1,
				createdBy: U1,
				visibility: 'shared',
				displayName: 'Shared'
			},
			{ id: 'c-priv-u1', householdId: H1, createdBy: U1, visibility: 'private', displayName: 'U1' },
			{ id: 'c-priv-u2', householdId: H1, createdBy: U2, visibility: 'private', displayName: 'U2' }
		])
		.run();
});

function scopedContactIds(viewer: Viewer): string[] {
	return db
		.select({ id: contact.id })
		.from(contact)
		.where(contactVisibleTo(viewer))
		.all()
		.map((r) => r.id)
		.sort();
}

describe('contactBrowsableBy (visible and not archived)', () => {
	function browsableContactIds(viewer: Viewer): string[] {
		return db
			.select({ id: contact.id })
			.from(contact)
			.where(contactBrowsableBy(viewer))
			.all()
			.map((r) => r.id)
			.sort();
	}

	// The fixture is built once for the whole file, so this case puts back what it changed.
	const setArchived = (id: string, at: number | null) =>
		db.update(contact).set({ archivedAt: at }).where(eq(contact.id, id)).run();

	it('drops an archived contact that is otherwise perfectly visible', () => {
		setArchived('c-shared', 1_700_000_000_000);
		try {
			expect(browsableContactIds(viewerU1)).toEqual(['c-priv-u1']);
			// The two conditions are not the same question: visibility still says yes, which is
			// why the graph and the kinship inference keep reading `contactVisibleTo` alone.
			expect(scopedContactIds(viewerU1)).toEqual(['c-priv-u1', 'c-shared']);
		} finally {
			setArchived('c-shared', null);
		}
	});

	it('is exactly visibility while nothing is archived', () => {
		expect(browsableContactIds(viewerU1)).toEqual(scopedContactIds(viewerU1));
		expect(browsableContactIds(viewerU2)).toEqual(scopedContactIds(viewerU2));
	});
});
