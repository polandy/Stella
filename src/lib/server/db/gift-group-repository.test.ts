import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { GiftGroup } from '../domain/gifts/gift-groups';
import { NO_GIVER, type Gift } from '../domain/gifts/gifts';
import { createDrizzleGiftGroupRepository } from './gift-group-repository';
import * as schema from './schema';

// The Drizzle GiftGroupRepository (docs/dev/02 §2.25.11): stored together, read scoped by visibility.

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
	...NO_GIVER,
	storedAt: null,
	value: null,
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

	it('reads each person with their name and birth', async () => {
		db.update(schema.contact)
			.set({ birthDate: '2020-03-04', birthDatePrecision: 'full' })
			.where(eq(schema.contact.id, 'mia'))
			.run();
		await repo.insert(group(), [giftFor('mia')]);
		const read = await repo.findVisibleTo(andy, 'gg');
		expect(read?.gifts[0]).toMatchObject({
			contactName: 'mia',
			birth: { value: '2020-03-04', precision: 'full' }
		});
	});

	it('lists the groups with a gift on a person, each with all its gifts', async () => {
		await repo.insert(group(), [giftFor('mia'), giftFor('ben')]);
		await repo.insert(group({ id: 'other' }), [
			giftFor('ben', { id: 'g-ben-2', groupId: 'other' })
		]);
		const onMia = await repo.listForContactVisibleTo(andy, 'mia');
		expect(onMia.map((r) => [r.group.id, r.gifts.map((g) => g.contactId)])).toEqual([
			['gg', ['ben', 'mia']]
		]);
		expect((await repo.listForContactVisibleTo(andy, 'ben')).map((r) => r.group.id).sort()).toEqual(
			['gg', 'other']
		);
		expect(await repo.listForContactVisibleTo(foreign, 'mia')).toEqual([]);
	});

	it('reads the groups asked for, each with all the viewer may see of it', async () => {
		await repo.insert(group(), [giftFor('mia'), giftFor('ben')]);
		await repo.insert(group({ id: 'other' }), [
			giftFor('ben', { id: 'g-ben-2', groupId: 'other' })
		]);
		const read = await repo.listVisibleTo(andy, ['gg', 'missing']);
		expect(read.map((r) => [r.group.id, r.gifts.map((g) => g.contactId)])).toEqual([
			['gg', ['ben', 'mia']]
		]);
		expect(await repo.listVisibleTo(andy, [])).toEqual([]);
		expect(await repo.listVisibleTo(foreign, ['gg'])).toEqual([]);
	});

	it('lists a private or surprise group on a card only for whom it is visible', async () => {
		const priv = { visibility: 'private' as const };
		await repo.insert(group({ id: 'priv', ...priv }), [
			giftFor('mia', { id: 'g-priv', groupId: 'priv', ...priv })
		]);
		const hidden = { hiddenFromRecipient: true };
		await repo.insert(group({ hiddenFromRecipients: true }), [
			giftFor('mia', hidden),
			giftFor('julia', hidden)
		]);
		expect(await repo.listForContactVisibleTo(julia, 'mia')).toEqual([]);
		expect((await repo.listForContactVisibleTo(andy, 'mia')).map((r) => r.group.id).sort()).toEqual(
			['gg', 'priv']
		);
	});

	it('writes a change whole: the group, new, changed and removed gifts', async () => {
		await repo.insert(group(), [giftFor('mia'), giftFor('ben')]);
		await repo.write({
			group: group({ title: 'Puzzle, 60 pieces', updatedAt: 2 }),
			insert: [giftFor('julia')],
			update: [giftFor('mia', { title: 'Puzzle, 60 pieces', state: 'bought', updatedAt: 2 })],
			remove: ['g-ben']
		});
		const read = await repo.findVisibleTo(andy, 'gg');
		expect(read?.group.title).toBe('Puzzle, 60 pieces');
		expect(read?.gifts.map((g) => [g.contactId, g.state, g.title])).toEqual([
			['julia', 'idea', 'Puzzle'],
			['mia', 'bought', 'Puzzle, 60 pieces']
		]);
	});

	it('lets gifts go on alone, and the group goes with the last', async () => {
		await repo.insert(group(), [giftFor('mia'), giftFor('ben')]);
		await repo.write({ release: ['g-mia'] });
		expect((await repo.findVisibleTo(andy, 'gg'))?.gifts.map((g) => g.id)).toEqual(['g-ben']);
		await repo.write({ release: ['g-ben'] });
		expect(db.select().from(schema.giftGroup).all()).toEqual([]);
		expect(
			db
				.select()
				.from(schema.gift)
				.all()
				.map((g) => g.groupId)
		).toEqual([null, null]);
	});

	it('drops a group once its last gift is removed', async () => {
		await repo.insert(group(), [giftFor('mia')]);
		await repo.write({ remove: ['g-mia'] });
		expect(db.select().from(schema.giftGroup).all()).toEqual([]);
	});
});
