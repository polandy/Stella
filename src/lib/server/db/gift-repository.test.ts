import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { Gift } from '../domain/gifts/gifts';
import { createDrizzleGiftRepository } from './gift-repository';
import * as schema from './schema';

/*
 * Integration spec for the Drizzle GiftRepository (docs/02 §2.25): child-record visibility
 * (a private gift reaches only its author, a gift on a private person only that person's
 * creator — docs/03 §3.7), the card's order, and the story's keyset page of given and received
 * gifts (docs/02 §2.23).
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleGiftRepository>;

function gift(over: Partial<Gift>): Gift {
	return {
		id: 'g',
		contactId: 'c-shared',
		createdBy: U1,
		visibility: 'shared',
		state: 'idea',
		title: 'Teapot',
		note: null,
		url: null,
		givenOn: null,
		occasion: null,
		createdAt: 0,
		updatedAt: 0,
		...over
	};
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-shared', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'S' },
			{ id: 'c-priv', householdId: H, createdBy: U1, visibility: 'private', displayName: 'P' }
		])
		.run();
	repo = createDrizzleGiftRepository(db);
});

describe('createDrizzleGiftRepository', () => {
	it('reads a gift back as it was stored', async () => {
		const stored = gift({
			id: 'g-1',
			state: 'given',
			note: 'The black one',
			url: 'https://shop.example',
			givenOn: '2023-10-12',
			occasion: 'birthday',
			createdAt: 5,
			updatedAt: 6
		});
		await repo.insert(stored);
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 'g-1')).toEqual(stored);
	});

	it('hides a private gift from other members, but not from its author', async () => {
		await repo.insert(gift({ id: 'g-priv', visibility: 'private' }));
		expect(await repo.findVisibleTo(viewerU2, 'c-shared', 'g-priv')).toBeNull();
		expect(await repo.listForContactVisibleTo(viewerU2, 'c-shared')).toEqual([]);
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 'g-priv')).not.toBeNull();
	});

	it('hides a gift on a person the viewer cannot see, however it is shared', async () => {
		await repo.insert(gift({ id: 'g-1', contactId: 'c-priv' }));
		expect(await repo.findVisibleTo(viewerU2, 'c-priv', 'g-1')).toBeNull();
		expect(await repo.listForContactVisibleTo(viewerU2, 'c-priv')).toEqual([]);
	});

	it('finds a gift only on the person it is for', async () => {
		await repo.insert(gift({ id: 'g-1', contactId: 'c-priv' }));
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 'g-1')).toBeNull();
	});

	it('lists ideas newest first, then given and received gifts newest day first', async () => {
		await repo.insert(gift({ id: 'idea-old', createdAt: 1 }));
		await repo.insert(gift({ id: 'idea-new', createdAt: 9 }));
		await repo.insert(gift({ id: 'given-2023', state: 'given', givenOn: '2023-10-12' }));
		await repo.insert(gift({ id: 'recv-2025', state: 'received', givenOn: '2025-12-24' }));
		await repo.insert(gift({ id: 'given-2024', state: 'given', givenOn: '2024-12-24' }));
		const ids = (await repo.listForContactVisibleTo(viewerU1, 'c-shared')).map((g) => g.id);
		expect(ids).toEqual(['idea-new', 'idea-old', 'recv-2025', 'given-2024', 'given-2023']);
	});

	it('updates and removes a gift', async () => {
		await repo.insert(gift({ id: 'g-1' }));
		await repo.update(gift({ id: 'g-1', state: 'given', givenOn: '2026-10-18', updatedAt: 7 }));
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 'g-1')).toMatchObject({
			state: 'given',
			givenOn: '2026-10-18',
			updatedAt: 7
		});
		await repo.remove('g-1');
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 'g-1')).toBeNull();
	});

	it('goes with the person it is for', async () => {
		await repo.insert(gift({ id: 'g-1' }));
		db.delete(schema.contact).run();
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 'g-1')).toBeNull();
	});

	describe('listStoryPageForContactVisibleTo', () => {
		beforeEach(async () => {
			await repo.insert(gift({ id: 'idea', createdAt: 99 }));
			await repo.insert(gift({ id: 'a', state: 'given', givenOn: '2025-10-18', createdAt: 1 }));
			await repo.insert(gift({ id: 'b', state: 'received', givenOn: '2025-10-18', createdAt: 2 }));
			await repo.insert(gift({ id: 'c', state: 'given', givenOn: '2024-12-24', createdAt: 3 }));
			await repo.insert(
				gift({ id: 'd', state: 'given', givenOn: '2023-01-01', visibility: 'private' })
			);
		});
		const page = async (viewer: Viewer, before?: { givenOn: string; createdAt: number }) =>
			(await repo.listStoryPageForContactVisibleTo(viewer, 'c-shared', { limit: 2, before })).map(
				(g) => g.id
			);

		it('reads given and received gifts in the story’s order, never an idea', async () => {
			expect(await page(viewerU1)).toEqual(['b', 'a']);
		});

		it('resumes strictly after the last one read', async () => {
			expect(await page(viewerU1, { givenOn: '2025-10-18', createdAt: 1 })).toEqual(['c', 'd']);
			expect(await page(viewerU1, { givenOn: '2025-10-18', createdAt: 2 })).toEqual(['a', 'c']);
		});

		it('leaves out a private gift of somebody else', async () => {
			expect(await page(viewerU2, { givenOn: '2024-12-24', createdAt: 3 })).toEqual([]);
		});
	});
});
