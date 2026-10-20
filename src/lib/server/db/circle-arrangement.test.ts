import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type {
	ArrangementChange,
	CircleArrangementReads,
	CircleArrangementRepository
} from '../domain/circles/arrange-people';
import { createDrizzleCircleArrangementReads } from './circle-arrangement-reads';
import { createDrizzleCircleArrangementRepository } from './circle-arrangement-repository';
import * as schema from './schema';

/*
 * Integration spec for the arrangement adapters: the transaction of a batch, the exact restore
 * of an undo, and what the viewer may see of the people listed (docs/03 §3.7, ADR-127).
 */

const H = 'household-1';
const OTHER_H = 'household-2';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };
const NOW = 1_700_000_000_000;

let db: BunSQLiteDatabase<typeof schema>;
let repo: CircleArrangementRepository;
let reads: CircleArrangementReads;

function seedCircle(id: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.circle)
		.values({ id, householdId: H, createdBy, visibility, name: id, kind: 'club', color: 'mauve' })
		.run();
}

function seedContact(id: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy, visibility, displayName: id })
		.run();
}

function seedMembership(
	id: string,
	circleId: string,
	contactId: string,
	extra: Partial<typeof schema.circleMembership.$inferInsert> = {}
) {
	db.insert(schema.circleMembership)
		.values({ id, circleId, contactId, createdBy: U1, createdAt: 10, updatedAt: 20, ...extra })
		.run();
}

const rows = () =>
	db
		.select()
		.from(schema.circleMembership)
		.all()
		.map((r) => `${r.circleId}/${r.contactId}`)
		.sort();

const add = (id: string, circleId: string, contactId: string, role: string | null = null) => ({
	id,
	circleId,
	contactId,
	role,
	createdBy: U1,
	createdAt: NOW,
	updatedAt: NOW
});

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household)
		.values([
			{ id: H, name: 'H' },
			{ id: OTHER_H, name: 'Other' }
		])
		.run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' },
			{ id: 'stranger', householdId: OTHER_H, email: 's@x.test', name: 'Stranger' }
		])
		.run();
	seedCircle('school');
	seedCircle('class');
	repo = createDrizzleCircleArrangementRepository(db);
	reads = createDrizzleCircleArrangementReads(db);
});

describe('arrange', () => {
	it('deletes the removals and inserts the adds, answering the rows as they were', async () => {
		seedContact('lena');
		seedMembership('m1', 'class', 'lena', {
			role: 'Pupil',
			startDate: '2025-08',
			note: 'new in August'
		});

		const outcome = await repo.arrange({
			adds: [add('n1', 'school', 'lena', 'Pupil')],
			removals: [{ circleId: 'class', contactId: 'lena' }]
		});

		expect(rows()).toEqual(['school/lena']);
		expect(outcome.added).toEqual([
			{ id: 'n1', circleId: 'school', contactId: 'lena', role: 'Pupil', updatedAt: NOW }
		]);
		expect(outcome.removed).toEqual([
			{
				id: 'm1',
				circleId: 'class',
				contactId: 'lena',
				role: 'Pupil',
				startDate: '2025-08',
				endDate: null,
				note: 'new in August',
				createdBy: U1,
				createdAt: 10,
				updatedAt: 20
			}
		]);
	});

	it('adds no second membership for a person who is in the circle already', async () => {
		seedContact('lena');
		seedContact('mia');
		seedMembership('m1', 'class', 'lena');
		seedMembership('m2', 'school', 'lena', { role: 'Teacher' });

		const outcome = await repo.arrange({
			adds: [add('n1', 'school', 'lena'), add('n2', 'school', 'mia')],
			removals: []
		});

		expect(outcome.added.map((a) => a.contactId)).toEqual(['mia']);
		expect(rows()).toEqual(['class/lena', 'school/lena', 'school/mia']);
		const kept = db
			.select()
			.from(schema.circleMembership)
			.where(eq(schema.circleMembership.id, 'm2'))
			.get();
		expect(kept?.role).toBe('Teacher');
	});

	it('lands whole or not at all: a failing insert takes the deletes back', async () => {
		seedContact('lena');
		seedMembership('m1', 'class', 'lena');

		await expect(
			repo.arrange({
				adds: [add('n1', 'school', 'no-such-contact')],
				removals: [{ circleId: 'class', contactId: 'lena' }]
			})
		).rejects.toThrow();

		expect(rows()).toEqual(['class/lena']);
	});
});

