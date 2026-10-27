import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { SystemActors } from '../domain/nextcloud/system-actor';
import type * as schema from './schema';
import { user } from './schema';

/*
 * The household's Nextcloud actor (docs/02 §2.16.3, docs/03 `user.kind`). Its id follows from
 * the household, so asking twice — or two syncs at once — makes one. No password and an email
 * under `.invalid`: no sign-in path can reach it, and every one also skips `kind = 'system'`.
 */

export function createDrizzleSystemActors(db: BunSQLiteDatabase<typeof schema>): SystemActors {
	return {
		async nextcloud(householdId) {
			const id = `nextcloud-${householdId}`;
			db.insert(user)
				.values({
					id,
					householdId,
					email: `nextcloud@${householdId}.invalid`,
					name: 'Nextcloud',
					kind: 'system'
				})
				.onConflictDoNothing()
				.run();
			return { id, householdId };
		}
	};
}
