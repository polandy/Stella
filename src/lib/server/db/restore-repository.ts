import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { NewActivityEntry } from '../domain/activity/activity';
import type { RestoreCounts, RestoreRepository } from '../domain/archive/import';
import { ForeignHouseholdError, type RestorePlan, type RestoreTarget } from '../domain/archive/restore';
import { EXPORTED_TABLES } from './archive-repository';
import type * as schema from './schema';
import { activityLog } from './schema';

/*
 * Drizzle adapter for the RestoreRepository port (docs/02 §2.15). The counterpart of
 * `archive-repository.ts`, and like it the one write in Stella that does not go through a
 * use-case per record: an import is the household putting its own data back, private rows
 * included (docs/04 §4.9). The authorisation is the admin check at the edge, the scoping is
 * the household id the plan was built with.
 *
 * Rows arrive as columns and values, the way they were read out. Nothing here comes from the
 * uploaded file: the table names are held against the export's own list, the column names
 * against what the database says the table has, and every value is bound. A name the schema
 * does not have fails the import rather than reaching SQLite.
 */

/** The tables a plan may write — the same list the export reads, and nothing else. */
const RESTORABLE_TABLES = new Set(EXPORTED_TABLES.map((t) => t.table));

/** SQLite takes a limited number of bound values per statement; ids are checked in batches. */
const ID_BATCH = 400;

/** A table this adapter refuses to write. */
class UnknownTableError extends Error {
	constructor(table: string) {
		super(`"${table}" is not a table an archive may write.`);
		this.name = 'UnknownTableError';
	}
}

/** A column this adapter refuses to write. */
class UnknownColumnError extends Error {
	constructor(table: string, column: string) {
		super(`"${table}" has no column "${column}".`);
		this.name = 'UnknownColumnError';
	}
}

export function createDrizzleRestoreRepository(
	db: BunSQLiteDatabase<typeof schema>,
	sqlite: import('bun:sqlite').Database
): RestoreRepository {
	const columnsOf = (table: string): Set<string> =>
		new Set(
			(sqlite.query(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name)
		);

	const countOf = (table: string): number =>
		(sqlite.query(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n;

	/**
	 * Ids this server already holds for a *different* household. Restoring those would leave
	 * the archive's records hanging off another household's rows, so the import stops instead.
	 */
	const foreignIds = (table: string, ids: string[], householdId: string): string[] => {
		const found: string[] = [];
		for (let at = 0; at < ids.length; at += ID_BATCH) {
			const batch = ids.slice(at, at + ID_BATCH);
			const rows = sqlite
				.query(
					`SELECT id FROM "${table}" WHERE household_id <> ? AND id IN (${batch.map(() => '?').join(',')})`
				)
				.all(householdId, ...batch) as { id: string }[];
			found.push(...rows.map((row) => row.id));
		}
		return found;
	};

	return {
		async readTarget(householdId: string): Promise<Omit<RestoreTarget, 'householdId' | 'actorId'>> {
			const members = sqlite
				.query('SELECT id FROM "user" WHERE household_id = ?')
				.all(householdId) as { id: string }[];
			// Both the built-in types (household_id is null) and the household's own.
			const types = sqlite
				.query('SELECT id FROM "relationship_type" WHERE household_id IS NULL OR household_id = ?')
				.all(householdId) as { id: string }[];
			const tags = sqlite
				.query('SELECT id, name FROM "tag" WHERE household_id = ?')
				.all(householdId) as { id: string; name: string }[];

			return {
				memberIds: members.map((m) => m.id),
				relationshipTypeIds: types.map((t) => t.id),
				tags
			};
		},

		async applyRestore(plan: RestorePlan): Promise<RestoreCounts> {
			const householdId = plan.householdId;

			return sqlite.transaction((): RestoreCounts => {
				const counts: RestoreCounts = {};

				for (const { table, rows } of plan.tables) {
					if (!RESTORABLE_TABLES.has(table)) throw new UnknownTableError(table);
					if (rows.length === 0) continue;

					const known = columnsOf(table);
					const columns = Object.keys(rows[0]);
					for (const column of columns) {
						if (!known.has(column)) throw new UnknownColumnError(table, column);
					}

					if (known.has('household_id')) {
						const clash = foreignIds(
							table,
							rows.map((row) => String(row.id)),
							householdId
						);
						if (clash.length > 0) throw new ForeignHouseholdError(table, clash[0]);
					}

					const before = countOf(table);
					// "Or ignore": a row that is already here — by its id, or by a uniqueness rule
					// such as a tag's name or a journal day slot — is left exactly as it is.
					const insert = sqlite.query(
						`INSERT OR IGNORE INTO "${table}" (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`
					);
					for (const row of rows) {
						insert.run(...columns.map((column) => row[column] as never));
					}
					const added = countOf(table) - before;
					counts[table] = { added, skipped: rows.length - added };
				}

				return counts;
			})();
		},

		async recordImport(entry: NewActivityEntry): Promise<void> {
			db.insert(activityLog).values(entry).run();
		}
	};
}
