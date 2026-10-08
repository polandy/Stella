import { and, inArray } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactBrowsableBy, contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { ContactNameReads } from '../domain/contacts/contact-names';
import type * as schema from './schema';
import { contact as contactTable } from './schema';

/*
 * Drizzle adapter for the names a page resolves (docs/08 §8.3). `contactVisibleTo`, not
 * `contactBrowsableBy`, for a mention already written: it has to keep rendering an archived
 * person's name (docs/02 §2.2).
 */

const nameColumns = { id: contactTable.id, displayName: contactTable.displayName };

export function createDrizzleContactNameReads(
	db: BunSQLiteDatabase<typeof schema>
): ContactNameReads {
	return {
		async listNamesAmongVisibleTo(viewer: Viewer, ids: readonly string[]) {
			return db
				.select(nameColumns)
				.from(contactTable)
				.where(and(inArray(contactTable.id, [...ids]), contactVisibleTo(viewer)))
				.all();
		},

		async listBrowsableNamesAmong(viewer: Viewer, ids: readonly string[]) {
			return db
				.select(nameColumns)
				.from(contactTable)
				.where(and(inArray(contactTable.id, [...ids]), contactBrowsableBy(viewer)))
				.all();
		}
	};
}
