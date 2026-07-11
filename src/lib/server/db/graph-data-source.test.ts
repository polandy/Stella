import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { buildEgoNetwork } from '../../graph/model/ego-network';
import { findConnectionPath } from '../../graph/model/connection-path';
import type { Viewer } from '../access/visibility';
import * as schema from './schema';
import { createDrizzleGraphDataSource } from './graph-data-source';
import { seedRelationshipTypes } from './seed';

/*
 * Integration spec for the Drizzle GraphDataSource adapter (docs/04 §4.11). It feeds the pure
 * graph builders through the port and must apply the same access scoping as the rest of the
 * app: both endpoints of a relationship visible (docs/03 §3.7). We also drive the pure
 * buildEgoNetwork / findConnectionPath over the real adapter to prove the seam composes.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;

function seedContact(
	id: string,
	displayName: string,
	visibility: 'shared' | 'private' = 'shared',
	extra: Partial<typeof schema.contact.$inferInsert> = {}
) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy: U1, visibility, displayName, ...extra })
		.run();
}

function rel(id: string, from: string, to: string, typeId: string) {
	db.insert(schema.relationship)
		.values({ id, householdId: H, fromContactId: from, toContactId: to, typeId, createdBy: U1 })
		.run();
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
});

describe('neighborhood', () => {
	beforeEach(() => {
		seedContact('mara', 'Mara');
		seedContact('jonas', 'Jonas');
		seedContact('lio', 'Lio');
		rel('r-partner', 'mara', 'jonas', 'partner'); // symmetric
		rel('r-child', 'mara', 'lio', 'parent_child'); // asymmetric: Mara parent of Lio
	});

	it('returns the centre plus its neighbours and typed edges', async () => {
		const source = createDrizzleGraphDataSource(db, viewerU1);
		const hood = await source.neighborhood('mara');

		expect(hood?.center).toEqual({ id: 'mara', kind: 'person', label: 'Mara', deceased: false });
		expect(new Set(hood?.nodes.map((n) => n.id))).toEqual(new Set(['jonas', 'lio']));

		const partner = hood?.edges.find((e) => e.id === 'r-partner');
		expect(partner).toMatchObject({ source: 'mara', target: 'jonas', kind: 'relationship', category: 'romantic', directed: false });

		const child = hood?.edges.find((e) => e.id === 'r-child');
		// canonical orientation is preserved (from → to) and the asymmetric type is directed
		expect(child).toMatchObject({ source: 'mara', target: 'lio', label: 'Parent of', directed: true });
	});

	it('keeps canonical edge orientation regardless of which endpoint is queried', async () => {
		const source = createDrizzleGraphDataSource(db, viewerU1);
		const fromLio = await source.neighborhood('lio');
		const child = fromLio?.edges.find((e) => e.id === 'r-child');
		expect(child).toMatchObject({ source: 'mara', target: 'lio' });
		expect(fromLio?.nodes.map((n) => n.id)).toEqual(['mara']);
	});

	it('marks deceased neighbours', async () => {
		seedContact('walter', 'Walter', 'shared', { isDeceased: 1 });
		rel('r-gp', 'walter', 'mara', 'grandparent_grandchild');
		const source = createDrizzleGraphDataSource(db, viewerU1);
		const hood = await source.neighborhood('mara');
		expect(hood?.nodes.find((n) => n.id === 'walter')?.deceased).toBe(true);
	});

	it('returns null for a missing or invisible node', async () => {
		seedContact('secret', 'Secret', 'private', { createdBy: U1 }); // owned by U1
		const forU2 = createDrizzleGraphDataSource(db, viewerU2);
		expect(await forU2.neighborhood('secret')).toBeNull(); // U2 cannot see it
		expect(await forU2.neighborhood('ghost')).toBeNull(); // does not exist
	});

	it('hides edges whose other endpoint the viewer cannot see', async () => {
		seedContact('secret', 'Secret', 'private', { createdBy: U1 });
		rel('r-secret', 'mara', 'secret', 'friend');

		const forU2 = createDrizzleGraphDataSource(db, viewerU2);
		const hood = await forU2.neighborhood('mara');
		expect(hood?.edges.map((e) => e.id).sort()).toEqual(['r-child', 'r-partner']);
		expect(hood?.nodes.some((n) => n.id === 'secret')).toBe(false);

		// the owner still sees the private connection
		const forU1 = createDrizzleGraphDataSource(db, viewerU1);
		const ownerHood = await forU1.neighborhood('mara');
		expect(ownerHood?.edges.some((e) => e.id === 'r-secret')).toBe(true);
	});
});

describe('composed with the pure builders', () => {
	beforeEach(() => {
		seedContact('mara', 'Mara');
		seedContact('jonas', 'Jonas');
		seedContact('peter', 'Peter');
		seedContact('walter', 'Walter');
		rel('r-partner', 'mara', 'jonas', 'partner');
		rel('r-father', 'peter', 'mara', 'parent_child'); // Peter parent of Mara
		rel('r-gf', 'walter', 'peter', 'parent_child'); // Walter parent of Peter
	});

	it('buildEgoNetwork depth 1 yields the direct neighbourhood only', async () => {
		const source = createDrizzleGraphDataSource(db, viewerU1);
		const model = await buildEgoNetwork(source, 'mara', 1);
		expect(new Set(model.nodes.map((n) => n.id))).toEqual(new Set(['mara', 'jonas', 'peter']));
		expect(model.nodes.some((n) => n.id === 'walter')).toBe(false); // two hops away
	});

	it('buildEgoNetwork depth 2 reaches the grandparent', async () => {
		const source = createDrizzleGraphDataSource(db, viewerU1);
		const model = await buildEgoNetwork(source, 'mara', 2);
		expect(model.nodes.some((n) => n.id === 'walter')).toBe(true);
	});

	it('findConnectionPath traces Mara → Peter → Walter', async () => {
		const source = createDrizzleGraphDataSource(db, viewerU1);
		const path = await findConnectionPath(source, 'mara', 'walter');
		expect(path?.nodeIds).toEqual(['mara', 'peter', 'walter']);
	});
});
