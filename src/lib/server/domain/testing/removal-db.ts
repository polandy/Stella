import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Remover } from '../../access/visibility';
import * as schema from '../../db/schema';
import { ensureSearchIndex } from '../../db/search-index';

/*
 * A real migrated in-memory database for the tests of removing an authored record (docs/03
 * §3.7): what a removal takes with it, and the activity entry written in the same transaction,
 * live in the adapter. Two households; in the first, Nina authors, Andy is an admin and Mia a
 * plain member; Kurt and Lea are shared people, Secret a private one of Andy's; a shared circle
 * of Andy's and a private one.
 */

export const H = 'household-1';
export const H2 = 'household-2';
export const AUTHOR = 'user-nina';
export const ADMIN = 'user-andy';
export const MEMBER = 'user-mia';
export const FOREIGN_ADMIN = 'user-foreign';

export const author: Remover = { id: AUTHOR, householdId: H, isAdmin: false };
export const admin: Remover = { id: ADMIN, householdId: H, isAdmin: true };
export const member: Remover = { id: MEMBER, householdId: H, isAdmin: false };
export const foreignAdmin: Remover = { id: FOREIGN_ADMIN, householdId: H2, isAdmin: true };

export interface RemovalDb {
	sqlite: Database;
	db: BunSQLiteDatabase<typeof schema>;
}

export function removalDb(): RemovalDb {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	ensureSearchIndex(sqlite);
	db.insert(schema.household)
		.values([
			{ id: H, name: 'H' },
			{ id: H2, name: 'H2' }
		])
		.run();
	db.insert(schema.user)
		.values([
			{ id: AUTHOR, householdId: H, email: 'nina@x.test', name: 'Nina' },
			{ id: ADMIN, householdId: H, email: 'andy@x.test', name: 'Andy', role: 'admin' },
			{ id: MEMBER, householdId: H, email: 'mia@x.test', name: 'Mia' },
			{ id: FOREIGN_ADMIN, householdId: H2, email: 'f@x.test', name: 'F', role: 'admin' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-kurt', householdId: H, createdBy: ADMIN, visibility: 'shared', displayName: 'Kurt' },
			{ id: 'c-lea', householdId: H, createdBy: ADMIN, visibility: 'shared', displayName: 'Lea' },
			{
				id: 'c-secret',
				householdId: H,
				createdBy: ADMIN,
				visibility: 'private',
				displayName: 'Secret'
			}
		])
		.run();
	db.insert(schema.circle)
		.values([
			{ id: 'k-class', householdId: H, createdBy: ADMIN, visibility: 'shared', name: 'Class 3b' },
			{ id: 'k-secret', householdId: H, createdBy: ADMIN, visibility: 'private', name: 'Hidden' }
		])
		.run();
	return { sqlite, db };
}
