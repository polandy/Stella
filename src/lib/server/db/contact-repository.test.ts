import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { NewContact } from '../domain/contacts/contacts';
import * as schema from './schema';
import { createDrizzleContactRepository } from './contact-repository';

/*
 * Integration spec for the Drizzle ContactRepository adapter: persistence plus
 * visibility-scoped reads via the central query-scoping (docs/03 §3.7, docs/08 §8.3).
 */

const H1 = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H1 };
const viewerU2: Viewer = { id: U2, householdId: H1 };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleContactRepository>;

const NOW = 1_700_000_000_000;
function contactInput(over: Partial<NewContact>): NewContact {
	return {
		id: 'c-x',
		householdId: H1,
		createdBy: U1,
		visibility: 'shared',
		displayName: 'X',
		firstName: null,
		lastName: null,
		nickname: null,
		description: null,
		birthDate: null,
		birthDatePrecision: 'full',
		howWeMet: null,
		metDate: null,
		metPlace: null,
		createdAt: NOW,
		updatedAt: NOW,
		...over
	};
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H1, name: 'H' }).run();
	db.insert(schema.user).values([
		{ id: U1, householdId: H1, email: 'u1@x.test', name: 'One' },
		{ id: U2, householdId: H1, email: 'u2@x.test', name: 'Two' }
	]).run();
	repo = createDrizzleContactRepository(db);
});

describe('createDrizzleContactRepository', () => {
	it('inserts and reads a contact back by id', async () => {
		await repo.insert(contactInput({ id: 'c-1', displayName: 'Hans Müller', firstName: 'Hans', lastName: 'Müller' }));
		const found = await repo.findByIdVisibleTo(viewerU1, 'c-1');
		expect(found).toMatchObject({ id: 'c-1', displayName: 'Hans Müller', firstName: 'Hans', createdBy: U1 });
	});

	it('round-trips the birth date and its precision', async () => {
		await repo.insert(
			contactInput({ id: 'c-born', birthDate: '--03-11', birthDatePrecision: 'month_day' })
		);
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-born')).toMatchObject({
			birthDate: '--03-11',
			birthDatePrecision: 'month_day'
		});
	});

	it('reads the deceased flag back as a boolean, not SQLite 0/1', async () => {
		await repo.insert(contactInput({ id: 'c-alive' }));
		db.update(schema.contact)
			.set({ isDeceased: 1 })
			.where(eq(schema.contact.id, 'c-alive'))
			.run();
		const gone = await repo.findByIdVisibleTo(viewerU1, 'c-alive');
		expect(gone?.isDeceased).toBe(true);

		await repo.insert(contactInput({ id: 'c-living' }));
		// The positive control: without it, `toBe(true)` would pass against any truthy mapping.
		expect((await repo.findByIdVisibleTo(viewerU1, 'c-living'))?.isDeceased).toBe(false);
	});

	it('hides another member private contact but shows it to its owner', async () => {
		await repo.insert(contactInput({ id: 'c-priv', visibility: 'private', createdBy: U1, displayName: 'Secret' }));
		expect(await repo.findByIdVisibleTo(viewerU2, 'c-priv')).toBeNull();
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-priv')).not.toBeNull();
	});

	it('lists only visible contacts, ordered by display name', async () => {
		await repo.insert(contactInput({ id: 'c-shared', visibility: 'shared', displayName: 'Bea' }));
		await repo.insert(contactInput({ id: 'c-priv', visibility: 'private', createdBy: U1, displayName: 'Ada' }));

		const listForU2 = await repo.listVisibleTo(viewerU2);
		expect(listForU2.map((c) => c.id)).toEqual(['c-shared']);

		const listForU1 = await repo.listVisibleTo(viewerU1);
		expect(listForU1.map((c) => c.displayName)).toEqual(['Ada', 'Bea']); // sorted
	});

	it('carries the nickname in the list summary, which is what the directory finds people by', async () => {
		await repo.insert(contactInput({ id: 'c-nick', displayName: 'Leonie', nickname: 'Leni' }));

		expect((await repo.listVisibleTo(viewerU1)).find((c) => c.id === 'c-nick')?.nickname).toBe('Leni');
	});
});

describe('listNameCandidatesVisibleTo (docs/02 §2.2.1)', () => {
	const linked = (id: string, from: string, to: string) =>
		db.insert(schema.relationship).values({ id, householdId: H1, fromContactId: from, toContactId: to, typeId: 't-friend', createdBy: U1 }).run();

	beforeEach(async () => {
		db.insert(schema.relationshipType)
			.values({ id: 't-friend', householdId: H1, key: 'friend', forwardLabel: 'Friend', reverseLabel: 'Friend', category: 'social', symmetric: 1 })
			.run();
		await repo.insert(contactInput({ id: 'c-hans', displayName: 'Hans Roth', firstName: 'Hans', lastName: 'Roth' }));
		await repo.insert(contactInput({ id: 'c-lena', displayName: 'Lena Roth', firstName: 'Lena', lastName: 'Roth' }));
		await repo.insert(contactInput({ id: 'c-secret', displayName: 'Secret Roth', lastName: 'Roth', visibility: 'private', createdBy: U2 }));
		linked('r-1', 'c-hans', 'c-lena');
		linked('r-2', 'c-hans', 'c-secret');
	});

	it('lists only the people the viewer may see, with how many visible relationships each has', async () => {
		const forU1 = await repo.listNameCandidatesVisibleTo(viewerU1);
		expect(forU1.map((c) => [c.id, c.relationshipCount])).toEqual([
			['c-hans', 1], // the link to U2's private person does not count for U1
			['c-lena', 1]
		]);
		// Positive control: the owner of the private person sees them, and the link counts.
		const forU2 = await repo.listNameCandidatesVisibleTo(viewerU2);
		expect(forU2.map((c) => [c.id, c.relationshipCount])).toEqual([
			['c-hans', 2],
			['c-lena', 1],
			['c-secret', 1]
		]);
	});
});
