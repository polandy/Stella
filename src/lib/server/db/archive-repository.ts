import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { NewActivityEntry } from '../domain/activity/activity';
import type { ArchiveRepository, HouseholdSnapshot, TableRows } from '../domain/archive/archive';
import type * as schema from './schema';
import { activityLog } from './schema';

/*
 * Drizzle adapter for the ArchiveRepository port (docs/08 §8.3).
 *
 * This is the one read in Stella that does **not** go through `access/`. An export is not a
 * viewer looking at records — it is the household taking its own data out, private rows
 * included, which is exactly what makes it a backup (docs/04 §4.9). The scoping here is by
 * household, and the authorisation is the admin check at the edge.
 *
 * Rows are read as raw SQL rather than through the typed schema so the archive carries the
 * columns as the database has them, without a mapping layer to drift from the real shape. The
 * household id is bound, never interpolated: the statements are built from the table list
 * below, and the one value that comes from outside stays a parameter.
 */

/** A table the export covers, and the SQL that narrows it to one household. */
interface Scoped {
	table: string;
	/** A WHERE clause over `t`, with `?` bound to the household id. */
	where: string;
}

/** Rows belonging to contacts of the household. */
const viaContact = (column = 'contact_id') =>
	`t.${column} IN (SELECT id FROM contact WHERE household_id = ?)`;

/**
 * Every table an export carries, in an order a restore can replay: parents before the rows
 * that point at them. `archive-repository.test.ts` holds this list against the schema, so a
 * new table cannot quietly stay out of the backup.
 */
export const EXPORTED_TABLES: readonly Scoped[] = [
	{ table: 'household', where: 't.id = ?' },
	{ table: 'user', where: 't.household_id = ?' },
	{ table: 'relationship_type', where: 't.household_id = ?' },
	{ table: 'contact', where: 't.household_id = ?' },
	{ table: 'contact_field', where: viaContact() },
	{ table: 'relationship', where: 't.household_id = ?' },
	{ table: 'note', where: viaContact() },
	{ table: 'note_mention', where: `t.note_id IN (SELECT n.id FROM note n JOIN contact c ON c.id = n.contact_id WHERE c.household_id = ?)` },
	{ table: 'journal_entry', where: viaContact() },
	{ table: 'journal_mention', where: `t.journal_entry_id IN (SELECT j.id FROM journal_entry j JOIN contact c ON c.id = j.contact_id WHERE c.household_id = ?)` },
	{ table: 'interaction', where: viaContact() },
	{ table: 'interaction_participant', where: `t.interaction_id IN (SELECT i.id FROM interaction i JOIN contact c ON c.id = i.contact_id WHERE c.household_id = ?)` },
	{ table: 'important_date', where: viaContact() },
	{ table: 'photo', where: 't.household_id = ?' },
	{ table: 'tag', where: 't.household_id = ?' },
	{ table: 'contact_tag', where: viaContact() },
	{ table: 'circle', where: 't.household_id = ?' },
	{ table: 'circle_membership', where: `t.circle_id IN (SELECT id FROM circle WHERE household_id = ?)` },
	{ table: 'activity_log', where: 't.household_id = ?' }
];

/**
 * Tables an export deliberately leaves out, and why. Kept as data so the completeness test can
 * name them rather than a reviewer having to remember them.
 */
export const EXCLUDED_TABLES: Readonly<Record<string, string>> = {
	session: 'live logins; a restored archive should not resurrect somebody’s browser session',
	invitation:
		'a pending invite is a live token, not household memory — and its hash has no business in a file that gets copied around',
	identity: 'the link to the identity provider, which belongs to that provider and not to us'
};

/** Columns that never leave the server, whatever table they are on. */
const SECRET_COLUMNS: Readonly<Record<string, readonly string[]>> = {
	user: ['password_hash', 'totp_secret']
};

/** Removes the columns that never leave the server. */
function stripSecrets(table: string, rows: TableRows): TableRows {
	const secrets = SECRET_COLUMNS[table];
	if (!secrets) return rows;
	return rows.map((row) => {
		const copy = { ...row };
		for (const column of secrets) delete copy[column];
		return copy;
	});
}

export function createDrizzleArchiveRepository(
	db: BunSQLiteDatabase<typeof schema>,
	sqlite: import('bun:sqlite').Database
): ArchiveRepository {
	return {
		async readHousehold(householdId: string): Promise<HouseholdSnapshot> {
			const tables: Record<string, TableRows> = {};
			for (const { table, where } of EXPORTED_TABLES) {
				const rows = sqlite
					.query(`SELECT t.* FROM "${table}" t WHERE ${where}`)
					.all(householdId) as TableRows;
				tables[table] = stripSecrets(table, rows);
			}

			const householdName = (tables.household[0]?.name as string | undefined) ?? 'household';

			// Both renditions of every photo: the archive is only a backup if the thumbnails
			// come back too, and re-deriving them on restore would need the image pipeline.
			const paths = new Set<string>();
			for (const row of tables.photo) {
				for (const key of ['file_path', 'thumb_path']) {
					const value = row[key];
					if (typeof value === 'string' && value.length > 0) paths.add(value);
				}
			}

			return { householdName, tables, mediaPaths: [...paths] };
		},

		async recordExport(entry: NewActivityEntry): Promise<void> {
			db.insert(activityLog).values(entry).run();
		}
	};
}
