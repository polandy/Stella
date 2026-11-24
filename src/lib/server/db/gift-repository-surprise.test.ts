import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { createTranslator } from '../../i18n/translate';
import { calendarFeed } from '../domain/dates/calendar-feed';
import { NO_GIVER, type Gift } from '../domain/gifts/gifts';
import { createDrizzleGiftRepository } from './gift-repository';
import * as schema from './schema';

/*
 * The Drizzle GiftRepository on a surprise (docs/dev/02 §2.25.10) and a bought gift (§2.25.9):
 * every read keeps a surprise from the member whose own person it is for — the card, the counts,
 * the household's list, Home's ready line, the calendar — and shows it to everyone else.
 */

const H = 'household-1';
const ANDY = 'user-andy';
const JULIA = 'user-julia';
const andy: Viewer = { id: ANDY, householdId: H };
const julia: Viewer = { id: JULIA, householdId: H };
/** Julia's own person. */
const JULIA_PERSON = 'c-julia';

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleGiftRepository>;

function gift(over: Partial<Gift>): Gift {
	return {
		id: 'g',
		...NO_GIVER,
		storedAt: null,
		contactId: JULIA_PERSON,
		createdBy: ANDY,
		visibility: 'shared',
		hiddenFromRecipient: true,
		state: 'idea',
		title: 'Necklace',
		note: null,
		url: null,
		givenOn: null,
		occasion: null,
		when: { kind: 'on_date', on: '2026-12-24' },
		whenCheckedOn: null,
		groupId: null,
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
			{ id: ANDY, householdId: H, email: 'a@x.test', name: 'Andy' },
			{ id: JULIA, householdId: H, email: 'j@x.test', name: 'Julia' }
		])
		.run();
	db.insert(schema.contact)
		.values({ id: JULIA_PERSON, householdId: H, createdBy: ANDY, displayName: 'Julia' })
		.run();
	db.update(schema.user)
		.set({ selfContactId: JULIA_PERSON })
		.where(eq(schema.user.id, JULIA))
		.run();
	repo = createDrizzleGiftRepository(db);
});

describe('a surprise, in every read', () => {
	beforeEach(async () => {
		await repo.insert(gift({ id: 'surprise' }));
		await repo.insert(gift({ id: 'ready', state: 'bought', title: 'Bike' }));
		await repo.insert(gift({ id: 'open', hiddenFromRecipient: false, title: 'Book' }));
	});

	it('reads its flag back as stored, and changes it on update', async () => {
		expect((await repo.findVisibleTo(andy, JULIA_PERSON, 'surprise'))?.hiddenFromRecipient).toBe(
			true
		);
		await repo.update(gift({ id: 'surprise', hiddenFromRecipient: false }));
		expect((await repo.findVisibleTo(julia, JULIA_PERSON, 'surprise'))?.hiddenFromRecipient).toBe(
			false
		);
	});

	it('keeps it off the card of the member it is for, and on everyone else’s', async () => {
		expect(await repo.findVisibleTo(julia, JULIA_PERSON, 'surprise')).toBeNull();
		expect((await repo.listForContactVisibleTo(julia, JULIA_PERSON)).map((g) => g.id)).toEqual([
			'open'
		]);
		expect(
			(await repo.listForContactVisibleTo(andy, JULIA_PERSON)).map((g) => g.id).sort()
		).toEqual(['open', 'ready', 'surprise']);
	});

	it('keeps it out of their counts and their list', async () => {
		expect(await repo.listOpenIdeaWhensVisibleTo(julia, [JULIA_PERSON])).toHaveLength(1);
		expect(await repo.listOpenIdeaWhensVisibleTo(andy, [JULIA_PERSON])).toHaveLength(2);
		expect((await repo.listOpenIdeasVisibleTo(julia)).map((g) => g.id)).toEqual(['open']);
		const listed = await repo.listOpenIdeasVisibleTo(andy);
		expect(listed.find((g) => g.id === 'surprise')?.hiddenFromRecipient).toBe(true);
	});

	it('keeps a bought one out of their ready line', async () => {
		expect(await repo.listBoughtVisibleTo(julia, [JULIA_PERSON])).toEqual([]);
		expect(await repo.listBoughtVisibleTo(andy, [JULIA_PERSON])).toEqual([
			{
				id: 'ready',
				contactId: JULIA_PERSON,
				title: 'Bike',
				...NO_GIVER
			}
		]);
	});

	it('keeps it off their story once given', async () => {
		await repo.update(gift({ id: 'surprise', state: 'given', givenOn: '2026-12-24', when: null }));
		expect(await repo.listStoryPageForContactVisibleTo(julia, JULIA_PERSON, { limit: 10 })).toEqual(
			[]
		);
		expect(
			(await repo.listStoryPageForContactVisibleTo(andy, JULIA_PERSON, { limit: 10 })).map(
				(g) => g.id
			)
		).toEqual(['surprise']);
	});

	it('keeps it out of their calendar, and carries it to everyone else', async () => {
		const feedOf = (viewer: Viewer) =>
			calendarFeed(
				{
					dates: { listSourcesVisibleTo: async () => [] },
					todos: { listOpenVisibleTo: async () => [] },
					gifts: repo,
					plans: { listOpenVisibleTo: async () => [] },
					clock: { now: () => Date.UTC(2026, 10, 1) }
				},
				// No own person passed: the surprise rule, not the calendar's own, must keep it out.
				{
					viewer,
					translate: createTranslator('en'),
					intlLocale: 'en-GB',
					selfContactId: null,
					origin: 'https://stella.example'
				}
			);
		expect(await feedOf(julia)).not.toContain('Necklace');
		expect(await feedOf(andy)).toContain('Necklace');
	});

	it('never keeps a surprise from its own author, should they become the person it is for', async () => {
		db.update(schema.user)
			.set({ selfContactId: JULIA_PERSON })
			.where(eq(schema.user.id, ANDY))
			.run();
		expect(await repo.findVisibleTo(andy, JULIA_PERSON, 'surprise')).not.toBeNull();
	});
});
