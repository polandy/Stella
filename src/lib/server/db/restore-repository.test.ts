import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Clock } from '../clock';
import type { IdGenerator } from '../id';
import { serialiseDocument } from '../domain/archive/archive';
import { buildArchiveDocument } from '../domain/archive/document';
import { ForeignHouseholdError, planRestore, type RestorePlan } from '../domain/archive/restore';
import { createDrizzleArchiveRepository } from './archive-repository';
import { createDrizzleRestoreRepository } from './restore-repository';
import { ensureSearchIndex } from './search-index';
import { seedRelationshipTypes } from './seed';
import * as schema from './schema';

/*
 * Integration spec for the restore write (docs/02 §2.15), against real SQLite.
 *
 * The shape of it is the shape of the feature: one installation exports, another imports, and
 * what arrives is what left. The rest of the cases are the promises around that — importing
 * twice changes nothing, an edit made since is not overwritten, and an archive that belongs to
 * another household on this server is refused rather than half-written.
 */

const NOW = Date.UTC(2026, 9, 1, 8, 0);
const EXPORTED = Date.UTC(2026, 8, 7, 9, 30);
const clock: Clock = { now: () => NOW };
const idGen = (): IdGenerator => {
	let n = 0;
	return { next: () => `new-${++n}` };
};

const SOURCE_HOUSEHOLD = 'h-source';
const SOURCE_USER = 'u-source';
const HERE = 'h-here';
const ADMIN = 'u-admin';

/** A fresh, migrated database with the built-in relationship types and the search index. */
function freshDb(): { db: BunSQLiteDatabase<typeof schema>; sqlite: Database } {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
	ensureSearchIndex(sqlite);
	return { db, sqlite };
}

/** The household that gets exported: two people, a note between them, a photo and a tag. */
function fillSource(db: BunSQLiteDatabase<typeof schema>): void {
	db.insert(schema.household).values({ id: SOURCE_HOUSEHOLD, name: 'Familie Brunner' }).run();
	db.insert(schema.user)
		.values({ id: SOURCE_USER, householdId: SOURCE_HOUSEHOLD, email: 's@x.test', name: 'Markus' })
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-hans', householdId: SOURCE_HOUSEHOLD, createdBy: SOURCE_USER, visibility: 'shared', displayName: 'Hans Brunner', firstName: 'Hans', lastName: 'Brunner', jobTitle: 'Schreiner', createdAt: EXPORTED },
			{ id: 'c-rosa', householdId: SOURCE_HOUSEHOLD, createdBy: SOURCE_USER, visibility: 'private', displayName: 'Rosa Brunner', createdAt: EXPORTED }
		])
		.run();
	db.insert(schema.note)
		.values({ id: 'n-1', contactId: 'c-hans', createdBy: SOURCE_USER, visibility: 'shared', title: 'Allergies', body: 'hazelnuts', createdAt: EXPORTED })
		.run();
	db.insert(schema.noteMention).values({ noteId: 'n-1', contactId: 'c-rosa' }).run();
	db.insert(schema.journalEntry)
		.values({ id: 'j-1', contactId: 'c-hans', createdBy: SOURCE_USER, visibility: 'shared', entryDate: '2026-07-12', body: 'hiked the Gurten', createdAt: EXPORTED })
		.run();
	db.insert(schema.journalMention).values({ journalEntryId: 'j-1', contactId: 'c-rosa' }).run();
	db.insert(schema.tag)
		.values({ id: 'tg-1', householdId: SOURCE_HOUSEHOLD, name: 'Bern', color: 'blue' })
		.run();
	db.insert(schema.contactTag).values({ contactId: 'c-hans', tagId: 'tg-1' }).run();
	db.insert(schema.photo)
		.values({ id: 'p-1', householdId: SOURCE_HOUSEHOLD, contactId: 'c-hans', createdBy: SOURCE_USER, filePath: 'p1.jpg', thumbPath: 't1.jpg', mime: 'image/jpeg' })
		.run();
	db.insert(schema.relationship)
		.values({ id: 'r-1', householdId: SOURCE_HOUSEHOLD, fromContactId: 'c-hans', toContactId: 'c-rosa', typeId: 'spouse', createdBy: SOURCE_USER, createdAt: EXPORTED })
		.run();
}

let here: ReturnType<typeof freshDb>;
let repo: ReturnType<typeof createDrizzleRestoreRepository>;
/** The archive, as it comes off the other installation. */
let document: unknown;

