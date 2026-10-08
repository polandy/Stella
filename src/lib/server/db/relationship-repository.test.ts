import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import * as schema from './schema';
import { seedRelationshipTypes } from './seed';
import { CURRENT_RELATIONSHIP_STATUS } from '../../relationships/status';
import { createDrizzleRelationshipRepository } from './relationship-repository';
import { createDrizzleRelationshipTieReads } from './relationship-tie-reads';
import type {
	RelationshipRepository,
	RelationshipTieReads
} from '../domain/relationships/relationships';

/*
 * Integration spec for the Drizzle RelationshipRepository: duplicate checks, the batch and its
 * undo in one transaction, and writes scoped by visibility — a relationship needs both
 * endpoints visible (docs/03 §3.7), and one out of sight cannot be changed or removed.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: RelationshipRepository;
let ties: RelationshipTieReads;

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
	repo = createDrizzleRelationshipRepository(db);
	ties = createDrizzleRelationshipTieReads(db);
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
			status: CURRENT_RELATIONSHIP_STATUS,
			createdBy: U1,
			createdAt: 0,
			updatedAt: 0
		});
		expect(await repo.exists('bettina', 'hans', 'parent_child')).toBe(true);
	});

	/*
	 * The contradiction guard asks the same question with the endpoints swapped (docs/02 §2.4),
	 * so the query must answer per direction rather than per pair — a normalising `where` would
	 * make the guard fire on every second link instead of on a real contradiction.
	 */
	it('answers per direction: the stored way round is found, the flipped one is not', async () => {
		seedContact('hans', 'Hans', 'shared');
		seedContact('bettina', 'Bettina', 'shared');
		await repo.insert(newRelationship('rel-1', 'hans', 'bettina', 'parent_child'));

		expect(await repo.exists('hans', 'bettina', 'parent_child')).toBe(true);
		expect(await repo.exists('bettina', 'hans', 'parent_child')).toBe(false);
	});

	/* Retyping a link asks the guards about its own pair, so it must be left out (docs/02 §2.4). */
	it('leaves the named relationship out of the answer', async () => {
		seedContact('hans', 'Hans', 'shared');
		seedContact('bettina', 'Bettina', 'shared');
		await repo.insert(newRelationship('rel-1', 'hans', 'bettina', 'parent_child'));
		await repo.insert(newRelationship('rel-2', 'hans', 'bettina', 'friend'));

		expect(await repo.exists('hans', 'bettina', 'parent_child', 'rel-1')).toBe(false);
		// Another row of the same pair still counts, and so does the same row under another type.
		expect(await repo.exists('hans', 'bettina', 'friend', 'rel-1')).toBe(true);
		expect(await repo.exists('hans', 'bettina', 'parent_child', 'rel-2')).toBe(true);
	});
});

describe('insertAll (docs/02 §2.4, several people in one go)', () => {
	const stored = () =>
		db
			.select({ id: schema.relationship.id })
			.from(schema.relationship)
			.all()
			.map((r) => r.id);

	it('stores every link of the batch', async () => {
		seedContact('lio', 'Lio', 'shared');
		seedContact('anna', 'Anna', 'shared');
		seedContact('bert', 'Bert', 'shared');
		await repo.insertAll([
			{
				...newRelationship('rel-1', 'anna', 'lio', 'parent_child'),
				description: 'mum',
				sinceDate: '2015-04-12'
			},
			newRelationship('rel-2', 'bert', 'lio', 'parent_child')
		]);

		expect(stored().sort()).toEqual(['rel-1', 'rel-2']);
		expect(await ties.listForContactVisibleTo(viewerU1, 'anna')).toMatchObject([
			{ id: 'rel-1', description: 'mum', sinceDate: '2015-04-12', label: 'Parent of' }
		]);
	});

	it('stores none of them when the database refuses one', async () => {
		seedContact('lio', 'Lio', 'shared');
		seedContact('anna', 'Anna', 'shared');
		await expect(
			repo.insertAll([
				newRelationship('rel-1', 'anna', 'lio', 'parent_child'),
				// Nobody by this id: the foreign key refuses the row, and the batch with it.
				newRelationship('rel-2', 'nobody', 'lio', 'parent_child')
			])
		).rejects.toThrow();
		expect(stored()).toEqual([]);
	});
});

describe('removeAllVisibleTo (the undo of a batch)', () => {
	const stored = () =>
		db
			.select({ id: schema.relationship.id })
			.from(schema.relationship)
			.all()
			.map((r) => r.id)
			.sort();

	beforeEach(async () => {
		seedContact('hans', 'Hans', 'shared');
		seedContact('bettina', 'Bettina', 'shared');
		seedContact('secret', 'Secret', 'private', U2);
		await repo.insert(newRelationship('rel-a', 'bettina', 'hans', 'parent_child'));
		await repo.insert(newRelationship('rel-b', 'hans', 'bettina', 'friend'));
		await repo.insert(newRelationship('rel-hidden', 'hans', 'secret', 'friend'));
	});

	it('removes every link named, in one step', async () => {
		expect(await repo.removeAllVisibleTo(viewerU1, ['rel-a', 'rel-b'])).toBe(true);
		expect(stored()).toEqual(['rel-hidden']);
	});

	it('removes none when one of them is out of the viewer’s sight', async () => {
		expect(await repo.removeAllVisibleTo(viewerU1, ['rel-a', 'rel-hidden'])).toBe(false);
		expect(stored()).toEqual(['rel-a', 'rel-b', 'rel-hidden']);
	});

	it('removes none when one of them is not there at all', async () => {
		expect(await repo.removeAllVisibleTo(viewerU1, ['rel-a', 'no-such-link'])).toBe(false);
		expect(stored()).toEqual(['rel-a', 'rel-b', 'rel-hidden']);
	});
});

