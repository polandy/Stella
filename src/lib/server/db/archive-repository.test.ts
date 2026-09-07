import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { getTableName, is, Table } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';
import {
	EXCLUDED_TABLES,
	EXPORTED_TABLES,
	createDrizzleArchiveRepository
} from './archive-repository';

/*
 * Integration spec for the export read (docs/02 §2.15). The first case is the one that keeps
 * the backup honest over time: it holds the exported table list against the schema itself, so
 * a table added next year cannot quietly stay out of the archive.
 *
 * Unlike every other read in Stella this one is not scoped through `access/` — an export is
 * the household taking its own data out, private rows included (docs/04 §4.9). What it *is*
 * scoped by is the household, and that is what the rest of these cases check.
 */

/** The tables the schema actually declares, read from Drizzle rather than from a second list. */
function schemaTableNames(): string[] {
	return Object.values(schema)
		.filter((value) => is(value, Table))
		.map((table) => getTableName(table as Table));
}

const H = 'household-1';
const OTHER = 'household-2';
const U = 'user-1';

let db: BunSQLiteDatabase<typeof schema>;
let sqlite: Database;
let repo: ReturnType<typeof createDrizzleArchiveRepository>;

beforeEach(() => {
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });

	db.insert(schema.household)
		.values([
			{ id: H, name: 'Familie Brunner' },
			{ id: OTHER, name: 'Someone Else' }
		])
		.run();
	db.insert(schema.user)
		.values([
			{ id: U, householdId: H, email: 'u@x.test', name: 'One', passwordHash: 'argon2-secret', totpSecret: 'TOTPSECRET' },
			{ id: 'user-2', householdId: OTHER, email: 'other@x.test', name: 'Two' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-mine', householdId: H, createdBy: U, visibility: 'shared', displayName: 'Hans Brunner' },
			{ id: 'c-private', householdId: H, createdBy: U, visibility: 'private', displayName: 'Rosa Brunner' },
			{ id: 'c-theirs', householdId: OTHER, createdBy: 'user-2', visibility: 'shared', displayName: 'Not Ours' }
		])
		.run();
	repo = createDrizzleArchiveRepository(db, sqlite);
});

describe('the table list', () => {
	it('covers every table in the schema, or names why it does not', () => {
		const inSchema = schemaTableNames().sort();
		const covered = new Set([
			...EXPORTED_TABLES.map((t) => t.table),
			...Object.keys(EXCLUDED_TABLES)
		]);
		expect(inSchema.filter((name) => !covered.has(name))).toEqual([]);
	});

	it('does not name a table the schema does not have', () => {
		const inSchema = new Set<string>(schemaTableNames());
		const named = [...EXPORTED_TABLES.map((t) => t.table), ...Object.keys(EXCLUDED_TABLES)];
		expect(named.filter((name) => !inSchema.has(name))).toEqual([]);
	});

	it('leaves out live logins and identity-provider links, and says so', () => {
		expect(Object.keys(EXCLUDED_TABLES).sort()).toEqual(['identity', 'session']);
		for (const reason of Object.values(EXCLUDED_TABLES)) expect(reason.length).toBeGreaterThan(20);
	});
});

describe('readHousehold', () => {
	it('reads the household’s own rows and nobody else’s', async () => {
		const snapshot = await repo.readHousehold(H);
		expect(snapshot.householdName).toBe('Familie Brunner');
		expect(snapshot.tables.contact.map((c) => c.id).sort()).toEqual(['c-mine', 'c-private']);
		// Positive control: the other household's person exists and simply is not ours.
		expect(await repo.readHousehold(OTHER).then((s) => s.tables.contact.map((c) => c.id))).toEqual([
			'c-theirs'
		]);
	});

	it('takes the private records too, because a backup that drops them is not one', async () => {
		const snapshot = await repo.readHousehold(H);
		expect(snapshot.tables.contact.find((c) => c.id === 'c-private')?.visibility).toBe('private');
	});

	it('never carries a password hash or a TOTP secret out of the server', async () => {
		const [member] = (await repo.readHousehold(H)).tables.user;
		// Positive control: the member is there, with the columns an export is meant to carry.
		expect(member).toMatchObject({ id: U, email: 'u@x.test', name: 'One' });
		expect(member).not.toHaveProperty('password_hash');
		expect(member).not.toHaveProperty('totp_secret');
	});

	it('scopes a child table through its parent, not by a column it does not have', async () => {
		db.insert(schema.note)
			.values([
				{ id: 'n-mine', contactId: 'c-mine', createdBy: U, body: 'ours' },
				{ id: 'n-theirs', contactId: 'c-theirs', createdBy: 'user-2', body: 'theirs' }
			])
			.run();
		db.insert(schema.noteMention).values({ noteId: 'n-mine', contactId: 'c-private' }).run();

		const snapshot = await repo.readHousehold(H);
		expect(snapshot.tables.note.map((n) => n.id)).toEqual(['n-mine']);
		expect(snapshot.tables.note_mention).toEqual([{ note_id: 'n-mine', contact_id: 'c-private' }]);
	});

	it('lists both renditions of every photo, once each', async () => {
		db.insert(schema.photo)
			.values([
				{ id: 'p-1', householdId: H, contactId: 'c-mine', createdBy: U, filePath: 'p1.jpg', thumbPath: 't1.jpg', mime: 'image/jpeg' },
				{ id: 'p-2', householdId: H, contactId: 'c-mine', createdBy: U, filePath: 'p2.jpg', thumbPath: 't1.jpg', mime: 'image/jpeg' },
				{ id: 'p-x', householdId: OTHER, contactId: 'c-theirs', createdBy: 'user-2', filePath: 'x.jpg', thumbPath: 'xt.jpg', mime: 'image/jpeg' }
			])
			.run();

		// The shared thumbnail appears once; the other household's files not at all.
		expect((await repo.readHousehold(H)).mediaPaths.sort()).toEqual(['p1.jpg', 'p2.jpg', 't1.jpg']);
	});

	it('gives an empty household an empty snapshot rather than failing', async () => {
		db.delete(schema.contact).where(undefined).run();
		const snapshot = await repo.readHousehold(H);
		expect(snapshot.tables.contact).toEqual([]);
		expect(snapshot.mediaPaths).toEqual([]);
	});
});

describe('recordExport', () => {
	it('writes the trail the household sees in its stream', async () => {
		await repo.recordExport({
			id: 'a-1',
			householdId: H,
			actorId: U,
			action: 'export',
			entityType: 'household',
			entityId: H,
			contactId: null,
			visibility: 'shared',
			summary: 'exported the household archive (2 people)',
			createdAt: 1_700_000_000_000
		});
		const rows = db.select().from(schema.activityLog).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ action: 'export', summary: 'exported the household archive (2 people)' });
	});
});