describe('revert', () => {
	const revert = (change: ArrangementChange, restoredBy = U1) =>
		repo.revert({ ...change, householdId: H, restoredBy });

	async function movedLena() {
		seedContact('lena');
		seedMembership('m1', 'class', 'lena', {
			role: 'Pupil',
			startDate: '2025-08',
			endDate: '2026-07',
			note: 'new in August',
			createdBy: U2
		});
		const before = db.select().from(schema.circleMembership).all();
		const change = await repo.arrange({
			adds: [add('n1', 'school', 'lena', 'Pupil')],
			removals: [{ circleId: 'class', contactId: 'lena' }]
		});
		return { before, change };
	}

	it('puts the stored state back exactly: id, role, period, note, author and times', async () => {
		const { before, change } = await movedLena();

		const outcome = await revert(change);

		expect(outcome).toEqual({ removed: 1, kept: 0, restored: 1, conflicts: 0 });
		expect(db.select().from(schema.circleMembership).all()).toEqual(before);
	});

	it('keeps a membership somebody edited since, and says so', async () => {
		const { change } = await movedLena();
		db.update(schema.circleMembership)
			.set({ role: 'Captain', updatedAt: NOW + 1 })
			.where(eq(schema.circleMembership.id, 'n1'))
			.run();

		const outcome = await revert(change);

		expect(outcome).toEqual({ removed: 0, kept: 1, restored: 1, conflicts: 0 });
		expect(rows()).toEqual(['class/lena', 'school/lena']);
	});

	it('keeps an added membership that has a period or note now', async () => {
		const { change } = await movedLena();
		db.update(schema.circleMembership)
			.set({ note: 'added by hand' })
			.where(eq(schema.circleMembership.id, 'n1'))
			.run();

		expect((await revert(change)).kept).toBe(1);
	});

	it('does not restore a person who joined that circle again meanwhile', async () => {
		const { change } = await movedLena();
		seedMembership('m9', 'class', 'lena', { role: 'Guest' });

		const outcome = await revert(change);

		expect(outcome).toEqual({ removed: 1, kept: 0, restored: 0, conflicts: 1 });
		const there = db.select().from(schema.circleMembership).all();
		expect(there.map((r) => [r.id, r.role])).toEqual([['m9', 'Guest']]);
	});

	it('is harmless a second time: the added row is gone, the restored one is in the way', async () => {
		const { change } = await movedLena();
		await revert(change);

		expect(await revert(change)).toEqual({ removed: 0, kept: 0, restored: 0, conflicts: 1 });
		expect(rows()).toEqual(['class/lena']);
	});

	it('handles a partial overlap: only what the change did is undone', async () => {
		seedContact('lena');
		seedContact('mia');
		seedMembership('m1', 'class', 'lena');
		seedMembership('m2', 'class', 'mia');
		seedMembership('m3', 'school', 'lena', { role: 'Teacher' });
		const change = await repo.arrange({
			adds: [add('n1', 'school', 'mia')],
			removals: [
				{ circleId: 'class', contactId: 'lena' },
				{ circleId: 'class', contactId: 'mia' }
			]
		});

		await revert(change);

		expect(rows()).toEqual(['class/lena', 'class/mia', 'school/lena']);
		const teacher = db
			.select()
			.from(schema.circleMembership)
			.where(eq(schema.circleMembership.id, 'm3'))
			.get();
		expect(teacher?.role).toBe('Teacher');
	});

	it('gives the restorer the authorship when the original author left the household', async () => {
		seedContact('lena');
		seedMembership('m1', 'class', 'lena', { createdBy: 'stranger' });
		const change = await repo.arrange({
			adds: [],
			removals: [{ circleId: 'class', contactId: 'lena' }]
		});

		await revert(change, U2);

		const restored = db.select().from(schema.circleMembership).get();
		expect(restored?.createdBy).toBe(U2);
	});

	it('does not delete a membership a forged receipt claims in another circle or for another person', async () => {
		seedContact('lena');
		seedContact('mia');
		// Everything but the circle / the person matches the stored row (updatedAt 20, no role).
		seedMembership('m1', 'class', 'lena');

		const outcome = await revert({
			added: [
				{ id: 'm1', circleId: 'school', contactId: 'lena', role: null, updatedAt: 20 },
				{ id: 'm1', circleId: 'class', contactId: 'mia', role: null, updatedAt: 20 }
			],
			removed: []
		});

		expect(outcome).toEqual({ removed: 0, kept: 2, restored: 0, conflicts: 0 });
		expect(rows()).toEqual(['class/lena']);
	});

	it('restores nothing into a circle of another household', async () => {
		seedContact('lena');
		db.insert(schema.circle)
			.values({
				id: 'foreign',
				householdId: OTHER_H,
				createdBy: 'stranger',
				visibility: 'shared',
				name: 'Foreign',
				kind: 'club',
				color: 'mauve'
			})
			.run();

		const outcome = await revert({
			added: [],
			removed: [
				{
					id: 'x1',
					circleId: 'foreign',
					contactId: 'lena',
					role: null,
					startDate: null,
					endDate: null,
					note: null,
					createdBy: U1,
					createdAt: 1,
					updatedAt: 1
				}
			]
		});

		expect(outcome).toEqual({ removed: 0, kept: 0, restored: 0, conflicts: 1 });
		expect(rows()).toEqual([]);
	});

	it('rolls everything back when a restore fails', async () => {
		const { change } = await movedLena();
		const forged: ArrangementChange = {
			added: change.added,
			removed: [...change.removed, { ...change.removed[0], circleId: 'class', contactId: 'ghost' }]
		};

		await expect(revert(forged)).rejects.toThrow();

		expect(rows()).toEqual(['school/lena']);
	});
});

