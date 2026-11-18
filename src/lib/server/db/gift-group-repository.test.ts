import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { GiftGroup } from '../domain/gifts/gift-groups';
import type { Gift } from '../domain/gifts/gifts';
import { createDrizzleGiftGroupRepository } from './gift-group-repository';
import * as schema from './schema';

/*
 * The Drizzle GiftGroupRepository (docs/dev/02 §2.25.11): a group and its gifts are stored together,
 * and a group reads back with only the gifts the viewer may see — none of a surprise for the member
 * whose own person is among the people it is for.
 */

const H = 'h1';
const ANDY = 'u-andy';
const JULIA = 'u-julia';
const andy: Viewer = { id: ANDY, householdId: H };
const julia: Viewer = { id: JULIA, householdId: H };
const foreign: Viewer = { id: 'u-x', householdId: 'h2' };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleGiftGroupRepository>;

const group = (over: Partial<GiftGroup> = {}): GiftGroup => ({
	id: 'gg',
	householdId: H,
	createdBy: ANDY,
	title: 'Puzzle',
	note: 'the big one',
	url: null,
	when: { kind: 'christmas_at_age', age: 6 },
	occasion: 'christmas',
	visibility: 'shared',
	hiddenFromRecipients: false,
	createdAt: 1,
	updatedAt: 1,
	...over
});

const giftFor = (contactId: string, over: Partial<Gift> = {}): Gift => ({
	id: `g-${contactId}`,
	contactId,
	createdBy: ANDY,
	visibility: 'shared',
	hiddenFromRecipient: false,
	state: 'idea',
	title: 'Puzzle',
	note: 'the big one',
	url: null,
	givenOn: null,
	occasion: null,
	when: { kind: 'christmas_at_age', age: 6 },
	whenCheckedOn: null,
	groupId: 'gg',
	createdAt: 1,
	updatedAt: 1,
	...over
});

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: ANDY, householdId: H, email: 'a@x.test', name: 'Andy' },
			{ id: JULIA, householdId: H, email: 'j@x.test', name: 'Julia' }
		])
		.run();
	db.insert(schema.contact)
		.values(
			['mia', 'ben', 'julia'].map((id) => ({
				id,
				householdId: H,
				createdBy: ANDY,
				displayName: id
			}))
		)
		.run();
	db.update(schema.user).set({ selfContactId: 'julia' }).where(eq(schema.user.id, JULIA)).run();
	repo = createDrizzleGiftGroupRepository(db);
});

describe('createDrizzleGiftGroupRepository', () => {
	it('stores the group and its gifts, and reads them back', async () => {
		await repo.insert(group(), [giftFor('mia'), giftFor('ben')]);
		const read = await repo.findVisibleTo(julia, 'gg');
		expect(read?.group).toEqual(group());
		expect(read?.gifts.map((g) => [g.contactId, g.groupId, g.when])).toEqual([
			['ben', 'gg', { kind: 'christmas_at_age', age: 6 }],
			['mia', 'gg', { kind: 'christmas_at_age', age: 6 }]
		]);
	});

	it('stores neither when one gift cannot be stored', async () => {
		const broken = giftFor('nobody-here');
		await expect(repo.insert(group(), [giftFor('mia'), broken])).rejects.toThrow();
		expect(db.select().from(schema.giftGroup).all()).toEqual([]);
		expect(db.select().from(schema.gift).all()).toEqual([]);
	});

	it('shows nothing of a surprise to a member it is for, all of it to everyone else', async () => {
		const hidden = { hiddenFromRecipient: true };
		await repo.insert(group({ hiddenFromRecipients: true }), [
			giftFor('mia', hidden),
			giftFor('julia', hidden)
		]);
		expect(await repo.findVisibleTo(julia, 'gg')).toBeNull();
		expect((await repo.findVisibleTo(andy, 'gg'))?.gifts).toHaveLength(2);
	});

	it('keeps a private group and another household out', async () => {
		const priv = { visibility: 'private' as const };
		await repo.insert(group(priv), [giftFor('mia', priv)]);
		expect(await repo.findVisibleTo(julia, 'gg')).toBeNull();
		expect(await repo.findVisibleTo(foreign, 'gg')).toBeNull();
		expect(await repo.findVisibleTo(andy, 'gg')).not.toBeNull();
	});
});
