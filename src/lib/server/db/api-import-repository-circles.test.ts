import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { ActivityWording } from '../domain/activity/activity';
import { importViaApi, type ApiImportDeps } from '../domain/import/api/api-import';
import type { ApiCircleDetails, ApiImportDocument } from '../domain/import/api/document';
import { createDrizzleApiImportRepository } from './api-import-repository';
import * as schema from './schema';

/*
 * Integration spec for changing circles through the import API (docs/02 §2.16.1): the details
 * and the household's nesting are read with the member's scope — the nesting whole, for the
 * loop check alone — and a change is written once, scoped as the circle's edit form writes it.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const NOW = 1_700_000_000_000;
const actor = { userId: U1, householdId: H, defaultVisibility: 'shared' as const };
const wording: ActivityWording = {
	restored: () => 'not an import',
	reviewed: () => 'not an API import',
	imported: (locale, { people, circlesChanged }, source) =>
		`${locale}: imported ${people}, changed ${circlesChanged} circles from ${source}`
};

let db: BunSQLiteDatabase<typeof schema>;
let deps: ApiImportDeps;

function seedCircle(id: string, over: Partial<typeof schema.circle.$inferInsert> = {}) {
	db.insert(schema.circle)
		.values({ id, householdId: H, createdBy: U1, name: id, updatedAt: 1, ...over })
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
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	let seq = 0;
	deps = {
		imports: createDrizzleApiImportRepository(db, wording),
		clock: { now: () => NOW },
		ids: { next: () => `log-${++seq}` }
	};
	seedCircle('ci-klasse', { name: 'Leonardo Schule', kind: 'school' });
	seedCircle('ci-kg', { name: 'Kindergarten Munzingerstrasse 2023/24', kind: 'class' });
});

const existing = (ref: string, existingId: string, details: Partial<ApiCircleDetails> = {}) => ({
	ref,
	existingId,
	members: [],
	details
});

/** The school career: a new circle, the old class renamed into it, the kindergarten too. */
const career: ApiImportDocument = {
	source: 'leonardo',
	visibility: null,
	people: [],
	relationships: [],
	circles: [
		{
			ref: 'school',
			name: 'Leonardo Schule',
			kind: 'school',
			description: null,
			startDate: null,
			endDate: null,
			parent: null,
			members: []
		},
		existing('klasse', 'ci-klasse', {
			name: 'Klasse 1-2D 26/27',
			kind: 'class',
			startDate: '2026-08-01',
			parent: 'school'
		}),
		existing('kg', 'ci-kg', { name: 'Kindergarten Munzi II 23/24', parent: 'school' })
	]
};

const run = (document: ApiImportDocument, dryRun = false) =>
	importViaApi(deps, actor, document, { dryRun, locale: 'en' });

const circleRow = (id: string) =>
	db.select().from(schema.circle).where(eq(schema.circle.id, id)).get();

const log = () => db.select().from(schema.activityLog).all();