describe('reads', () => {
	beforeEach(() => {
		seedContact('lena');
		seedContact('mia');
		seedContact('secret', 'private', U2);
		seedMembership('m1', 'class', 'mia');
		seedMembership('m2', 'class', 'lena', { role: 'Pupil' });
		seedMembership('m3', 'class', 'secret');
		seedMembership('m4', 'school', 'lena');
	});

	it('lists the people of the circles asked for, by name, with their role', async () => {
		const members = await reads.listMembersOfVisibleTo(viewerU2, ['class']);
		expect(members.map((m) => [m.circleId, m.contactId, m.role])).toEqual([
			['class', 'lena', 'Pupil'],
			['class', 'mia', null],
			['class', 'secret', null]
		]);
	});

	it('leaves out a private contact the viewer did not create', async () => {
		const members = await reads.listMembersOfVisibleTo(viewerU1, ['class', 'school']);
		expect(members.map((m) => m.contactId)).not.toContain('secret');
		expect(members.map((m) => m.contactId)).toContain('lena');
	});

	it('leaves out the people of a private circle the viewer did not create', async () => {
		seedCircle('closed', 'private', U2);
		seedMembership('m5', 'closed', 'lena');
		expect(await reads.listMembersOfVisibleTo(viewerU1, ['closed'])).toEqual([]);
		expect(await reads.listMembersOfVisibleTo(viewerU2, ['closed'])).toHaveLength(1);
	});

	it('answers which contacts the viewer sees', async () => {
		const ids = await reads.visibleContactIdsAmong(viewerU1, ['lena', 'secret', 'nobody']);
		expect([...ids]).toEqual(['lena']);
		expect(await reads.visibleContactIdsAmong(viewerU1, [])).toEqual(new Set());
	});
});
