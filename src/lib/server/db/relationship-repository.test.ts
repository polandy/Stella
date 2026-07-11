import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import * as schema from './schema';
import { createDrizzleRelationshipRepository } from './relationship-repository';
import { seedRelationshipTypes } from './seed';

/*
 * Integration spec for the Drizzle RelationshipRepository: type seeding, duplicate checks,
 * perspective-aware labels, and visibility scoping (relationships need both endpoints
 * visible, docs/03 §3.7).
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleRelationshipRepository>;

function seedContact(id: string, displayName: string, visibility: 'shared' | 'private', createdBy = U1) {
	db.insert(schema.contact).values({ id, householdId: H, createdBy, visibility, displayName }).run();
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user).values([
		{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
		{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
	]).run();
	repo = createDrizzleRelationshipRepository(db);
});

describe('relationship types', () => {
	it('seeds the built-in types (idempotently)', async () => {
		seedRelationshipTypes(db); // second call must not duplicate
		const types = await repo.listTypes();
		expect(types.find((t) => t.id === 'parent_child')?.forwardLabel).toBe('Parent of');
		expect(types.find((t) => t.id === 'sibling')?.symmetric).toBe(true);
	});
});

describe('exists / insert', () => {
	it('reports existence of a stored relationship', async () => {
		seedContact('hans', 'Hans', 'shared');
		seedContact('bettina', 'Bettina', 'shared');
		expect(await repo.exists('bettina', 'hans', 'parent_child')).toBe(false);
		await repo.insert({
			id: 'rel-1',
			householdId: H,
			fromContactId: 'bettina',
			toContactId: 'hans',
			typeId: 'parent_child',
			description: null,
			createdBy: U1,
			createdAt: 0,
			updatedAt: 0
		});
		expect(await repo.exists('bettina', 'hans', 'parent_child')).toBe(true);
	});
});

describe('listForContactVisibleTo', () => {
	beforeEach(async () => {
		seedContact('hans', 'Hans', 'shared');
		seedContact('bettina', 'Bettina', 'shared');
		// Bettina is Hans's parent.
		await repo.insert({
			id: 'rel-pc',
			householdId: H,
			fromContactId: 'bettina',
			toContactId: 'hans',
			typeId: 'parent_child',
			description: null,
			createdBy: U1,
			createdAt: 0,
			updatedAt: 0
		});
	});

	it('shows the forward label from the parent perspective', async () => {
		const forBettina = await repo.listForContactVisibleTo(viewerU1, 'bettina');
		expect(forBettina).toHaveLength(1);
		expect(forBettina[0]).toMatchObject({ otherDisplayName: 'Hans', label: 'Parent of' });
	});

	it('shows the reverse label from the child perspective', async () => {
		const forHans = await repo.listForContactVisibleTo(viewerU1, 'hans');
		expect(forHans[0]).toMatchObject({ otherDisplayName: 'Bettina', label: 'Child of' });
	});

	it('hides a relationship whose other endpoint the viewer cannot see', async () => {
		seedContact('secret', 'Secret', 'private', U1); // owned by U1, private
		await repo.insert({
			id: 'rel-secret',
			householdId: H,
			fromContactId: 'hans',
			toContactId: 'secret',
			typeId: 'friend',
			description: null,
			createdBy: U1,
			createdAt: 0,
			updatedAt: 0
		});
		// U2 sees only the parent relationship, not the one touching the private contact.
		const forHansU2 = await repo.listForContactVisibleTo(viewerU2, 'hans');
		expect(forHansU2.map((r) => r.id)).toEqual(['rel-pc']);
		// U1 (owner) sees both.
		const forHansU1 = await repo.listForContactVisibleTo(viewerU1, 'hans');
		expect(forHansU1.map((r) => r.id).sort()).toEqual(['rel-pc', 'rel-secret']);
	});
});