beforeEach(async () => {
	const source = freshDb();
	fillSource(source.db);
	const snapshot = await createDrizzleArchiveRepository(source.db, source.sqlite).readHousehold(
		SOURCE_HOUSEHOLD
	);
	document = Bun.YAML.parse(serialiseDocument(buildArchiveDocument(snapshot, EXPORTED)));

	here = freshDb();
	here.db.insert(schema.household).values({ id: HERE, name: 'A New Stella' }).run();
	here.db
		.insert(schema.user)
		.values({ id: ADMIN, householdId: HERE, email: 'a@x.test', name: 'Andrea', role: 'admin' })
		.run();
	repo = createDrizzleRestoreRepository(here.db, here.sqlite);
});

/** The plan for this archive, against whatever the target holds right now. */
async function plan(): Promise<RestorePlan> {
	const known = await repo.readTarget(HERE);
	return planRestore({ ids: idGen(), clock }, document, {
		householdId: HERE,
		actorId: ADMIN,
		...known
	});
}

describe('readTarget', () => {
	it('reports the members, the built-in types and the household’s tags', async () => {
		here.db.insert(schema.tag).values({ id: 'tg-here', householdId: HERE, name: 'Bern' }).run();
		const target = await repo.readTarget(HERE);

		expect(target.memberIds).toEqual([ADMIN]);
		expect(target.relationshipTypeIds).toContain('spouse');
		expect(target.tags).toEqual([{ id: 'tg-here', name: 'Bern' }]);
	});

	it('does not offer another household’s tags or members', async () => {
		here.db.insert(schema.household).values({ id: 'h-other', name: 'Other' }).run();
		here.db
			.insert(schema.user)
			.values({ id: 'u-other', householdId: 'h-other', email: 'o@x.test', name: 'Otto' })
			.run();
		here.db.insert(schema.tag).values({ id: 'tg-other', householdId: 'h-other', name: 'Zürich' }).run();

		const target = await repo.readTarget(HERE);
		// Positive control: the admin here is found, so the query is doing its job.
		expect(target.memberIds).toEqual([ADMIN]);
		expect(target.tags).toEqual([]);
	});
});

