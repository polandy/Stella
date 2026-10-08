import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { convertHeldGifts } from '../domain/gifts/held-gifts';
import { createDrizzleHeldGiftRepository } from './held-gift-repository';
import * as schema from './schema';

/*
 * Integration spec for the held-gifts adapter (docs/02 §2.25.4), driven through the use-case
 * over a migrated database: the gift notes are found by their import id and nothing else, a
 * touchpoint's participants come with it, and each original goes only with its gifts.
 */

const H = 'household-1';
const U1 = 'user-1';

let db: BunSQLiteDatabase<typeof schema>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values({ id: U1, householdId: H, email: 'u1@x.test', name: 'One', localePref: 'de' })
		.run();
	db.insert(schema.contact)
		.values(['hilde', 'otto'].map((id) => ({ id, householdId: H, createdBy: U1, displayName: id })))
		.run();
});

const noteRow = (id: string, body: string, updatedAt = 5) => ({
	id,
	contactId: 'hilde',
	createdBy: U1,
	title: 'Geschenk',
	body,
	createdAt: 5,
	updatedAt
});

function convert() {
	const lines: string[] = [];
	return convertHeldGifts({
		held: createDrizzleHeldGiftRepository(db),
		untitled: () => 'Geschenk',
		log: (line) => lines.push(line)
	}).then((report) => ({ report, lines }));
}

describe('held-gift repository', () => {
	it('converts the import’s gift notes, leaves the others and every other note alone', async () => {
		db.insert(schema.note)
			.values([
				noteRow('monica:gift:1', '🎁 **Teapot** — idea\n\nCast iron'),
				noteRow('monica:gift:2', '🎁 **Scarf** — offered, 3. März 2021', 9),
				noteRow('monica:gift:3', 'Scarf, red'),
				noteRow('monica:note:4', '🎁 **Not a gift note** — idea')
			])
			.run();

		const { report } = await convert();

		expect(report).toEqual({
			notesConverted: 1,
			notesLeft: 2,
			touchpointsConverted: 0,
			giftsWritten: 1
		});
		const gifts = db.select().from(schema.gift).all();
		expect(gifts).toMatchObject([
			{ id: 'monica:gift:1', state: 'idea', title: 'Teapot', note: 'Cast iron', createdAt: 5 }
		]);
		const notes = db.select({ id: schema.note.id }).from(schema.note).all();
		expect(notes.map((n) => n.id).sort()).toEqual([
			'monica:gift:2',
			'monica:gift:3',
			'monica:note:4'
		]);
	});

	it('turns a gift touchpoint into a gift per person and removes it with its participants', async () => {
		db.insert(schema.interaction)
			.values([
				{
					id: 't1',
					contactId: 'hilde',
					createdBy: U1,
					kind: 'gift' as 'other',
					title: null,
					description: null,
					happenedAt: '2024-05-02'
				},
				{ id: 't2', contactId: 'hilde', createdBy: U1, kind: 'call', happenedAt: '2024-05-03' }
			])
			.run();
		db.insert(schema.interactionParticipant)
			.values({ interactionId: 't1', contactId: 'otto' })
			.run();

		const { report } = await convert();

		expect(report).toMatchObject({ touchpointsConverted: 1, giftsWritten: 2 });
		const gifts = db.select().from(schema.gift).orderBy(schema.gift.id).all();
		expect(gifts).toMatchObject([
			{ id: 't1', contactId: 'hilde', state: 'given', title: 'Geschenk', givenOn: '2024-05-02' },
			{ id: 't1:otto', contactId: 'otto', state: 'given', title: 'Geschenk' }
		]);
		const left = db.select({ id: schema.interaction.id }).from(schema.interaction).all();
		expect(left).toEqual([{ id: 't2' }]);
		expect(db.select().from(schema.interactionParticipant).all()).toEqual([]);
	});

	it('keeps a gift already there and still removes the original that came back', async () => {
		db.insert(schema.note).values(noteRow('monica:gift:1', '🎁 **Teapot** — idea')).run();
		await convert();
		db.update(schema.gift).set({ title: 'Teapot, cast iron' }).run();
		db.insert(schema.note).values(noteRow('monica:gift:1', '🎁 **Teapot** — idea')).run();

		const { report } = await convert();

		expect(report).toMatchObject({ notesConverted: 1, giftsWritten: 0 });
		expect(db.select({ title: schema.gift.title }).from(schema.gift).all()).toEqual([
			{ title: 'Teapot, cast iron' }
		]);
		expect(db.select().from(schema.note).all()).toEqual([]);
	});
});
