import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { inMemoryGraphSource } from '../../graph/model/in-memory-source';
import { buildEgoNetwork } from '../../graph/model/ego-network';
import { findConnectionPath } from '../../graph/model/connection-path';
import type { Viewer } from '../access/visibility';
import { createDrizzleGraphRepository } from './graph-repository';
import * as schema from './schema';
import { seedRelationshipTypes } from './seed';

/*
 * Integration spec for the bulk visible-graph loader (docs/04 §4.11). It must apply the same
 * access scoping as the rest of the app (contact visible per §3.7; a relationship edge only
 * when both endpoints are visible) and produce a snapshot the pure builders explore unchanged.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;

function seedContact(id: string, name: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.contact).values({ id, householdId: H, createdBy, visibility, displayName: name }).run();
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

	seedContact('mara', 'Mara');
	seedContact('jonas', 'Jonas');
	seedContact('lio', 'Lio');
	rel('r-partner', 'mara', 'jonas', 'partner');
	rel('r-child', 'mara', 'lio', 'parent_child');
});

describe('loadVisibleGraph', () => {
	it('returns all visible contacts as person nodes and relationships as typed edges', async () => {
		const graph = await createDrizzleGraphRepository(db).loadVisibleGraph(viewerU1);
		expect(new Set(graph.nodes.map((n) => n.id))).toEqual(new Set(['mara', 'jonas', 'lio']));
		expect(graph.nodes.every((n) => n.kind === 'person')).toBe(true);

		const child = graph.edges.find((e) => e.id === 'r-child');
		expect(child).toMatchObject({ source: 'mara', target: 'lio', category: 'family', label: 'Parent of', directed: true });
		const partner = graph.edges.find((e) => e.id === 'r-partner');
		expect(partner).toMatchObject({ category: 'romantic', directed: false });
	});

	it('excludes contacts the viewer cannot see and edges touching them', async () => {
		seedContact('secret', 'Secret', 'private', U1); // private, owned by U1
		rel('r-secret', 'mara', 'secret', 'friend');

		const forU2 = await createDrizzleGraphRepository(db).loadVisibleGraph(viewerU2);
		expect(forU2.nodes.some((n) => n.id === 'secret')).toBe(false);
		expect(forU2.edges.some((e) => e.id === 'r-secret')).toBe(false);

		const forU1 = await createDrizzleGraphRepository(db).loadVisibleGraph(viewerU1);
		expect(forU1.nodes.some((n) => n.id === 'secret')).toBe(true);
		expect(forU1.edges.some((e) => e.id === 'r-secret')).toBe(true);
	});

	it('feeds an in-memory source that the pure builders explore client-side', async () => {
		const graph = await createDrizzleGraphRepository(db).loadVisibleGraph(viewerU1);
		const source = inMemoryGraphSource(graph);

		const ego = await buildEgoNetwork(source, 'mara', 1);
		expect(new Set(ego.nodes.map((n) => n.id))).toEqual(new Set(['mara', 'jonas', 'lio']));

		const path = await findConnectionPath(source, 'jonas', 'lio');
		expect(path?.nodeIds).toEqual(['jonas', 'mara', 'lio']);
	});
});
