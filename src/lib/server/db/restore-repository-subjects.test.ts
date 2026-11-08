import { activityWording } from '../i18n/activity-wording';
import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { serialiseDocument } from '../domain/archive/archive';
import { buildArchiveDocument } from '../domain/archive/document';
import { planRestore } from '../domain/archive/restore';
import { restoreTrail } from '../domain/testing';
import { createDrizzleArchiveRepository } from './archive-repository';
import { createDrizzleRestoreRepository } from './restore-repository';
import { ensureSearchIndex } from './search-index';
import { seedRelationshipTypes } from './seed';
import * as schema from './schema';

/*
 * A moment about several people through an archive and back (docs/02 §2.15, §2.20.3): the
 * entry sits under its anchor with the others as `subjects`, and arrives with the same people
 * and the same slot. An archive from before ADR-131 has no `subjects` and restores as it did.
 */

const SOURCE = 'h-source';
const AUTHOR = 'u-source';
const HERE = 'h-here';
const ADMIN = 'u-admin';
const AT = Date.UTC(2026, 8, 7, 9, 30);

function freshDb(): { db: BunSQLiteDatabase<typeof schema>; sqlite: Database } {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
	ensureSearchIndex(sqlite);
	return { db, sqlite };
}

/** The exported archive of a household with one moment about Markus, Sandra and Lea. */
async function archiveOfAFamilyMoment(): Promise<Record<string, unknown>> {
	const { db, sqlite } = freshDb();
	db.insert(schema.household).values({ id: SOURCE, name: 'Familie Brunner' }).run();
	db.insert(schema.user)
		.values({ id: AUTHOR, householdId: SOURCE, email: 's@x.test', name: 'Andrea' })
		.run();
	db.insert(schema.contact)
		.values(
			['c-markus', 'c-sandra', 'c-lea'].map((id) => ({
				id,
				householdId: SOURCE,
				createdBy: AUTHOR,
				displayName: id
			}))
		)
		.run();
	db.insert(schema.journalEntry)
		.values({
			id: 'j-zoo',
			contactId: 'c-markus',
			subjectKey: 'c-lea,c-markus,c-sandra',
			createdBy: AUTHOR,
			visibility: 'shared',
			entryDate: '2026-07-12',
			body: 'Zoo',
			createdAt: AT
		})
		.run();
	db.insert(schema.journalSubject)
		.values([
			{ journalEntryId: 'j-zoo', contactId: 'c-sandra' },
			{ journalEntryId: 'j-zoo', contactId: 'c-lea' }
		])
		.run();
	const snapshot = await createDrizzleArchiveRepository(db, sqlite).readHousehold(SOURCE);
	return Bun.YAML.parse(serialiseDocument(buildArchiveDocument(snapshot, AT))) as Record<
		string,
		unknown
	>;
}

/** Restore `document` into a fresh household and hand back its database. */
async function restored(document: unknown) {
	const here = freshDb();
	here.db.insert(schema.household).values({ id: HERE, name: 'Hier' }).run();
	here.db
		.insert(schema.user)
		.values({ id: ADMIN, householdId: HERE, email: 'a@x.test', name: 'Andrea', role: 'admin' })
		.run();
	let n = 0;
	const ids = { next: () => `new-${++n}` };
	const repo = createDrizzleRestoreRepository(here.db, here.sqlite, activityWording, ids);
	const plan = planRestore({ ids, clock: { now: () => AT } }, document, {
		householdId: HERE,
		actorId: ADMIN,
		...(await repo.readTarget(HERE))
	});
	await repo.applyRestore(plan, restoreTrail(HERE, ADMIN));
	return here.db;
}

/** Every journal entry in the archive, wherever it sits. */
function journalOf(document: Record<string, unknown>): Record<string, unknown>[] {
	const people = document.people as { journal?: Record<string, unknown>[] }[];
	return people.flatMap((person) => person.journal ?? []);
}

describe('a moment about several people in the archive', () => {
	it('is written once, under its anchor, with the others as its subjects', async () => {
		const entries = journalOf(await archiveOfAFamilyMoment());
		expect(entries).toHaveLength(1);
		expect([...(entries[0].subjects as string[])].sort()).toEqual(['c-lea', 'c-sandra']);
	});

	it('comes back with the same people and the same slot', async () => {
		const db = await restored(await archiveOfAFamilyMoment());
		expect(db.select().from(schema.journalEntry).all()).toMatchObject([
			{ id: 'j-zoo', contactId: 'c-markus', subjectKey: 'c-lea,c-markus,c-sandra' }
		]);
		expect(
			db
				.select({ contactId: schema.journalSubject.contactId })
				.from(schema.journalSubject)
				.all()
				.map((row) => row.contactId)
				.sort()
		).toEqual(['c-lea', 'c-sandra']);
	});

	it('reads an archive without subjects as one-person moments', async () => {
		const document = await archiveOfAFamilyMoment();
		for (const entry of journalOf(document)) delete entry.subjects;
		const db = await restored(document);
		expect(db.select().from(schema.journalEntry).all()).toMatchObject([
			{ id: 'j-zoo', contactId: 'c-markus', subjectKey: 'c-markus' }
		]);
		expect(db.select().from(schema.journalSubject).all()).toEqual([]);
	});
});
