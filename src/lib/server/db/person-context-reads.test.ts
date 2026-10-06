import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { createDrizzlePersonContextReads } from './person-context-reads';
import * as schema from './schema';

/*
 * Integration spec for the reads behind a namesake's context line (docs/02 §2.2.3), against
 * real in-memory SQLite: a link is read from the listed person's end and only when the viewer
 * may see both ends; a membership only in a visible, unarchived circle (§3.7).
 */

const H = 'household-1';
const ANDY = 'user-andy';
const MIA = 'user-mia';
const andy: Viewer = { id: ANDY, householdId: H };
const mia: Viewer = { id: MIA, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;

function person(id: string, visibility: 'shared' | 'private' = 'shared', createdBy = ANDY) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy, visibility, displayName: id })
		.run();
}

function link(
	id: string,
	fromContactId: string,
	toContactId: string,
	typeId: string,
	status = 'current'
) {
	db.insert(schema.relationship)
		.values({
			id,
			householdId: H,
			fromContactId,
			toContactId,
			typeId,
			status,
			createdBy: ANDY,
			createdAt: 1
		})
		.run();
}

function circle(id: string, extra: Partial<typeof schema.circle.$inferInsert> = {}) {
	db.insert(schema.circle)
		.values({ id, householdId: H, createdBy: ANDY, name: id, ...extra })
		.run();
}

function member(circleId: string, contactId: string, role: string | null = null) {
	db.insert(schema.circleMembership)
		.values({ id: `${circleId}-${contactId}`, circleId, contactId, role, createdBy: ANDY })
		.run();
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: ANDY, householdId: H, email: 'andy@x.test', name: 'Andy' },
			{ id: MIA, householdId: H, email: 'mia@x.test', name: 'Mia' }
		])
		.run();
	db.insert(schema.relationshipType)
		.values({
			id: 'type-parent',
			householdId: H,
			key: 'parent_child',
			forwardLabel: 'Parent of',
			reverseLabel: 'Child of',
			category: 'family',
			sortOrder: 10
		})
		.run();
});

describe('listTiesOfVisibleTo', () => {
	it("reads each link from the listed person's end, former ones included for ranking", async () => {
		person('thomas');
		person('sabine');
		person('lea');
		link('r1', 'sabine', 'thomas', 'type-parent');
		link('r2', 'thomas', 'lea', 'type-parent', 'former');

		const ties = await createDrizzlePersonContextReads(db).listTiesOfVisibleTo(andy, ['thomas']);
		expect(
			ties.map((t) => [t.contactId, t.label, t.side, t.otherName, t.status, t.category]).sort()
		).toEqual([
			['thomas', 'Child of', 'reverse', 'sabine', 'current', 'family'],
			['thomas', 'Parent of', 'forward', 'lea', 'former', 'family']
		]);
	});

	it('leaves out a link to someone the viewer may not see', async () => {
		person('thomas');
		person('nora', 'private', ANDY);
		person('sabine');
		link('r1', 'nora', 'thomas', 'type-parent');
		link('r2', 'sabine', 'thomas', 'type-parent');

		const reads = createDrizzlePersonContextReads(db);
		expect((await reads.listTiesOfVisibleTo(mia, ['thomas'])).map((t) => t.otherName)).toEqual([
			'sabine'
		]);
		expect(
			(await reads.listTiesOfVisibleTo(andy, ['thomas'])).map((t) => t.otherName).sort()
		).toEqual(['nora', 'sabine']);
	});

	it('reads nothing for nobody', async () => {
		expect(await createDrizzlePersonContextReads(db).listTiesOfVisibleTo(andy, [])).toEqual([]);
	});
});

describe('listMembershipsOfVisibleTo', () => {
	it('leaves out a circle the viewer may not see, and an archived one', async () => {
		person('thomas');
		circle('Turnverein', { startDate: '2024' });
		circle('Class 9a', { visibility: 'private', createdBy: MIA, parentCircleId: 'Turnverein' });
		circle('Chor', { archivedAt: 5 });
		member('Turnverein', 'thomas', 'Coach');
		member('Class 9a', 'thomas', 'Parent');
		member('Chor', 'thomas');

		const reads = createDrizzlePersonContextReads(db);
		expect(await reads.listMembershipsOfVisibleTo(andy, ['thomas'])).toEqual([
			{
				contactId: 'thomas',
				circleId: 'Turnverein',
				parentCircleId: null,
				name: 'Turnverein',
				role: 'Coach',
				startDate: '2024',
				endDate: null
			}
		]);
		expect(
			(await reads.listMembershipsOfVisibleTo(mia, ['thomas'])).map((m) => m.name).sort()
		).toEqual(['Class 9a', 'Turnverein']);
	});
});
