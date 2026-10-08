import { beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import * as schema from './schema';
import { seedRelationshipTypes } from './seed';
import {
	CUSTOM_TYPE_SORT_ORDER,
	type RelationshipTypeRepository,
	type RelationshipTypeUsageReads
} from '../domain/relationships/relationship-types';
import { BUILT_IN_RELATIONSHIP_TYPES } from '../domain/relationships/built-in-types';
import { CURRENT_RELATIONSHIP_STATUS } from '../../relationships/status';
import { createDrizzleRelationshipTypeRepository } from './relationship-type-repository';
import { createDrizzleRelationshipRepository } from './relationship-repository';
import type { RelationshipRepository } from '../domain/relationships/relationships';
import { createDrizzleRelationshipTypeUsageReads } from './relationship-type-usage-reads';

/*
 * Integration spec for the Drizzle RelationshipTypeRepository: the built-in vocabulary and a
 * household's own types, which no other household can resolve (docs/03 §3.6), the guards on
 * changing a type in use, and folding one type into another.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let types: RelationshipTypeRepository;
let repo: RelationshipRepository;
let usage: RelationshipTypeUsageReads;

function newRelationship(id: string, fromContactId: string, toContactId: string, typeId: string) {
	return {
		id,
		householdId: H,
		fromContactId,
		toContactId,
		typeId,
		description: null,
		sinceDate: null,
		status: CURRENT_RELATIONSHIP_STATUS,
		createdBy: U1,
		createdAt: 0,
		updatedAt: 0
	};
}

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
	types = createDrizzleRelationshipTypeRepository(db);
	repo = createDrizzleRelationshipRepository(db);
	usage = createDrizzleRelationshipTypeUsageReads(db);
});

describe('relationship types', () => {
	/** A custom type belonging to some other deployment's household. */
	async function seedOwnType() {
		await types.insertType({
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
		const listed = await types.listTypes(viewerU1);
		expect(listed.find((t) => t.id === 'parent_child')?.forwardLabel).toBe('Parent of');
		expect(listed.find((t) => t.id === 'sibling')?.symmetric).toBe(true);
	});

	it('brings an older install up to the current built-ins: new types added, the order redone', async () => {
		// As an install seeded before the family types were added left it.
		db.delete(schema.relationshipType).where(eq(schema.relationshipType.id, 'cousin')).run();
		db.update(schema.relationshipType)
			.set({ sortOrder: 5 })
			.where(eq(schema.relationshipType.id, 'friend'))
			.run();

		seedRelationshipTypes(db);

		const listed = await types.listTypes(viewerU1);
		const expected = BUILT_IN_RELATIONSHIP_TYPES.find((t) => t.id === 'friend')!.sortOrder;
		expect(listed.find((t) => t.id === 'friend')?.sortOrder).toBe(expected);
		expect(listed.find((t) => t.id === 'cousin')?.symmetric).toBe(true);
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

		const ids = (await types.listTypes(viewerU1)).map((t) => t.id);
		expect(ids).toContain('parent_child'); // built-in, household_id null
		expect(ids).toContain('type-own');
		expect(ids).not.toContain('type-foreign');
	});

	it("does not resolve another household's type by id", async () => {
		seedForeignType();
		expect(await types.getType(viewerU1, 'parent_child')).not.toBeNull();
		expect(await types.getType(viewerU1, 'type-foreign')).toBeNull();
	});

	it('stores a custom type and offers it beside the built-in ones', async () => {
		await types.insertType({
			id: 'type-own',
			householdId: H,
			key: 'godparent_of',
			forwardLabel: 'Godparent of',
			reverseLabel: 'Godchild of',
			category: 'family',
			symmetric: false,
			sortOrder: CUSTOM_TYPE_SORT_ORDER
		});
		const stored = await types.getType(viewerU1, 'type-own');
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
		const listed = await types.listTypes(viewerU1);
		expect(listed[listed.length - 1]?.id).toBe('type-own');
	});

	it("rewrites and deletes this household's custom type", async () => {
		await seedOwnType();
		expect(
			await types.updateTypeVisibleTo(viewerU1, 'type-own', {
				forwardLabel: 'Choir friend of',
				reverseLabel: 'Choir friend of',
				category: 'social',
				symmetric: true
			})
		).toBe(true);
		expect((await types.getType(viewerU1, 'type-own'))?.forwardLabel).toBe('Choir friend of');

		expect(await types.deleteTypeVisibleTo(viewerU1, 'type-own')).toBe(true);
		expect(await types.getType(viewerU1, 'type-own')).toBeNull();
	});

	it('leaves a built-in type untouched, whatever is asked of it', async () => {
		expect(
			await types.updateTypeVisibleTo(viewerU1, 'parent_child', {
				forwardLabel: 'Progenitor of',
				reverseLabel: 'Offspring of',
				category: 'family',
				symmetric: false
			})
		).toBe(false);
		expect(await types.deleteTypeVisibleTo(viewerU1, 'parent_child')).toBe(false);
		expect((await types.getType(viewerU1, 'parent_child'))?.forwardLabel).toBe('Parent of');
	});

	it("leaves another household's custom type untouched", async () => {
		seedForeignType();
		expect(
			await types.updateTypeVisibleTo(viewerU1, 'type-foreign', {
				forwardLabel: 'Hijacked',
				reverseLabel: 'Hijacked',
				category: 'other',
				symmetric: true
			})
		).toBe(false);
		expect(await types.deleteTypeVisibleTo(viewerU1, 'type-foreign')).toBe(false);
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

		expect(await types.countRelationshipsOfType(viewerU1, 'type-own')).toBe(1);
		// The positive control: U2 owns the private contact and sees both.
		expect(await types.countRelationshipsOfType(viewerU2, 'type-own')).toBe(2);
		expect(await types.countRelationshipsOfType(viewerU1, 'parent_child')).toBe(0);
	});

	it('counts every type at once, the same as asking type by type', async () => {
		await seedOwnType();
		seedContact('mara', 'Mara', 'shared');
		seedContact('jonas', 'Jonas', 'shared');
		seedContact('lio', 'Lio', 'shared');
		seedContact('secret', 'Secret', 'private', U2);
		await repo.insert(newRelationship('rel-1', 'mara', 'jonas', 'type-own'));
		await repo.insert(newRelationship('rel-2', 'jonas', 'lio', 'type-own'));
		await repo.insert(newRelationship('rel-3', 'mara', 'secret', 'type-own'));
		await repo.insert(newRelationship('rel-4', 'mara', 'lio', 'parent_child'));

		for (const viewer of [viewerU1, viewerU2]) {
			const counts = await usage.countRelationshipsByType(viewer);
			for (const typeId of ['type-own', 'parent_child', 'sibling']) {
				expect(counts.get(typeId) ?? 0).toBe(await types.countRelationshipsOfType(viewer, typeId));
			}
		}
		expect((await usage.countRelationshipsByType(viewerU1)).get('type-own')).toBe(2);
	});
});

