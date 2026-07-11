import { desc, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo, contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	DashboardRepository,
	RecentContactRow,
	RecentNoteRow
} from '../domain/dashboard/dashboard';
import type * as schema from './schema';
import { contact, note } from './schema';

/*
 * Drizzle adapter for the DashboardRepository port (docs/08 §8.3). Both reads are scoped by
 * the central conditions so the dashboard never surfaces records the member may not see: recent
 * contacts via `contactVisibleTo`, recent notes via `childRecordVisibleTo` (docs/03 §3.7).
 */
export function createDrizzleDashboardRepository(
	db: BunSQLiteDatabase<typeof schema>
): DashboardRepository {
	return {
		async recentContacts(viewer: Viewer, limit: number): Promise<RecentContactRow[]> {
			return db
				.select({
					id: contact.id,
					displayName: contact.displayName,
					description: contact.description,
					avatarPhotoId: contact.avatarPhotoId,
					createdBy: contact.createdBy,
					createdAt: contact.createdAt
				})
				.from(contact)
				.where(contactVisibleTo(viewer))
				.orderBy(desc(contact.createdAt))
				.limit(limit)
				.all();
		},

		async recentNotes(viewer: Viewer, limit: number): Promise<RecentNoteRow[]> {
			const rows = db
				.select({
					id: note.id,
					contactId: note.contactId,
					contactName: contact.displayName,
					title: note.title,
					body: note.body,
					isPinned: note.isPinned,
					createdBy: note.createdBy,
					createdAt: note.createdAt
				})
				.from(note)
				.innerJoin(contact, eq(note.contactId, contact.id))
				.where(childRecordVisibleTo(viewer, { visibility: note.visibility, createdBy: note.createdBy }))
				.orderBy(desc(note.createdAt))
				.limit(limit)
				.all();

			return rows.map((r) => ({ ...r, isPinned: r.isPinned === 1 }));
		}
	};
}
