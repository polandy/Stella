import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import * as schema from './schema';
import { createDrizzleRelationshipRepository } from './relationship-repository';
import { CUSTOM_TYPE_SORT_ORDER } from '../domain/relationships/relationship-types';
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

function newRelationship(id: string, fromContactId: string, toContactId: string, typeId: string) {
	return {
		id,
		householdId: H,
		fromContactId,
		toContactId,
		typeId,
		description: null,
		sinceDate: null,
		status: null,
		createdBy: U1,
		createdAt: 0,
		updatedAt: 0
	};
}

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
	/** A custom type belonging to some other deployment's household. */
	async function seedOwnType() {
		await repo.insertType({
			id: 'type-own',
			householdId: H,
			key: 'sings_with',
			forwardLabel: 'Sings with',
			reverseLabel: 'Sings with',
			category: 'social',
			symmetric: true,
			sortOrder: CUSTOM_TYPE_SORT_ORDER
		});
	}

	function seedForeignType() {
		db.insert(schema.household).values({ id: 'household-2', name: 'Other' }).run();
		db.insert(schema.relationshipType)
			.values({
				id: 'type-foreign',
				householdId: 'household-2',
				key: 'bridge_partner',
				forwardLabel: 'Bridge partner of',
				reverseLabel: 'Bridge partner of',
				category: 'social',
				symmetric: 1,
				sortOrder: 100
			})
			.run();
	}

	it('seeds the built-in types (idempotently)', async () => {
		seedRelationshipTypes(db); // second call must not duplicate
		const types = await repo.listTypes(viewerU1);
		expect(types.find((t) => t.id === 'parent_child')?.forwardLabel).toBe('Parent of');
		expect(types.find((t) => t.id === 'sibling')?.symmetric).toBe(true);
	});

	it("lists the built-in types and this household's own, never another household's", async () => {
		seedForeignType();
		db.insert(schema.relationshipType)
			.values({
				id: 'type-own',
				householdId: H,
				key: 'choir_mate',
				forwardLabel: 'Sings with',
				reverseLabel: 'Sings with',
				category: 'social',
				symmetric: 1,
				sortOrder: 100
			})
			.run();

		const ids = (await repo.listTypes(viewerU1)).map((t) => t.id);
		expect(ids).toContain('parent_child'); // built-in, household_id null
		expect(ids).toContain('type-own');
		expect(ids).not.toContain('type-foreign');
	});

	it("does not resolve another household's type by id", async () => {
		seedForeignType();
		expect(await repo.getType(viewerU1, 'parent_child')).not.toBeNull();
		expect(await repo.getType(viewerU1, 'type-foreign')).toBeNull();
	});

	it('stores a custom type and offers it beside the built-in ones', async () => {
		await repo.insertType({
			id: 'type-own',
			householdId: H,
			key: 'godparent_of',
			forwardLabel: 'Godparent of',
			reverseLabel: 'Godchild of',
			category: 'family',
			symmetric: false,
			sortOrder: CUSTOM_TYPE_SORT_ORDER
		});
		const stored = await repo.getType(viewerU1, 'type-own');
		expect(stored).toEqual({
			id: 'type-own',
			householdId: H,
			key: 'godparent_of',
			forwardLabel: 'Godparent of',
			reverseLabel: 'Godchild of',
			category: 'family',
			symmetric: false,
			sortOrder: CUSTOM_TYPE_SORT_ORDER
		});
		// Custom types sort after every built-in one.
		const listed = await repo.listTypes(viewerU1);
		expect(listed[listed.length - 1]?.id).toBe('type-own');
	});

	it("rewrites and deletes this household's custom type", async () => {
		await seedOwnType();
		expect(
			await repo.updateTypeVisibleTo(viewerU1, 'type-own', {
				forwardLabel: 'Choir friend of',
				reverseLabel: 'Choir friend of',
				category: 'social',
				symmetric: true
			})
		).toBe(true);
		expect((await repo.getType(viewerU1, 'type-own'))?.forwardLabel).toBe('Choir friend of');

		expect(await repo.deleteTypeVisibleTo(viewerU1, 'type-own')).toBe(true);
		expect(await repo.getType(viewerU1, 'type-own')).toBeNull();
	});

	it('leaves a built-in type untouched, whatever is asked of it', async () => {
		expect(
			await repo.updateTypeVisibleTo(viewerU1, 'parent_child', {
				forwardLabel: 'Progenitor of',
				reverseLabel: 'Offspring of',
				category: 'family',
				symmetric: false
			})
		).toBe(false);
		expect(await repo.deleteTypeVisibleTo(viewerU1, 'parent_child')).toBe(false);
		expect((await repo.getType(viewerU1, 'parent_child'))?.forwardLabel).toBe('Parent of');
	});

	it("leaves another household's custom type untouched", async () => {
		seedForeignType();
		expect(
			await repo.updateTypeVisibleTo(viewerU1, 'type-foreign', {
				forwardLabel: 'Hijacked',
				reverseLabel: 'Hijacked',
				category: 'other',
				symmetric: true
			})
		).toBe(false);
		expect(await repo.deleteTypeVisibleTo(viewerU1, 'type-foreign')).toBe(false);
		const row = db
			.select()
			.from(schema.relationshipType)
			.where(eq(schema.relationshipType.id, 'type-foreign'))
			.get();
		expect(row?.forwardLabel).toBe('Bridge partner of');
	});

	it('counts only the relationships of that type the viewer may see', async () => {
		await seedOwnType();
		seedContact('mara', 'Mara', 'shared');
		seedContact('jonas', 'Jonas', 'shared');
		seedContact('secret', 'Secret', 'private', U2);
		await repo.insert(newRelationship('rel-visible', 'mara', 'jonas', 'type-own'));
		await repo.insert(newRelationship('rel-hidden', 'mara', 'secret', 'type-own'));

		expect(await repo.countRelationshipsOfType(viewerU1, 'type-own')).toBe(1);
		// The positive control: U2 owns the private contact and sees both.
		expect(await repo.countRelationshipsOfType(viewerU2, 'type-own')).toBe(2);
		expect(await repo.countRelationshipsOfType(viewerU1, 'parent_child')).toBe(0);
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
			sinceDate: null,
			status: null,
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
			sinceDate: null,
			status: null,
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
			const view = (await repo.listForContactVisibleTo(viewerU1, who)).find(
				(r) => r.otherDisplayName === other
			);
			expect(view).toMatchObject({
				description: 'met at the ski course',
				sinceDate: '2019-06-01',
				status: 'former'
			});
		}
	});

	it('reads a status the domain does not know as nothing said', async () => {
		// The column is plain text; an older row or an import can hold anything.
		db.update(schema.relationship)
			.set({ status: 'complicated' })
			.where(eq(schema.relationship.id, 'rel-pc'))
			.run();

		const [view] = await repo.listForContactVisibleTo(viewerU1, 'bettina');
		expect(view.status).toBeNull();
		// …and a status it does know still comes through, so this is not blanket blindness.
		db.update(schema.relationship)
			.set({ status: 'current' })
			.where(eq(schema.relationship.id, 'rel-pc'))
			.run();
		expect((await repo.listForContactVisibleTo(viewerU1, 'bettina'))[0].status).toBe('current');
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
			status: null,
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

describe('loadKinshipGraphVisibleTo (docs/02 §2.4.1)', () => {
	/** Bettina is Otto's child and Hans's parent; the private pair is only U2's to see. */
	beforeEach(async () => {
		seedContact('otto', 'Otto', 'shared');
		seedContact('bettina', 'Bettina', 'shared');
		seedContact('hans', 'Hans', 'shared');
		seedContact('kurt', 'Kurt', 'shared');
		seedContact('secret', 'Secret', 'private', U2);
		db.update(schema.contact).set({ gender: 'female' }).where(eq(schema.contact.id, 'bettina')).run();
		const rel = (id: string, from: string, to: string, typeId: string) =>
			repo.insert({
				id, householdId: H, fromContactId: from, toContactId: to, typeId,
				description: null, sinceDate: null, status: null, createdBy: U1, createdAt: 1, updatedAt: 1
			});
		await rel('r-1', 'otto', 'bettina', 'parent_child');
		await rel('r-2', 'bettina', 'hans', 'parent_child');
		await rel('r-3', 'bettina', 'kurt', 'partner');
		await rel('r-4', 'otto', 'hans', 'friend'); // a stored pair that is not primary
		await rel('r-5', 'secret', 'hans', 'parent_child'); // only U2 may see this one
	});

	it('classifies the primary links and carries gender, for the people the viewer may see', async () => {
		const graph = await repo.loadKinshipGraphVisibleTo(viewerU1);
		expect(graph.people.map((p) => p.id).sort()).toEqual(['bettina', 'hans', 'kurt', 'otto']);
		expect(graph.people.find((p) => p.id === 'bettina')?.gender).toBe('female');
		expect(graph.parentEdges).toEqual([
			{ parentId: 'otto', childId: 'bettina' },
			{ parentId: 'bettina', childId: 'hans' }
		]);
		expect(graph.partnerEdges).toEqual([{ a: 'bettina', b: 'kurt' }]);
		// Every visible pair is a stored pair, so nothing already linked is re-derived.
		expect(graph.storedPairs).toContainEqual({ a: 'otto', b: 'hans' });
	});

	it('keeps a partner marked former in the graph, because step-family hangs on it', async () => {
		// docs/02 §2.4: the status says how the household reads the link today, not that it
		// never happened — a divorce does not unmake a stepmother.
		db.update(schema.relationship)
			.set({ status: 'former' })
			.where(eq(schema.relationship.id, 'r-3'))
			.run();

		const graph = await repo.loadKinshipGraphVisibleTo(viewerU1);
		expect(graph.partnerEdges).toEqual([{ a: 'bettina', b: 'kurt' }]);
	});

	it('hides a private person’s links from everyone but their author', async () => {
		const forU1 = await repo.loadKinshipGraphVisibleTo(viewerU1);
		expect(forU1.people.map((p) => p.id)).not.toContain('secret');
		expect(forU1.parentEdges).not.toContainEqual({ parentId: 'secret', childId: 'hans' });
		// Positive control: the author sees both the person and the link.
		const forU2 = await repo.loadKinshipGraphVisibleTo(viewerU2);
		expect(forU2.people.map((p) => p.id)).toContain('secret');
		expect(forU2.parentEdges).toContainEqual({ parentId: 'secret', childId: 'hans' });
	});
});

/*
 * Correcting and taking back a link (docs/02 §2.4). Both are scoped through
 * `relationshipVisibleTo`, so a relationship touching someone the viewer cannot see is
 * indistinguishable from one that is not there — and neither writes anything in that case.
 */
describe('updateDetailsVisibleTo / removeVisibleTo', () => {
	beforeEach(async () => {
		seedContact('hans', 'Hans', 'shared');
		seedContact('bettina', 'Bettina', 'shared');
		seedContact('secret', 'Secret', 'private', U2); // U2's own, invisible to U1
		await repo.insert({
			id: 'rel-open', householdId: H, fromContactId: 'bettina', toContactId: 'hans',
			typeId: 'parent_child', description: null, sinceDate: null, status: null,
			createdBy: U1, createdAt: 0, updatedAt: 0
		});
		await repo.insert({
			id: 'rel-hidden', householdId: H, fromContactId: 'hans', toContactId: 'secret',
			typeId: 'friend', description: 'quiet', sinceDate: null, status: null,
			createdBy: U2, createdAt: 0, updatedAt: 0
		});
	});

	const detailsOf = async (id: string) =>
		db.select().from(schema.relationship).where(eq(schema.relationship.id, id)).get();

	it('writes the specifics onto a relationship the viewer can see', async () => {
		const written = await repo.updateDetailsVisibleTo(
			viewerU1,
			'rel-open',
			{ description: 'she raised him alone', sinceDate: '1994-03-02', status: 'current' },
			1_700_000_000_000
		);

		expect(written).toBe(true);
		expect(await detailsOf('rel-open')).toMatchObject({
			note: 'she raised him alone',
			sinceDate: '1994-03-02',
			status: 'current'
		});
	});

	it('refuses to touch one whose other endpoint the viewer cannot see', async () => {
		const patch = { description: 'changed', sinceDate: null, status: null };
		expect(await repo.updateDetailsVisibleTo(viewerU1, 'rel-hidden', patch, 1)).toBe(false);
		expect((await detailsOf('rel-hidden'))?.note).toBe('quiet');

		// The owner of the private endpoint may, so this is scoping and not a blanket refusal.
		expect(await repo.updateDetailsVisibleTo(viewerU2, 'rel-hidden', patch, 1)).toBe(true);
		expect((await detailsOf('rel-hidden'))?.note).toBe('changed');
	});

	it('removes a link the viewer can see', async () => {
		expect(await repo.removeVisibleTo(viewerU1, 'rel-open')).toBe(true);
		expect(await detailsOf('rel-open')).toBeUndefined();
		expect(await repo.listForContactVisibleTo(viewerU1, 'hans')).toEqual([]);
	});

	it('refuses to remove one it will not show, and leaves the row where it is', async () => {
		expect(await repo.removeVisibleTo(viewerU1, 'rel-hidden')).toBe(false);
		expect(await detailsOf('rel-hidden')).toBeDefined();

		expect(await repo.removeVisibleTo(viewerU2, 'rel-hidden')).toBe(true);
		expect(await detailsOf('rel-hidden')).toBeUndefined();
	});

	it('says no rather than throwing for a relationship that is not there at all', async () => {
		expect(await repo.removeVisibleTo(viewerU1, 'no-such-relationship')).toBe(false);
		expect(
			await repo.updateDetailsVisibleTo(
				viewerU1,
				'no-such-relationship',
				{ description: null, sinceDate: null, status: null },
				1
			)
		).toBe(false);
	});
});
