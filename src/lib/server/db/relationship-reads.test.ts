import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import * as schema from './schema';
import { seedRelationshipTypes } from './seed';
import { deriveKinship } from '../../kinship/kinship';
import {
	CURRENT_RELATIONSHIP_STATUS,
	FORMER_RELATIONSHIP_STATUS
} from '../../relationships/status';
import { createDrizzleRelationshipRepository } from './relationship-repository';
import { createDrizzleRelationshipTieReads } from './relationship-tie-reads';
import type {
	RelationshipRepository,
	RelationshipTieReads
} from '../domain/relationships/relationships';
import { createDrizzleKinshipGraphReads } from './kinship-graph-read';
import type { KinshipGraphReads } from '../domain/relationships/suggestion-review';

/*
 * Integration spec for the relationships' read models: a person's ties, labelled from their
 * side, and the kinship graph the engine infers from (docs/02 §2.4.1). Both show a link only
 * when both endpoints are visible (docs/03 §3.7).
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: RelationshipRepository;
let ties: RelationshipTieReads;
let kinship: KinshipGraphReads;

function seedContact(
	id: string,
	displayName: string,
	visibility: 'shared' | 'private',
	createdBy = U1
) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy, visibility, displayName })
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
	repo = createDrizzleRelationshipRepository(db);
	ties = createDrizzleRelationshipTieReads(db);
	kinship = createDrizzleKinshipGraphReads(db);
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
			sinceDate: null,
			status: CURRENT_RELATIONSHIP_STATUS,
			createdBy: U1,
			createdAt: 0,
			updatedAt: 0
		});
	});

	it('shows the forward label from the parent perspective', async () => {
		const forBettina = await ties.listForContactVisibleTo(viewerU1, 'bettina');
		expect(forBettina).toHaveLength(1);
		expect(forBettina[0]).toMatchObject({ otherDisplayName: 'Hans', label: 'Parent of' });
	});

	it('shows the reverse label from the child perspective', async () => {
		const forHans = await ties.listForContactVisibleTo(viewerU1, 'hans');
		expect(forHans[0]).toMatchObject({ otherDisplayName: 'Bettina', label: 'Child of' });
	});

	it('carries the specifics back out from both sides (docs/02 §2.4)', async () => {
		seedContact('kurt', 'Kurt', 'shared');
		await repo.insert({
			id: 'rel-partner',
			householdId: H,
			fromContactId: 'bettina',
			toContactId: 'kurt',
			typeId: 'partner',
			description: 'met at the ski course',
			sinceDate: '2019-06-01',
			status: 'former',
			createdBy: U1,
			createdAt: 0,
			updatedAt: 0
		});

		for (const [who, other] of [
			['bettina', 'Kurt'],
			['kurt', 'Bettina']
		]) {
			const view = (await ties.listForContactVisibleTo(viewerU1, who)).find(
				(r) => r.otherDisplayName === other
			);
			expect(view).toMatchObject({
				description: 'met at the ski course',
				sinceDate: '2019-06-01',
				status: 'former'
			});
		}
	});

	it('reads a status the domain does not know as current', async () => {
		// The column is plain text; an older row or an import can hold anything. A link that
		// is on record holds until someone ends it, so anything but `former` reads as current.
		db.update(schema.relationship)
			.set({ status: 'complicated' })
			.where(eq(schema.relationship.id, 'rel-pc'))
			.run();

		const [view] = await ties.listForContactVisibleTo(viewerU1, 'bettina');
		expect(view.status).toBe('current');
		// …and a status it does know still comes through, so this is not blanket blindness.
		db.update(schema.relationship)
			.set({ status: 'current' })
			.where(eq(schema.relationship.id, 'rel-pc'))
			.run();
		expect((await ties.listForContactVisibleTo(viewerU1, 'bettina'))[0].status).toBe('current');
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
			sinceDate: null,
			status: CURRENT_RELATIONSHIP_STATUS,
			createdBy: U1,
			createdAt: 0,
			updatedAt: 0
		});
		// U2 sees only the parent relationship, not the one touching the private contact.
		const forHansU2 = await ties.listForContactVisibleTo(viewerU2, 'hans');
		expect(forHansU2.map((r) => r.id)).toEqual(['rel-pc']);
		// U1 (owner) sees both.
		const forHansU1 = await ties.listForContactVisibleTo(viewerU1, 'hans');
		expect(forHansU1.map((r) => r.id).sort()).toEqual(['rel-pc', 'rel-secret']);
	});
});

describe('loadKinshipGraphVisibleTo (docs/02 §2.4.1)', () => {
	/** Bettina is Otto's child and Hans's parent; the private pair is only U2's to see. */
	beforeEach(async () => {
		seedContact('otto', 'Otto', 'shared');
		seedContact('bettina', 'Bettina', 'shared');
		seedContact('hans', 'Hans', 'shared');
		seedContact('kurt', 'Kurt', 'shared');
		seedContact('secret', 'Secret', 'private', U2);
		db.update(schema.contact)
			.set({ gender: 'female' })
			.where(eq(schema.contact.id, 'bettina'))
			.run();
		const rel = (id: string, from: string, to: string, typeId: string) =>
			repo.insert({
				id,
				householdId: H,
				fromContactId: from,
				toContactId: to,
				typeId,
				description: null,
				sinceDate: null,
				status: CURRENT_RELATIONSHIP_STATUS,
				createdBy: U1,
				createdAt: 1,
				updatedAt: 1
			});
		await rel('r-1', 'otto', 'bettina', 'parent_child');
		await rel('r-2', 'bettina', 'hans', 'parent_child');
		await rel('r-3', 'bettina', 'kurt', 'partner');
		await rel('r-4', 'otto', 'hans', 'friend'); // a stored pair that is not primary
		await rel('r-5', 'secret', 'hans', 'parent_child'); // only U2 may see this one
	});

	it('classifies the primary links and carries gender, for the people the viewer may see', async () => {
		const graph = await kinship.loadKinshipGraphVisibleTo(viewerU1);
		expect(graph.people.map((p) => p.id).sort()).toEqual(['bettina', 'hans', 'kurt', 'otto']);
		expect(graph.people.find((p) => p.id === 'bettina')?.gender).toBe('female');
		expect(graph.parentEdges).toEqual([
			{ parentId: 'otto', childId: 'bettina' },
			{ parentId: 'bettina', childId: 'hans' }
		]);
		expect(graph.partnerEdges).toEqual([
			{ a: 'bettina', b: 'kurt', former: false, sinceDate: null }
		]);
		// Every visible pair is a stored pair, so nothing already linked is re-derived.
		expect(graph.storedPairs).toContainEqual({ a: 'otto', b: 'hans' });
	});

	it('marks a former partnership, so nothing is derived through it', async () => {
		// docs/02 §2.4: the link stays on record — it is the derivation that stops, so the
		// ex-partner is never offered as a stepparent to the children again.
		db.update(schema.relationship)
			.set({ status: FORMER_RELATIONSHIP_STATUS })
			.where(eq(schema.relationship.id, 'r-3'))
			.run();

		const graph = await kinship.loadKinshipGraphVisibleTo(viewerU1);
		expect(graph.partnerEdges).toEqual([
			{ a: 'bettina', b: 'kurt', former: true, sinceDate: null }
		]);
		expect(graph.storedPairs).toContainEqual({ a: 'bettina', b: 'kurt' });
		expect(deriveKinship(graph, 'hans').map((k) => k.personId)).not.toContain('kurt');
	});

	// Rule L3 tells a step-parent by these two dates (docs/02 §2.4.1).
	it('carries the birth dates and the day a partnership began', async () => {
		db.update(schema.contact)
			.set({ birthDate: '2015-05-20' })
			.where(eq(schema.contact.id, 'hans'))
			.run();
		db.update(schema.relationship)
			.set({ sinceDate: '2009-06-13' })
			.where(eq(schema.relationship.id, 'r-3'))
			.run();

		const graph = await kinship.loadKinshipGraphVisibleTo(viewerU1);
		expect(graph.people.find((p) => p.id === 'hans')?.birthDate).toBe('2015-05-20');
		expect(graph.people.find((p) => p.id === 'otto')?.birthDate).toBeNull();
		expect(graph.partnerEdges).toEqual([
			{ a: 'bettina', b: 'kurt', former: false, sinceDate: '2009-06-13' }
		]);
	});

	it('hides a private person’s links from everyone but their author', async () => {
		const forU1 = await kinship.loadKinshipGraphVisibleTo(viewerU1);
		expect(forU1.people.map((p) => p.id)).not.toContain('secret');
		expect(forU1.parentEdges).not.toContainEqual({ parentId: 'secret', childId: 'hans' });
		// Positive control: the author sees both the person and the link.
		const forU2 = await kinship.loadKinshipGraphVisibleTo(viewerU2);
		expect(forU2.people.map((p) => p.id)).toContain('secret');
		expect(forU2.parentEdges).toContainEqual({ parentId: 'secret', childId: 'hans' });
	});
});

/*
 * Correcting and taking back a link (docs/02 §2.4). Both are scoped through
 * `relationshipVisibleTo`, so a relationship touching someone the viewer cannot see is
 * indistinguishable from one that is not there — and neither writes anything in that case.
 */
