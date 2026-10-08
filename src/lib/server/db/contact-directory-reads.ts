import { and, count, isNotNull } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactBrowsableBy, contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { ContactDirectoryReads } from '../domain/contacts/directory';
import type * as schema from './schema';
import { contact as contactTable } from './schema';

/*
 * Drizzle adapter for the people lists (docs/08 §8.3). The directory and everything that lists
 * the household read `contactBrowsableBy`, archived people left out; only the archive itself
 * reads `contactVisibleTo` with `archived_at` set (docs/03 §3.3, `contact`).
 */

/** What a list row shows; shared so the directory and the archive cannot drift apart. */
const summaryColumns = {
	id: contactTable.id,
	displayName: contactTable.displayName,
	firstName: contactTable.firstName,
	lastName: contactTable.lastName,
	nickname: contactTable.nickname,
	formerName: contactTable.formerName,
	description: contactTable.description,
	metPlace: contactTable.metPlace,
	metDate: contactTable.metDate,
	visibility: contactTable.visibility,
	avatarPhotoId: contactTable.avatarPhotoId,
	birthDate: contactTable.birthDate,
	jobTitle: contactTable.jobTitle,
	company: contactTable.company
};

export function createDrizzleContactDirectoryReads(
	db: BunSQLiteDatabase<typeof schema>
): ContactDirectoryReads {
	const archivedVisibleTo = (viewer: Viewer) =>
		and(contactVisibleTo(viewer), isNotNull(contactTable.archivedAt));

	return {
		async listVisibleTo(viewer: Viewer) {
			return db
				.select(summaryColumns)
				.from(contactTable)
				.where(contactBrowsableBy(viewer))
				.orderBy(contactTable.displayName)
				.all();
		},

		async listArchivedVisibleTo(viewer: Viewer) {
			return db
				.select(summaryColumns)
				.from(contactTable)
				.where(archivedVisibleTo(viewer))
				.orderBy(contactTable.displayName)
				.all();
		},

		async countArchivedVisibleTo(viewer: Viewer) {
			const row = db
				.select({ n: count() })
				.from(contactTable)
				.where(archivedVisibleTo(viewer))
				.get();
			return row?.n ?? 0;
		},

		async listSomeBrowsableIdsVisibleTo(viewer: Viewer, limit: number) {
			return db
				.select({ id: contactTable.id })
				.from(contactTable)
				.where(contactBrowsableBy(viewer))
				.limit(limit)
				.all()
				.map((row) => row.id);
		},

		async listDistinguishableVisibleTo(viewer: Viewer) {
			return db
				.select({
					id: contactTable.id,
					displayName: contactTable.displayName,
					lastName: contactTable.lastName,
					description: contactTable.description,
					metPlace: contactTable.metPlace,
					metDate: contactTable.metDate
				})
				.from(contactTable)
				.where(contactBrowsableBy(viewer))
				.all();
		}
	};
}
