import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { sequentialIds } from '../domain/testing';
import { createDrizzleAccountRepository } from './account-repository';
import { createDrizzleIdentityStore } from './identity-store';
import { createDrizzleMemberAccountRepository } from './member-account-repository';
import { createDrizzleMemberRepository } from './member-repository';
import * as schema from './schema';
import { createDrizzleSystemActors } from './system-actor-repository';

/*
 * The Nextcloud actor (docs/02 §2.16.3): what the activity log names for a change that came
 * from the linked book. Made once per household, it is no one who signs in and never one of
 * the members — only an author.
 */

const H = 'household-1';
const ADMIN = 'u-admin';

let db: BunSQLiteDatabase<typeof schema>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values({ id: ADMIN, householdId: H, email: 'admin@example.test', name: 'Ada', role: 'admin' })
		.run();
});

describe('the Nextcloud actor', () => {
	it('is made once per household', async () => {
		const actors = createDrizzleSystemActors(db);
		const first = await actors.nextcloud(H);
		const again = await actors.nextcloud(H);

		expect(again).toEqual(first);
		expect(first.householdId).toBe(H);
		const row = db
			.select()
			.from(schema.user)
			.all()
			.find((u) => u.id === first.id)!;
		expect(row).toMatchObject({ name: 'Nextcloud', kind: 'system', passwordHash: null });
		expect(row.email.endsWith('.invalid')).toBe(true);
	});

	it('signs no one in and is no member, but names what it wrote', async () => {
		const actor = await createDrizzleSystemActors(db).nextcloud(H);
		const email = db
			.select()
			.from(schema.user)
			.all()
			.find((u) => u.id === actor.id)!.email;
		const accounts = createDrizzleAccountRepository(db);
		const admin = { id: ADMIN, householdId: H, isAdmin: true };

		expect(await accounts.countUsers()).toBe(1);
		expect(await accounts.findCredentialsByEmail(email)).toBeNull();
		expect(await accounts.findById(actor.id)).toBeNull();
		expect(
			await createDrizzleIdentityStore(db, sequentialIds(), 'authelia').findUserByEmail(email)
		).toBeNull();

		const members = createDrizzleMemberRepository(db);
		expect((await members.listMembers(H)).map((m) => m.id)).toEqual([ADMIN]);
		expect((await members.listAuthors(H)).map((m) => m.name)).toEqual(['Ada', 'Nextcloud']);

		const memberAccounts = createDrizzleMemberAccountRepository(db);
		expect((await memberAccounts.listAccounts(H)).map((m) => m.id)).toEqual([ADMIN]);
		expect(await memberAccounts.findRemovableBy(admin, actor.id)).toBeNull();
	});
});
