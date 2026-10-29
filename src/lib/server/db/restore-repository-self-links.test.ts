import { activityWording } from '../i18n/activity-wording';
import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Clock } from '../clock';
import type { IdGenerator } from '../id';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION } from '../domain/archive/document';
import { planRestore, type RestorePlan } from '../domain/archive/restore';
import { createDrizzleRestoreRepository } from './restore-repository';
import { seedRelationshipTypes } from './seed';
import * as schema from './schema';

/*
 * A table that points at itself, against real SQLite (docs/02 §2.15, issue #373). The circle is
 * the one Stella has (a class nested in its school): a child's parent arrives in the same batch,
 * so it counts as present when it is written there too, and the rows go in parents-first
 * whatever order the archive lists them in. A parent that is nowhere — not in the database,
 * not in the batch — still skips the child, as any other missing reference does.
 */

const HERE = 'h-here';
const ADMIN = 'u-admin';

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
	repo = createDrizzleRestoreRepository(db, sqlite, activityWording, {
		next: () => crypto.randomUUID()
	});
});

/** A circle row as the plan hands it over; `parent` null makes it top-level. */
const circle = (id: string, parent: string | null) => ({
	id,
	household_id: HERE,
	created_by: ADMIN,
	visibility: 'shared',
	name: id,
	kind: 'school',
	color: 'blue',
	parent_circle_id: parent
});

const planOf = (circles: ReturnType<typeof circle>[]): RestorePlan => ({
	householdId: HERE,
	household: 'Familie Brunner',
	exportedAt: null,
	tables: [{ table: 'circle', rows: circles }],
	mediaPaths: [],
	warnings: []
});

const stored = () =>
	db
		.select()
		.from(schema.circle)
		.all()
		.map((c) => ({ id: c.id, parent: c.parentCircleId }))
		.sort((a, b) => a.id.localeCompare(b.id));

describe('restoring a table that points at itself', () => {
	it('writes a child whose parent is in the same batch', async () => {
		const counts = await repo.applyRestore(
			planOf([circle('school', null), circle('class', 'school')])
		);

		expect(stored()).toEqual([
			{ id: 'class', parent: 'school' },
			{ id: 'school', parent: null }
		]);
		expect(counts.circle).toEqual({ added: 2, skipped: 0 });
	});

	it('writes a child listed before its parent', async () => {
		const counts = await repo.applyRestore(
			planOf([circle('class', 'school'), circle('school', null)])
		);

		expect(stored()).toEqual([
			{ id: 'class', parent: 'school' },
			{ id: 'school', parent: null }
		]);
		expect(counts.circle).toEqual({ added: 2, skipped: 0 });
	});

	it('writes a chain of grandchildren in any order', async () => {
		const counts = await repo.applyRestore(
			planOf([
				circle('group', 'class'),
				circle('class', 'school'),
				circle('team', 'group'),
				circle('school', null)
			])
		);

		expect(stored()).toEqual([
			{ id: 'class', parent: 'school' },
			{ id: 'group', parent: 'class' },
			{ id: 'school', parent: null },
			{ id: 'team', parent: 'group' }
		]);
		expect(counts.circle).toEqual({ added: 4, skipped: 0 });
	});

	it('writes a child whose parent the household already has', async () => {
		await repo.applyRestore(planOf([circle('school', null)]));

		const counts = await repo.applyRestore(planOf([circle('class', 'school')]));

		expect(stored()).toEqual([
			{ id: 'class', parent: 'school' },
			{ id: 'school', parent: null }
		]);
		expect(counts.circle).toEqual({ added: 1, skipped: 0 });
	});

	it('skips a child whose parent is nowhere, and its own children with it', async () => {
		const counts = await repo.applyRestore(
			planOf([circle('class', 'gone'), circle('group', 'class'), circle('school', null)])
		);

		expect(stored()).toEqual([{ id: 'school', parent: null }]);
		expect(counts.circle).toEqual({ added: 1, skipped: 2 });
	});

	it('skips rows that only point at each other', async () => {
		const counts = await repo.applyRestore(
			planOf([circle('a', 'b'), circle('b', 'a'), circle('school', null)])
		);

		expect(stored()).toEqual([{ id: 'school', parent: null }]);
		expect(counts.circle).toEqual({ added: 1, skipped: 2 });
	});

	it('changes nothing the second time the same batch is restored', async () => {
		const circles = [circle('team', 'class'), circle('class', 'school'), circle('school', null)];
		await repo.applyRestore(planOf(circles));
		const before = stored();

		const counts = await repo.applyRestore(planOf(circles));

		expect(stored()).toEqual(before);
		expect(counts.circle).toEqual({ added: 0, skipped: 3 });
	});

	it('brings a nested circle’s members along from a whole archive', async () => {
		const clock: Clock = { now: () => Date.UTC(2026, 9, 1, 8, 0) };
		let n = 0;
		const ids: IdGenerator = { next: () => `new-${++n}` };
		const document = {
			format: ARCHIVE_FORMAT,
			version: ARCHIVE_VERSION,
			household: 'Familie Brunner',
			people: [{ id: 'anna', display_name: 'Anna' }],
			circles: [
				{ id: 'class', name: '3b', parent: 'school', members: [{ id: 'm-1', person: 'anna' }] },
				{ id: 'school', name: 'Schulhaus Dorf' }
			]
		};
		const plan = planRestore({ ids, clock }, document, {
			householdId: HERE,
			actorId: ADMIN,
			...(await repo.readTarget(HERE))
		});

		const counts = await repo.applyRestore(plan);

		expect(stored()).toEqual([
			{ id: 'class', parent: 'school' },
			{ id: 'school', parent: null }
		]);
		expect(counts.circle_membership).toEqual({ added: 1, skipped: 0 });
	});
});