describe('mergeTypeInto', () => {
	/** A symmetric custom *Cousin of* as an older Monica import created it. */
	async function seedImportedCousin() {
		await types.insertType({
			id: 'monica:reltype:cousin',
			householdId: H,
			key: 'cousin',
			forwardLabel: 'Cousin of',
			reverseLabel: 'Cousin of',
			category: 'family',
			symmetric: true,
			sortOrder: CUSTOM_TYPE_SORT_ORDER
		});
	}

	const typesOf = (from: string, to: string) =>
		db
			.select({ typeId: schema.relationship.typeId })
			.from(schema.relationship)
			.where(
				and(eq(schema.relationship.fromContactId, from), eq(schema.relationship.toContactId, to))
			)
			.all()
			.map((row) => row.typeId);

	it('moves every relationship across, even between people the viewer cannot see, and deletes the type', async () => {
		await seedImportedCousin();
		seedContact('mara', 'Mara', 'shared');
		seedContact('jonas', 'Jonas', 'shared');
		seedContact('secret', 'Secret', 'private', U2);
		await repo.insert(newRelationship('rel-visible', 'jonas', 'mara', 'monica:reltype:cousin'));
		await repo.insert(newRelationship('rel-hidden', 'mara', 'secret', 'monica:reltype:cousin'));

		expect(await types.mergeTypeInto(viewerU1, 'monica:reltype:cousin', 'cousin')).toBe(true);

		expect(typesOf('jonas', 'mara')).toEqual(['cousin']);
		expect(typesOf('mara', 'secret')).toEqual(['cousin']);
		expect(await types.getType(viewerU1, 'monica:reltype:cousin')).toBeNull();
	});

	it('keeps the link a pair already has under the target, and drops the duplicate', async () => {
		await seedImportedCousin();
		seedContact('mara', 'Mara', 'shared');
		seedContact('jonas', 'Jonas', 'shared');
		await repo.insert(newRelationship('rel-built-in', 'jonas', 'mara', 'cousin'));
		await repo.insert(newRelationship('rel-imported', 'jonas', 'mara', 'monica:reltype:cousin'));

		expect(await types.mergeTypeInto(viewerU1, 'monica:reltype:cousin', 'cousin')).toBe(true);

		const rows = db.select({ id: schema.relationship.id }).from(schema.relationship).all();
		expect(rows).toEqual([{ id: 'rel-built-in' }]);
	});

	it("refuses a built-in or another household's type as the one folded away, writing nothing", async () => {
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
				sortOrder: CUSTOM_TYPE_SORT_ORDER
			})
			.run();
		seedContact('mara', 'Mara', 'shared');
		seedContact('jonas', 'Jonas', 'shared');
		await repo.insert(newRelationship('rel-1', 'jonas', 'mara', 'cousin'));

		expect(await types.mergeTypeInto(viewerU1, 'cousin', 'friend')).toBe(false);
		expect(await types.mergeTypeInto(viewerU1, 'type-foreign', 'friend')).toBe(false);
		expect(typesOf('jonas', 'mara')).toEqual(['cousin']);
		expect(await types.getType(viewerU1, 'cousin')).not.toBeNull();
	});
});