describe('applyRestore', () => {
	it('puts the other installation’s household back, private records included', async () => {
		const counts = await repo.applyRestore(await plan());

		const contacts = here.db.select().from(schema.contact).all();
		expect(contacts.map((c) => c.displayName).sort()).toEqual(['Hans Brunner', 'Rosa Brunner']);
		expect(contacts.find((c) => c.id === 'c-rosa')?.visibility).toBe('private');
		expect(contacts.find((c) => c.id === 'c-hans')?.jobTitle).toBe('Schreiner');
		expect(here.db.select().from(schema.noteMention).all()).toEqual([
			{ noteId: 'n-1', contactId: 'c-rosa' }
		]);
		expect(here.db.select().from(schema.relationship).all()).toHaveLength(1);
		expect(counts.contact).toEqual({ added: 2, skipped: 0 });
	});

	it('moves everything into the household doing the import', async () => {
		await repo.applyRestore(await plan());
		for (const row of here.db.select().from(schema.contact).all()) {
			expect(row.householdId).toBe(HERE);
		}
		expect(here.db.select().from(schema.photo).all()[0].householdId).toBe(HERE);
	});

	it('gives the records to the importing admin, since the archive’s member is not here', async () => {
		await repo.applyRestore(await plan());
		expect(here.db.select().from(schema.contact).all()[0].createdBy).toBe(ADMIN);
	});

	it('changes nothing the second time the same archive is imported', async () => {
		await repo.applyRestore(await plan());
		const before = here.db.select().from(schema.contact).all();

		const counts = await repo.applyRestore(await plan());

		expect(here.db.select().from(schema.contact).all()).toEqual(before);
		expect(counts.contact).toEqual({ added: 0, skipped: 2 });
		expect(counts.note).toEqual({ added: 0, skipped: 1 });
	});

	it('leaves an edit made since the export exactly as it is', async () => {
		await repo.applyRestore(await plan());
		here.sqlite.query("UPDATE note SET body = 'hazelnuts and walnuts' WHERE id = 'n-1'").run();

		await repo.applyRestore(await plan());

		expect(here.db.select().from(schema.note).all()[0].body).toBe('hazelnuts and walnuts');
	});

	it('reuses a tag the household already has instead of failing on its name', async () => {
		here.db.insert(schema.tag).values({ id: 'tg-here', householdId: HERE, name: 'Bern' }).run();

		await repo.applyRestore(await plan());

		expect(here.db.select().from(schema.tag).all().map((t) => t.id)).toEqual(['tg-here']);
		expect(here.db.select().from(schema.contactTag).all()).toEqual([
			{ contactId: 'c-hans', tagId: 'tg-here' }
		]);
	});

	it('makes a restored note findable in search, because the index is built by the database', async () => {
		await repo.applyRestore(await plan());

		const hits = here.sqlite
			.query("SELECT note_id FROM note_fts WHERE note_fts MATCH 'hazelnuts'")
			.all() as { note_id: string }[];
		expect(hits.map((h) => h.note_id)).toEqual(['n-1']);
	});

	it('skips a journal entry whose day is taken here, and keeps the rest of the archive', async () => {
		/*
		 * A journal entry is unique on (person, author, day, visibility). If this household has
		 * since written its own entry for that slot, the archive's entry cannot be inserted —
		 * and its mentions and photos must go with it rather than take the whole import down
		 * with a foreign-key error.
		 */
		here.db
			.insert(schema.contact)
			.values({ id: 'c-hans', householdId: HERE, createdBy: ADMIN, displayName: 'Hans Brunner' })
			.run();
		here.db
			.insert(schema.journalEntry)
			.values({ id: 'j-ours', contactId: 'c-hans', createdBy: ADMIN, visibility: 'shared', entryDate: '2026-07-12', body: 'our own day' })
			.run();

		const counts = await repo.applyRestore(await plan());

		expect(counts.journal_entry).toEqual({ added: 0, skipped: 1 });
		expect(counts.journal_mention).toEqual({ added: 0, skipped: 1 });
		// The day we already had is untouched, and the rest of the archive still arrived.
		expect(here.db.select().from(schema.journalEntry).all().map((e) => e.id)).toEqual(['j-ours']);
		expect(here.db.select().from(schema.note).all()).toHaveLength(1);
		expect(here.db.select().from(schema.contact).all()).toHaveLength(2);
	});

	it('refuses an archive already restored into another household on this server', async () => {
		here.db.insert(schema.household).values({ id: 'h-other', name: 'Other' }).run();
		here.db
			.insert(schema.user)
			.values({ id: 'u-other', householdId: 'h-other', email: 'o@x.test', name: 'Otto' })
			.run();
		here.db
			.insert(schema.contact)
			.values({ id: 'c-hans', householdId: 'h-other', createdBy: 'u-other', displayName: 'Hans Brunner' })
			.run();

		await expect(repo.applyRestore(await plan())).rejects.toThrow(ForeignHouseholdError);
		// Nothing at all was written: not the second person, not the relationship type.
		expect(here.db.select().from(schema.contact).all().map((c) => c.householdId)).toEqual([
			'h-other'
		]);
		expect(here.db.select().from(schema.note).all()).toEqual([]);
	});

	it('leaves out a row pointing at something that is not here, and keeps the rest', async () => {
		const broken = await plan();
		broken.tables.find((t) => t.table === 'note')!.rows[0].contact_id = 'c-nobody';

		const counts = await repo.applyRestore(broken);

		expect(counts.note).toEqual({ added: 0, skipped: 1 });
		// Positive control: the people the note could not be hung on still arrived.
		expect(here.db.select().from(schema.contact).all()).toHaveLength(2);
	});

	it('writes all of the plan or none of it', async () => {
		const broken = await plan();
		// A column the schema does not have, on a table written after the people: the failure
		// comes halfway through, and the people written before it must go with it.
		broken.tables.find((t) => t.table === 'note')!.rows[0].nickname = 'not a note column';

		await expect(repo.applyRestore(broken)).rejects.toThrow('has no column');
		expect(here.db.select().from(schema.contact).all()).toEqual([]);
	});

	it('refuses a plan naming a table an archive may not write', async () => {
		const forged = await plan();
		forged.tables.push({ table: 'session', rows: [{ id: 's-1', user_id: ADMIN, expires_at: 1 }] });

		await expect(repo.applyRestore(forged)).rejects.toThrow('not a table an archive may write');
	});

	it('refuses a plan naming a column the table does not have', async () => {
		const forged = await plan();
		forged.tables.find((t) => t.table === 'contact')!.rows[0].password_hash = 'x';

		await expect(repo.applyRestore(forged)).rejects.toThrow('has no column');
	});
});

describe('recordImport', () => {
	it('writes the trail the household sees in its stream', async () => {
		await repo.recordImport({
			id: 'a-1',
			householdId: HERE,
			actorId: ADMIN,
			action: 'import',
			entityType: 'household',
			entityId: HERE,
			contactId: null,
			visibility: 'shared',
			summary: 'restored 2 people from an archive of Familie Brunner',
			createdAt: NOW
		});

		const rows = here.db.select().from(schema.activityLog).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ action: 'import', actorId: ADMIN });
	});
});
