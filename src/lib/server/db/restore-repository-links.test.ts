import { activityWording } from '../i18n/activity-wording';
import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Clock } from '../clock';
import type { IdGenerator } from '../id';
import { relationshipPair } from '../../relationships/endpoints';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION } from '../domain/archive/document';
import { planRestore } from '../domain/archive/restore';
import { createDrizzleRelationshipRepository } from './relationship-repository';
import { createDrizzleRestoreRepository } from './restore-repository';
import { seedRelationshipTypes } from './seed';
import * as schema from './schema';

/*
 * A restored relationship against real SQLite (docs/02 §2.15, docs/03 §relationship): it lands
 * in the stored order every other writer gives it, so the unique index and the duplicate check
 * see it from either end — and a link the household already has stays its own row, untouched,
 * because the restore only adds. The plan's rules are specified in `restore-relationships.test.ts`;
 * this is what the database ends up holding.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 1, 8, 0) };
const idGen = (): IdGenerator => {
	let n = 0;
	return { next: () => `new-${++n}` };
};

const HERE = 'h-here';
const ADMIN = 'u-admin';

type Link = { id: string; from: string; to: string; type: string; description?: string };

/** An archive of three people (ids sort anna < bea < carl) and the given links. */
const archive = (links: Link[]) => ({
	format: ARCHIVE_FORMAT,
	version: ARCHIVE_VERSION,
	household: 'Familie Brunner',
	people: ['anna', 'bea', 'carl'].map((id) => ({ id, display_name: id })),
	relationships: links
});

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleRestoreRepository>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
	db.insert(schema.household).values({ id: HERE, name: 'Hier' }).run();
	db.insert(schema.user)
		.values({ id: ADMIN, householdId: HERE, email: 'a@x.test', name: 'Andrea', role: 'admin' })
		.run();
	repo = createDrizzleRestoreRepository(db, sqlite, activityWording);
});

async function restore(links: Link[]) {
	const known = await repo.readTarget(HERE);
	const plan = planRestore({ ids: idGen(), clock }, archive(links), {
		householdId: HERE,
		actorId: ADMIN,
		...known
	});
	return repo.applyRestore(plan);
}

const stored = () =>
	db
		.select()
		.from(schema.relationship)
		.all()
		.map((r) => ({ id: r.id, from: r.fromContactId, to: r.toContactId, note: r.note }))
		.sort((a, b) => a.id.localeCompare(b.id));

describe('readTarget', () => {
	it('names the symmetric types among the ones this household can use', async () => {
		const target = await repo.readTarget(HERE);
		expect(target.symmetricTypeIds).toContain('friend');
		// Positive control: a directed built-in is known, but not as symmetric.
		expect(target.relationshipTypeIds).toContain('parent_child');
		expect(target.symmetricTypeIds).not.toContain('parent_child');
	});
});

describe('a restored relationship', () => {
	it('lands sorted, so adding it again from the other end finds it', async () => {
		await restore([{ id: 'r-1', from: 'carl', to: 'anna', type: 'friend' }]);

		expect(stored()).toEqual([{ id: 'r-1', from: 'anna', to: 'carl', note: null }]);
		const fromCarl = relationshipPair('carl', 'anna', true);
		const links = createDrizzleRelationshipRepository(db);
		expect(await links.exists(fromCarl.fromContactId, fromCarl.toContactId, 'friend')).toBe(true);
	});

	it('keeps a directed link the way round the archive has it', async () => {
		await restore([{ id: 'r-1', from: 'carl', to: 'anna', type: 'parent_child' }]);
		expect(stored()).toEqual([{ id: 'r-1', from: 'carl', to: 'anna', note: null }]);
	});

	it('is one row where the archive holds it from both ends', async () => {
		const counts = await restore([
			{ id: 'r-copy', from: 'carl', to: 'anna', type: 'friend', description: 'school' },
			{ id: 'r-twin', from: 'anna', to: 'carl', type: 'friend' }
		]);
		expect(stored()).toEqual([{ id: 'r-twin', from: 'anna', to: 'carl', note: 'school' }]);
		expect(counts.relationship).toEqual({ added: 1, skipped: 0 });
	});

	it('leaves the household’s own row whole where it already has the link', async () => {
		await restore([{ id: 'r-here', from: 'anna', to: 'carl', type: 'friend' }]);

		const counts = await restore([
			{ id: 'r-archive', from: 'carl', to: 'anna', type: 'friend', description: 'school' }
		]);

		expect(stored()).toEqual([{ id: 'r-here', from: 'anna', to: 'carl', note: null }]);
		expect(counts.relationship).toEqual({ added: 0, skipped: 1 });
	});

	it('changes nothing the second time the same archive is imported', async () => {
		const links = [
			{ id: 'r-copy', from: 'carl', to: 'anna', type: 'friend', description: 'school' },
			{ id: 'r-twin', from: 'anna', to: 'carl', type: 'friend' }
		];
		await restore(links);
		const before = stored();

		const counts = await restore(links);

		expect(stored()).toEqual(before);
		expect(counts.relationship).toEqual({ added: 0, skipped: 1 });
	});

	it('never links a person to themselves', async () => {
		await restore([
			{ id: 'r-self', from: 'bea', to: 'bea', type: 'friend' },
			{ id: 'r-1', from: 'bea', to: 'anna', type: 'friend' }
		]);
		expect(stored()).toEqual([{ id: 'r-1', from: 'anna', to: 'bea', note: null }]);
	});
});
