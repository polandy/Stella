import { beforeAll, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';

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
	['the sessions of a member', "SELECT id FROM session WHERE user_id = 'u'"]
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
