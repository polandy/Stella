import { beforeAll, describe, expect, it } from 'bun:test';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type * as schema from '../db/schema';
import { user } from '../db/schema';
import { memberRemovableBy } from './query-scoping';
import { H1, REMOVERS, seedParityDb, U1, U2, U3, U4 } from './visibility-parity.fixture';
import { canRemoveMember, type Remover } from './visibility';

/*
 * Who may remove a member (docs/02 §2.1): an admin, any other current member of their own
 * household. Stated twice like every rule here, and held to the same rows: the parity fixture's
 * four members, plus one member of household 1 already removed.
 */

const GONE = 'user-5-removed';

let db: BunSQLiteDatabase<typeof schema>;

beforeAll(() => {
	db = seedParityDb();
	db.insert(user)
		.values({ id: GONE, householdId: H1, email: 'gone@example.test', name: GONE, removedAt: 1 })
		.run();
});

const ts = (remover: Remover) =>
	db
		.select()
		.from(user)
		.all()
		.filter((m) =>
			canRemoveMember(remover, {
				id: m.id,
				householdId: m.householdId,
				removed: m.removedAt !== null
			})
		)
		.map((m) => m.id)
		.sort();

const sql = (remover: Remover) =>
	db
		.select({ id: user.id })
		.from(user)
		.where(memberRemovableBy(remover))
		.all()
		.map((m) => m.id)
		.sort();

describe('canRemoveMember and memberRemovableBy pick the same rows', () => {
	for (const [name, remover] of Object.entries(REMOVERS)) {
		it(`remover ${name}`, () => {
			expect(sql(remover)).toEqual(ts(remover));
		});
	}
});

describe('each refused removal has an allowed control', () => {
	it('an admin removes the other member of their household', () => {
		for (const side of [ts(REMOVERS.u1Admin), sql(REMOVERS.u1Admin)]) {
			expect(side).toEqual([U2]);
		}
	});

	it('an admin never removes themselves, someone already removed, or another household', () => {
		for (const side of [ts(REMOVERS.u1Admin), sql(REMOVERS.u1Admin)]) {
			expect(side).not.toContain(U1);
			expect(side).not.toContain(GONE);
			expect(side).not.toContain(U4);
		}
		// The control: household 2's admin may remove its own member.
		expect(ts(REMOVERS.u3Admin)).toEqual([U4]);
	});

	it('a member removes nobody', () => {
		for (const side of [ts(REMOVERS.u2), sql(REMOVERS.u2)]) expect(side).toEqual([]);
		expect(ts(REMOVERS.u3Admin)).not.toContain(U3);
	});
});
