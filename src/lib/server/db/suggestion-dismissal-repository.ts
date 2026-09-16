import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Dismissal } from '../../suggestions/claims';
import type { Relation } from '../../suggestions/types';
import type { Viewer } from '../access/visibility';
import type {
	NewDismissal,
	SuggestionDismissalRepository
} from '../domain/relationships/suggestion-review';
import type * as schema from './schema';
import { suggestionDismissal } from './schema';

/*
 * Drizzle adapter for the SuggestionDismissalRepository port (docs/08 §8.3) — the claims a
 * household has declined (docs/concepts/relationship-suggestions.md §6.4).
 *
 * Scoping is the household and nothing finer: the household decided, so any member sees the
 * same answers and any member may take one back. There is no per-contact visibility question
 * to ask here — a row names a pair, and the use-case has already refused a claim naming
 * someone the viewer cannot see before it ever reaches this port.
 */

export function createDrizzleSuggestionDismissalRepository(
	db: BunSQLiteDatabase<typeof schema>
): SuggestionDismissalRepository {
	/** The one row a claim can occupy: this household, this relation, this pair. */
	const theClaim = (viewer: Viewer, relation: Relation, pair: string) =>
		and(
			eq(suggestionDismissal.householdId, viewer.householdId),
			eq(suggestionDismissal.relation, relation),
			eq(suggestionDismissal.pairKey, pair)
		);

	return {
		async listForHousehold(viewer: Viewer): Promise<Dismissal[]> {
			return db
				.select({
					relation: suggestionDismissal.relation,
					pairKey: suggestionDismissal.pairKey,
					dismissedAt: suggestionDismissal.dismissedAt,
					dismissedBy: suggestionDismissal.dismissedBy
				})
				.from(suggestionDismissal)
				.where(eq(suggestionDismissal.householdId, viewer.householdId))
				.all();
		},

		async dismiss(entry: NewDismissal): Promise<void> {
			// A second *no* is the same *no*: the claim keeps the moment it was first answered.
			db.insert(suggestionDismissal).values(entry).onConflictDoNothing().run();
		},

		async restore(viewer: Viewer, relation: Relation, pair: string): Promise<boolean> {
			// `returning()` rather than a row count: the driver's run() reports none.
			const gone = db
				.delete(suggestionDismissal)
				.where(theClaim(viewer, relation, pair))
				.returning({ id: suggestionDismissal.id })
				.all();
			return gone.length > 0;
		}
	};
}
