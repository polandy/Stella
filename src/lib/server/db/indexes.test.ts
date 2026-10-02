import { beforeAll, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { createDrizzleInteractionRepository } from './interaction-repository';
import * as schema from './schema';
import { createDrizzleStreamRepository } from './stream-repository';

/*
 * The lookups a page or a delete repeats are answered from an index, not by reading the whole
 * table (docs/04 §4.8). Checked against SQLite's own query plan on the migrated schema, so a
 * dropped or mistyped index shows up here rather than as a slow page in a large household.
 */

let sqlite: Database;

beforeAll(() => {
	sqlite = new Database(':memory:');
	migrate(drizzle(sqlite, { schema }), { migrationsFolder: './drizzle' });
});

/** SQLite's plan for `sql`, one step per line. */
const planOf = (sql: string) =>
	(sqlite.query(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map((step) => step.detail);

const LOOKUPS: [string, string][] = [
	['the notes that mention a person (Mentioned in)', "SELECT note_id FROM note_mention WHERE contact_id = 'c'"],
	['the people carrying a tag', "SELECT contact_id FROM contact_tag WHERE tag_id = 't'"],
	['the touchpoints a person took part in', "SELECT interaction_id FROM interaction_participant WHERE contact_id = 'c'"],
	['the links of one relationship type', "SELECT id FROM relationship WHERE type_id = 'r'"],
	['the sessions of a member', "SELECT id FROM session WHERE user_id = 'u'"],
	['the photos of a circle', "SELECT id FROM photo WHERE circle_id = 'c'"]
];

describe('index-backed lookups', () => {
	for (const [what, sql] of LOOKUPS) {
		it(`finds ${what} without scanning the table`, () => {
			const plan = planOf(sql);
			expect(plan.some((step) => step.startsWith('SEARCH'))).toBe(true);
			expect(plan.filter((step) => step.startsWith('SCAN'))).toEqual([]);
		});
	}
});

describe('index-ordered pages', () => {
	it("reads a person's story page in order, without sorting their whole journal", () => {
		const plan = planOf(
			"SELECT id FROM journal_entry WHERE contact_id = 'c' ORDER BY entry_date DESC, created_at DESC LIMIT 20"
		);
		expect(plan.some((step) => step.startsWith('SEARCH'))).toBe(true);
		expect(plan.filter((step) => step.includes('TEMP B-TREE'))).toEqual([]);
	});

	it('reads the newest journal entries for the stream without sorting all of them', () => {
		const plan = planOf('SELECT id FROM journal_entry ORDER BY updated_at DESC LIMIT 40');
		expect(plan.filter((step) => step.includes('TEMP B-TREE'))).toEqual([]);
	});
});

/*
 * The statements below are captured from the repositories themselves, so the plan checked is the
 * plan the page gets — joins, scoping and all — rather than a hand-written approximation of it.
 */
const viewer = { id: 'u', householdId: 'h' };

/** Every statement `read` sends, in order. */
async function statementsOf(read: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<unknown>) {
	const sent: string[] = [];
	const prepare = sqlite.prepare.bind(sqlite);
	const watched = Object.create(sqlite) as Database;
	watched.prepare = ((sql: string) => {
		sent.push(sql);
		return prepare(sql);
	}) as Database['prepare'];
	await read(drizzle(watched, { schema }));
	return sent;
}

/** The plan of the one statement `read` sends. */
async function planOfRead(read: Parameters<typeof statementsOf>[0]) {
	const [statement, ...rest] = await statementsOf(read);
	expect(rest).toEqual([]);
	return planOf(statement);
}

describe("a person's touchpoints", () => {
	it('reads them in story order without sorting them', async () => {
		const plan = await planOfRead((db) =>
			createDrizzleInteractionRepository(db).listForContactVisibleTo(viewer, 'c')
		);
		expect(plan.some((step) => step.includes('interaction_contact_happened_idx'))).toBe(true);
		expect(plan.filter((step) => step.includes('TEMP B-TREE'))).toEqual([]);
	});

	it('reads a story page of them without sorting them', async () => {
		const plan = await planOfRead((db) =>
			createDrizzleInteractionRepository(db).listPageForContactVisibleTo(viewer, 'c', { limit: 20 })
		);
		expect(plan.some((step) => step.includes('interaction_contact_happened_idx'))).toBe(true);
		expect(plan.filter((step) => step.includes('TEMP B-TREE'))).toEqual([]);
	});
});

describe("the Home stream's newest records", () => {
	const recent = { limit: 40, memberId: null };

	it('reads the newest people without sorting the household', async () => {
		const plan = await planOfRead((db) => createDrizzleStreamRepository(db).recentPeople(viewer, recent));
		expect(plan[0]).toStartWith('SEARCH contact USING INDEX contact_household_created_idx');
		expect(plan.filter((step) => step.includes('TEMP B-TREE'))).toEqual([]);
	});

	it('reads the newest links without sorting them all', async () => {
		const plan = await planOfRead((db) =>
			createDrizzleStreamRepository(db).recentRelationships(viewer, recent)
		);
		expect(plan[0]).toBe('SCAN relationship USING INDEX relationship_created_idx');
		expect(plan.filter((step) => step.includes('TEMP B-TREE'))).toEqual([]);
	});

	it('reads the newest touchpoints without sorting them all', async () => {
		// The first statement; the participants of what it found are a second, keyed read.
		const [statement] = await statementsOf((db) =>
			createDrizzleStreamRepository(db).recentInteractions(viewer, recent)
		);
		const plan = planOf(statement);
		expect(plan[0]).toBe('SCAN interaction USING INDEX interaction_created_idx');
		expect(plan.filter((step) => step.includes('TEMP B-TREE'))).toEqual([]);
	});
});