describe('findVisibleTo / updateVisibleTo / removeVisibleTo', () => {
	beforeEach(async () => {
		seedContact('hans', 'Hans', 'shared');
		seedContact('bettina', 'Bettina', 'shared');
		seedContact('secret', 'Secret', 'private', U2); // U2's own, invisible to U1
		await repo.insert({
			id: 'rel-open',
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
		await repo.insert({
			id: 'rel-hidden',
			householdId: H,
			fromContactId: 'hans',
			toContactId: 'secret',
			typeId: 'friend',
			description: 'quiet',
			sinceDate: null,
			status: CURRENT_RELATIONSHIP_STATUS,
			createdBy: U2,
			createdAt: 0,
			updatedAt: 0
		});
	});

	const detailsOf = async (id: string) =>
		db.select().from(schema.relationship).where(eq(schema.relationship.id, id)).get();

	it('writes the specifics onto a relationship the viewer can see', async () => {
		const written = await repo.updateVisibleTo(
			viewerU1,
			'rel-open',
			{
				description: 'she raised him alone',
				sinceDate: '1994-03-02',
				status: CURRENT_RELATIONSHIP_STATUS,
				retype: null
			},
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
		const patch = {
			description: 'changed',
			sinceDate: null,
			status: CURRENT_RELATIONSHIP_STATUS,
			retype: null
		};
		expect(await repo.updateVisibleTo(viewerU1, 'rel-hidden', patch, 1)).toBe(false);
		expect((await detailsOf('rel-hidden'))?.note).toBe('quiet');

		// The owner of the private endpoint may, so this is scoping and not a blanket refusal.
		expect(await repo.updateVisibleTo(viewerU2, 'rel-hidden', patch, 1)).toBe(true);
		expect((await detailsOf('rel-hidden'))?.note).toBe('changed');
	});

	it('removes a link the viewer can see', async () => {
		expect(await repo.removeVisibleTo(viewerU1, 'rel-open')).toBe(true);
		expect(await detailsOf('rel-open')).toBeUndefined();
		expect(await ties.listForContactVisibleTo(viewerU1, 'hans')).toEqual([]);
	});

	it('refuses to remove one it will not show, and leaves the row where it is', async () => {
		expect(await repo.removeVisibleTo(viewerU1, 'rel-hidden')).toBe(false);
		expect(await detailsOf('rel-hidden')).toBeDefined();

		expect(await repo.removeVisibleTo(viewerU2, 'rel-hidden')).toBe(true);
		expect(await detailsOf('rel-hidden')).toBeUndefined();
	});

	it('reads a link back for the viewer who may see it, and not for the one who may not', async () => {
		expect(await repo.findVisibleTo(viewerU1, 'rel-open')).toEqual({
			id: 'rel-open',
			fromContactId: 'bettina',
			toContactId: 'hans',
			typeId: 'parent_child'
		});
		expect(await repo.findVisibleTo(viewerU1, 'rel-hidden')).toBeNull();
		// The owner of the private endpoint may, so this is scoping and not a blanket refusal.
		expect(await repo.findVisibleTo(viewerU2, 'rel-hidden')).not.toBeNull();
		expect(await repo.findVisibleTo(viewerU1, 'no-such-relationship')).toBeNull();
	});

	/* A retype can move the row's endpoints as well as its type (docs/02 §2.4). */
	it('writes the new type and stored direction together with the specifics', async () => {
		const written = await repo.updateVisibleTo(
			viewerU1,
			'rel-open',
			{
				description: null,
				sinceDate: null,
				status: CURRENT_RELATIONSHIP_STATUS,
				retype: {
					endpoints: { fromContactId: 'hans', toContactId: 'bettina' },
					typeId: 'grandparent_grandchild'
				}
			},
			1_700_000_000_000
		);

		expect(written).toBe(true);
		expect(await detailsOf('rel-open')).toMatchObject({
			fromContactId: 'hans',
			toContactId: 'bettina',
			typeId: 'grandparent_grandchild'
		});
	});

	it('leaves the type and direction untouched when the update carries no retype', async () => {
		await repo.updateVisibleTo(
			viewerU1,
			'rel-open',
			{
				description: 'unchanged type',
				sinceDate: null,
				status: CURRENT_RELATIONSHIP_STATUS,
				retype: null
			},
			1
		);

		expect(await detailsOf('rel-open')).toMatchObject({
			fromContactId: 'bettina',
			toContactId: 'hans',
			typeId: 'parent_child',
			note: 'unchanged type'
		});
	});

	it('says no rather than throwing for a relationship that is not there at all', async () => {
		expect(await repo.removeVisibleTo(viewerU1, 'no-such-relationship')).toBe(false);
		expect(
			await repo.updateVisibleTo(
				viewerU1,
				'no-such-relationship',
				{ description: null, sinceDate: null, status: CURRENT_RELATIONSHIP_STATUS, retype: null },
				1
			)
		).toBe(false);
	});
});
