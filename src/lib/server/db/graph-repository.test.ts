import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { withoutDerivedLinks } from '../../graph/model/graph-model';
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
		expect(child).toMatchObject({ source: 'mara', target: 'lio', category: 'family', label: 'Parent of', typeKey: 'parent_child', directed: true });
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

		// Path finding runs over stored links only, as the explorer does (docs/02 §2.7).
		const path = await findConnectionPath(
			inMemoryGraphSource(withoutDerivedLinks(graph)),
			'jonas',
			'lio'
		);
		expect(path?.nodeIds).toEqual(['jonas', 'mara', 'lio']);
	});
});

describe('loadVisibleGraph — circles', () => {
	function seedCircle(id: string, name: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
		db.insert(schema.circle).values({ id, householdId: H, createdBy, visibility, name }).run();
	}
	function seedMembership(id: string, circleId: string, contactId: string, role: string | null = null) {
		db.insert(schema.circleMembership).values({ id, circleId, contactId, role, createdBy: U1 }).run();
	}

	it('includes visible circles as circle nodes and memberships as edges', async () => {
		seedCircle('kegel', 'Kegelclub');
		seedMembership('m-mara', 'kegel', 'mara', 'captain');
		seedMembership('m-jonas', 'kegel', 'jonas');

		const graph = await createDrizzleGraphRepository(db).loadVisibleGraph(viewerU1);
		expect(graph.nodes.find((n) => n.id === 'kegel')).toMatchObject({ kind: 'circle', label: 'Kegelclub' });
		const edge = graph.edges.find((e) => e.id === 'm-mara');
		expect(edge).toMatchObject({ source: 'kegel', target: 'mara', kind: 'membership', label: 'captain' });

		// two members reachable through the circle via co-membership
		const source = inMemoryGraphSource(graph);
		const path = await findConnectionPath(source, 'mara', 'jonas');
		// mara↔jonas are also partners (direct); the point is the circle node exists and links both
		expect(graph.edges.filter((e) => e.kind === 'membership').map((e) => e.id).sort()).toEqual(['m-jonas', 'm-mara']);
		expect(path).not.toBeNull();
	});

	it('excludes a private circle and its memberships from another member', async () => {
		seedCircle('secret-club', 'Secret Club', 'private', U1);
		seedMembership('m-secret', 'secret-club', 'mara');

		const forU2 = await createDrizzleGraphRepository(db).loadVisibleGraph(viewerU2);
		expect(forU2.nodes.some((n) => n.id === 'secret-club')).toBe(false);
		expect(forU2.edges.some((e) => e.id === 'm-secret')).toBe(false);
	});
});

/*
 * Derived kinship (docs/02 §2.4.1) joins the snapshot as its own edge kind, under the same
 * scoping as everything else: it is inferred from the links the viewer may see, and no further.
 */
describe('loadVisibleGraph — derived kinship', () => {
	beforeEach(() => {
		// Mara already parents Lio (see the outer setup); give Lio a grandmother and an aunt.
		seedContact('rosa', 'Rosa');
		seedContact('nina', 'Nina');
		rel('r-gran', 'rosa', 'mara', 'parent_child');
		rel('r-aunt', 'rosa', 'nina', 'parent_child');
	});

	it('adds the inferred relatives as derived kinship edges', async () => {
		const graph = await createDrizzleGraphRepository(db).loadVisibleGraph(viewerU1);
		const kinship = graph.edges.filter((e) => e.kind === 'kinship');

		// Lio's grandmother and aunt, plus what follows for Mara's partner Jonas: Lio is his
		// stepson, Rosa his mother-in-law, Nina his sister-in-law. Mara gains her sister Nina.
		expect(kinship.map((e) => e.id).sort()).toEqual([
			'kin:jonas:lio',
			'kin:jonas:nina',
			'kin:jonas:rosa',
			'kin:lio:nina',
			'kin:lio:rosa',
			'kin:mara:nina'
		]);
		expect(kinship.find((e) => e.id === 'kin:lio:rosa')).toMatchObject({
			source: 'rosa',
			target: 'lio',
			kin: { term: 'grandparent', variant: 'neutral' },
			derived: true
		});
		// The stored links keep their own labels and are not duplicated by an inferred one.
		expect(graph.edges.find((e) => e.id === 'r-child')).toMatchObject({ kind: 'relationship' });
	});

	it('keeps an archived contact, because the kinship in between is read through them', async () => {
		// Archiving takes someone out of the lists the household browses, never out of the
		// shape of the family (docs/04 §4.9): drop Rosa here and Mara and Nina stop being
		// sisters, so Stella would not say less — it would say something untrue.
		db.update(schema.contact)
			.set({ archivedAt: 1_700_000_000_000 })
			.where(eq(schema.contact.id, 'rosa'))
			.run();

		const graph = await createDrizzleGraphRepository(db).loadVisibleGraph(viewerU1);
		expect(graph.nodes.some((n) => n.id === 'rosa')).toBe(true);
		expect(graph.edges.some((e) => e.id === 'kin:mara:nina')).toBe(true);
		expect(graph.edges.some((e) => e.id === 'kin:lio:rosa')).toBe(true);
	});

	it('infers only from the links the viewer may see', async () => {
		seedContact('hidden', 'Hidden', 'private', U1); // U1's private child of Rosa
		rel('r-hidden', 'rosa', 'hidden', 'parent_child');

		const forOwner = await createDrizzleGraphRepository(db).loadVisibleGraph(viewerU1);
		expect(forOwner.edges.some((e) => e.id === 'kin:hidden:lio')).toBe(true); // aunt of Lio

		const forOther = await createDrizzleGraphRepository(db).loadVisibleGraph(viewerU2);
		expect(forOther.nodes.some((n) => n.id === 'hidden')).toBe(false);
		expect(forOther.edges.some((e) => e.id.includes('hidden'))).toBe(false);
		// The visible part of the family is still derived for U2 — this is scoping, not silence.
		expect(forOther.edges.some((e) => e.id === 'kin:lio:rosa')).toBe(true);
	});
});
