import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { createDrizzleCommandReceiptRepository } from './command-receipt-repository';
import * as schema from './schema';

/*
 * Integration spec for the command receipt book (docs/concepts/offline-capture.md §3): a claim
 * is taken once, a second claim reads the first back, a result survives the JSON round trip,
 * and a stale claim is taken over only by the one who saw it stale.
 */

const H = 'household-1';
let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleCommandReceiptRepository>;

const claim = (id = 'cmd1', memberId = 'u1', claimedAt = 100) => ({
	id,
	memberId,
	householdId: H,
	type: 'moment.capture' as const,
	claimedAt
});

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: 'u1', householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: 'u2', householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	repo = createDrizzleCommandReceiptRepository(db);
});

describe('command receipts', () => {
	it('claims a new id, and hands the claim back to anyone claiming it again', async () => {
		expect(await repo.claim(claim())).toBeNull();
		expect(await repo.claim(claim('cmd1', 'u2', 200))).toEqual({
			...claim(),
			status: 'pending',
			result: null
		});
	});

	it('keeps the result of an applied command, as it was', async () => {
		await repo.claim(claim());
		const result = { entryId: 'e1', mentionedContactIds: ['a', 'b'], linkSuggestion: null };
		await repo.complete('cmd1', result, 150);

		expect(await repo.claim(claim('cmd1', 'u1', 300))).toMatchObject({ status: 'applied', result });
	});

	it('releases a claim so the id can be claimed afresh', async () => {
		await repo.claim(claim());
		await repo.release('cmd1');
		expect(await repo.claim(claim('cmd1', 'u1', 300))).toBeNull();
	});

	it('lets only the run that saw the claim stale take it over', async () => {
		await repo.claim(claim());
		expect(await repo.reclaim('cmd1', 100, 500)).toBe(true);
		// A second run that also saw it at 100 is too late: the claim is now dated 500.
		expect(await repo.reclaim('cmd1', 100, 600)).toBe(false);
		expect(await repo.claim(claim('cmd1', 'u1', 700))).toMatchObject({ status: 'pending', claimedAt: 500 });
	});

	it('never takes over an applied command', async () => {
		await repo.claim(claim());
		await repo.complete('cmd1', { ok: true }, 150);
		expect(await repo.reclaim('cmd1', 100, 500)).toBe(false);
	});
});
