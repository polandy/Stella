import { activityWording } from '../i18n/activity-wording';
import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Clock } from '../clock';
import type { IdGenerator } from '../id';
import { serialiseDocument } from '../domain/archive/archive';
import { buildArchiveDocument } from '../domain/archive/document';
import { planRestore, type RestorePlan } from '../domain/archive/restore';
import { createDrizzleArchiveRepository, EXPORTED_TABLES } from './archive-repository';
import { restoreTrail } from '../domain/testing';
import { createDrizzleRestoreRepository } from './restore-repository';
import { ensureSearchIndex } from './search-index';
import { seedRelationshipTypes } from './seed';
import * as schema from './schema';

/*
 * The round trip for what the household has already answered (docs/02 §2.15), against real
 * SQLite: one installation exports its declined faces, answered cards, declined suggestions
 * and applied commands; another imports them, and each table holds them again — once, however
 * often the same archive is imported.
 */

const NOW = Date.UTC(2026, 9, 1, 8, 0);
const EXPORTED = Date.UTC(2026, 8, 7, 9, 30);
const clock: Clock = { now: () => NOW };
const idGen = (): IdGenerator => {
	let n = 0;
	return { next: () => `new-${++n}` };
};
const FACE = '0c2e3a4b-5d6e-4f70-9a2b-3c4d5e6f7a81';

const SOURCE = 'h-source';
const SOURCE_USER = 'u-source';
const HERE = 'h-here';
const ADMIN = 'u-admin';
const trail = restoreTrail(HERE, ADMIN);

function freshDb(): { db: BunSQLiteDatabase<typeof schema>; sqlite: Database } {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
	ensureSearchIndex(sqlite);
	return { db, sqlite };
}

function fillSource(db: BunSQLiteDatabase<typeof schema>): void {
	db.insert(schema.household).values({ id: SOURCE, name: 'Familie Brunner' }).run();
	db.insert(schema.user)
		.values({ id: SOURCE_USER, householdId: SOURCE, email: 's@x.test', name: 'Markus' })
		.run();
	db.insert(schema.contact)
		.values({
			id: 'c-hans',
			householdId: SOURCE,
			createdBy: SOURCE_USER,
			visibility: 'shared',
			displayName: 'Hans Brunner'
		})
		.run();
	db.insert(schema.immichNameIgnore)
		.values({
			householdId: SOURCE,
			immichPersonId: FACE,
			ignoredBy: SOURCE_USER,
			ignoredAt: EXPORTED
		})
		.run();
	db.insert(schema.contactSourceLink)
		.values([
			{
				householdId: SOURCE,
				source: 'vcard:google',
				externalUid: 'uid-hans',
				contactId: 'c-hans',
				state: 'linked',
				cardName: 'Hans B.',
				cardHash: 'h1',
				answeredBy: SOURCE_USER,
				answeredAt: EXPORTED
			},
			{
				householdId: SOURCE,
				source: 'vcard:google',
				externalUid: 'uid-spam',
				contactId: null,
				state: 'skipped',
				cardName: 'Pizza Service',
				cardHash: 'h2',
				answeredBy: SOURCE_USER,
				answeredAt: EXPORTED
			}
		])
		.run();
	db.insert(schema.suggestionDismissal)
		.values({
			id: 'sd-1',
			householdId: SOURCE,
			relation: 'last_name',
			pairKey: 'c-hans brunner',
			dismissedBy: SOURCE_USER,
			dismissedAt: EXPORTED
		})
		.run();
	db.insert(schema.commandReceipt)
		.values({
			id: 'cmd-1',
			householdId: SOURCE,
			memberId: SOURCE_USER,
			type: 'note.add',
			status: 'applied',
			result: '{"noteId":"n-1"}',
			claimedAt: EXPORTED,
			completedAt: EXPORTED + 5
		})
		.run();
}

let here: ReturnType<typeof freshDb>;
let repo: ReturnType<typeof createDrizzleRestoreRepository>;
let document: unknown;

beforeEach(async () => {
	const source = freshDb();
	fillSource(source.db);
	const snapshot = await createDrizzleArchiveRepository(source.db, source.sqlite).readHousehold(
		SOURCE
	);
	document = Bun.YAML.parse(serialiseDocument(buildArchiveDocument(snapshot, EXPORTED)));

	here = freshDb();
	here.db.insert(schema.household).values({ id: HERE, name: 'A New Stella' }).run();
	here.db
		.insert(schema.user)
		.values({ id: ADMIN, householdId: HERE, email: 'a@x.test', name: 'Andrea', role: 'admin' })
		.run();
	repo = createDrizzleRestoreRepository(here.db, here.sqlite, activityWording, idGen());
});

async function plan(): Promise<RestorePlan> {
	const known = await repo.readTarget(HERE);
	return planRestore({ ids: idGen(), clock }, document, {
		householdId: HERE,
		actorId: ADMIN,
		...known
	});
}

describe('restoring what the household has already answered', () => {
	it('keeps the Immich faces it ignored, so New from Immich does not offer them again', async () => {
		await repo.applyRestore(await plan(), trail);
		expect(here.db.select().from(schema.immichNameIgnore).all()).toEqual([
			{ householdId: HERE, immichPersonId: FACE, ignoredBy: ADMIN, ignoredAt: EXPORTED }
		]);
	});

	it('keeps the address-book cards it linked or skipped, so the next import does not ask again', async () => {
		await repo.applyRestore(await plan(), trail);
		const links = here.db.select().from(schema.contactSourceLink).all();
		expect(links.map((l) => [l.externalUid, l.state, l.contactId, l.householdId])).toEqual([
			['uid-hans', 'linked', 'c-hans', HERE],
			['uid-spam', 'skipped', null, HERE]
		]);
	});

	it('keeps the suggestions it declined, so none is offered again', async () => {
		await repo.applyRestore(await plan(), trail);
		expect(here.db.select().from(schema.suggestionDismissal).all()).toEqual([
			{
				id: 'sd-1',
				householdId: HERE,
				relation: 'last_name',
				pairKey: 'c-hans brunner',
				dismissedBy: ADMIN,
				dismissedAt: EXPORTED
			}
		]);
	});

	it('keeps the commands it applied, so a phone’s resend is answered and not applied twice', async () => {
		await repo.applyRestore(await plan(), trail);
		expect(here.db.select().from(schema.commandReceipt).all()).toEqual([
			{
				id: 'cmd-1',
				householdId: HERE,
				memberId: ADMIN,
				type: 'note.add',
				status: 'applied',
				result: '{"noteId":"n-1"}',
				claimedAt: EXPORTED,
				completedAt: EXPORTED + 5
			}
		]);
	});

	it('adds none of them a second time when the same archive is imported again', async () => {
		await repo.applyRestore(await plan(), trail);
		const counts = await repo.applyRestore(await plan(), trail);
		for (const table of [
			'immich_name_ignore',
			'contact_source_link',
			'suggestion_dismissal',
			'command_receipt'
		]) {
			expect(counts[table]?.added).toBe(0);
		}
		// Positive control: the rows are there, so the second import met them.
		expect(here.db.select().from(schema.contactSourceLink).all()).toHaveLength(2);
	});
});

it('writes back every table the export reads, so none is read only to be dropped', async () => {
	const written = new Set((await plan()).tables.map((t) => t.table));
	// The household and its members belong to the installation an archive lands in.
	const readOnly = EXPORTED_TABLES.map((t) => t.table).filter((table) => !written.has(table));
	expect(readOnly).toEqual(['household', 'user']);
});