describe('changing circles through the import API', () => {
	it('renames and moves circles inside a new one, and logs it', async () => {
		const result = await run(career);
		expect(result).toMatchObject({
			ok: true,
			added: { circles: 1 },
			changed: { circles: 2 }
		});
		expect(circleRow('ci-klasse')).toMatchObject({
			name: 'Klasse 1-2D 26/27',
			kind: 'class',
			startDate: '2026-08-01',
			parentCircleId: 'api~leonardo~c~school',
			updatedAt: NOW
		});
		expect(circleRow('ci-kg')).toMatchObject({
			name: 'Kindergarten Munzi II 23/24',
			kind: 'class',
			parentCircleId: 'api~leonardo~c~school'
		});
		expect(log().map((e) => e.summary)).toEqual([
			'en: imported 0, changed 2 circles from leonardo'
		]);
	});

	it('writes nothing on a dry run, and reports each change', async () => {
		const result = await run(career, true);
		expect(result).toMatchObject({ ok: true, dryRun: true, changed: { circles: 2 } });
		if (!result.ok) throw new Error('refused');
		expect(result.report.circles[1].changes).toEqual({
			name: { from: 'Leonardo Schule', to: 'Klasse 1-2D 26/27' },
			kind: { from: 'school', to: 'class' },
			startDate: { from: null, to: '2026-08-01' },
			parent: { from: null, to: { id: 'api~leonardo~c~school', name: 'Leonardo Schule' } }
		});
		expect(circleRow('ci-klasse')).toMatchObject({ name: 'Leonardo Schule', parentCircleId: null });
		expect(circleRow('api~leonardo~c~school')).toBeUndefined();
		expect(log()).toEqual([]);
	});

	it('changes nothing and logs nothing the second time', async () => {
		await run(career);
		const again = await run(career);
		expect(again).toMatchObject({ ok: true, added: { circles: 0 }, changed: { circles: 0 } });
		expect(log()).toHaveLength(1);
	});

	it('refuses a loop through a circle only another member sees', async () => {
		// KG › U2's private circle › Klasse: Klasse is nested in KG, so KG cannot go inside it.
		seedCircle('ci-private', { createdBy: U2, visibility: 'private', parentCircleId: 'ci-kg' });
		db.update(schema.circle)
			.set({ parentCircleId: 'ci-private' })
			.where(eq(schema.circle.id, 'ci-klasse'))
			.run();
		const result = await run({
			...career,
			circles: [existing('klasse', 'ci-klasse'), existing('kg', 'ci-kg', { parent: 'klasse' })]
		});
		expect(result).toEqual({
			ok: false,
			problems: [{ code: 'circleCycle', path: 'circles[1].parent', ref: 'klasse' }]
		});
		expect(circleRow('ci-kg')?.parentCircleId).toBeNull();
	});

	it('says only that a parent the member may not see was there, when moving out of it', async () => {
		seedCircle('ci-private', { createdBy: U2, visibility: 'private', name: 'Secret' });
		db.update(schema.circle)
			.set({ parentCircleId: 'ci-private' })
			.where(eq(schema.circle.id, 'ci-kg'))
			.run();
		const result = await run({ ...career, circles: [existing('kg', 'ci-kg', { parent: null })] });
		if (!result.ok) throw new Error('refused');
		expect(result.report.circles[0].changes).toEqual({
			parent: { from: { hidden: true }, to: null }
		});
		expect(circleRow('ci-kg')?.parentCircleId).toBeNull();
	});

	it('neither changes nor moves into a circle another member holds privately', async () => {
		seedCircle('ci-private', { createdBy: U2, visibility: 'private' });
		const result = await run({
			...career,
			circles: [
				existing('secret', 'ci-private', { name: 'Mine now' }),
				existing('kg', 'ci-kg', { parent: 'secret' })
			]
		});
		expect(result).toEqual({
			ok: false,
			problems: [{ code: 'circleNotFound', path: 'circles[0].existingId', id: 'ci-private' }]
		});
		expect(circleRow('ci-private')?.name).toBe('ci-private');
	});

	it('leaves a circle alone that turned private to someone else after it was read', async () => {
		seedCircle('ci-private', { createdBy: U2, visibility: 'private' });
		const written = await createDrizzleApiImportRepository(db, wording).applyPlan(
			{ id: U1, householdId: H },
			{
				contacts: [],
				fields: [],
				homes: [],
				droppedFields: [],
				residents: [],
				relationships: [],
				circles: [],
				circleChanges: [{ id: 'ci-private', set: { name: 'Mine now' }, updatedAt: NOW }],
				memberships: [],
				report: {
					people: [],
					circles: [],
					possibleDuplicates: [],
					alreadyThere: { fields: 0, relationships: 0, memberships: 0, residents: 0 }
				}
			},
			null
		);
		expect(written.changed.circles).toBe(0);
		expect(circleRow('ci-private')?.name).toBe('ci-private');
	});
});
