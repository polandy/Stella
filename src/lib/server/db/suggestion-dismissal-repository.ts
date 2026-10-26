import { and, eq, notInArray } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Dismissal } from '../../suggestions/claims';
import type { Relation } from '../../suggestions/types';
import type { Viewer } from '../access/visibility';
import type {
	NewDismissal,
	SuggestionDismissalRepository
} from '../domain/relationships/suggestion-review';
import type {
	NewSurnameDismissal,
	SurnameDismissalRepository
} from '../domain/contacts/last-names';
import type { SurnameDismissal } from '../../suggestions/rules/surnames';
import type { SameAddressDismissalRepository } from '../domain/homes/same-address';
import type * as schema from './schema';
import { suggestionDismissal } from './schema';

/*
 * Drizzle adapter for the SuggestionDismissalRepository port (docs/08 §8.3) — the claims a
 * household has declined (docs/04 ADR-117).
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
				.where(
					and(
						eq(suggestionDismissal.householdId, viewer.householdId),
						// The last-name and same-address answers share the table, not the vocabulary.
						notInArray(suggestionDismissal.relation, [LAST_NAME, SAME_ADDRESS])
					)
				)
				.all() as Dismissal[];
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

/** The relation a declined last name is stored under (docs/03 §3.9). */
const LAST_NAME = 'last_name';

/** Person and folded name in one key; an id holds no space, so the first one splits them. */
const surnameKey = (contactId: string, folded: string) => `${contactId} ${folded}`;

/*
 * Drizzle adapter for the household's *not this name* (docs/02 §2.2.4.2): the same
 * log as the relationship claims, under `last_name`, keyed by the person and the folded name.
 * Scoped to the household; the use-case has checked the person is visible before writing.
 */
export function createDrizzleSurnameDismissalRepository(
	db: BunSQLiteDatabase<typeof schema>
): SurnameDismissalRepository {
	const theAnswer = (viewer: Viewer, key: string) =>
		and(
			eq(suggestionDismissal.householdId, viewer.householdId),
			eq(suggestionDismissal.relation, LAST_NAME),
			eq(suggestionDismissal.pairKey, key)
		);

	return {
		async listForHousehold(viewer: Viewer): Promise<SurnameDismissal[]> {
			const rows = db
				.select({ key: suggestionDismissal.pairKey })
				.from(suggestionDismissal)
				.where(
					and(
						eq(suggestionDismissal.householdId, viewer.householdId),
						eq(suggestionDismissal.relation, LAST_NAME)
					)
				)
				.all();
			return rows.map(({ key }) => {
				const at = key.indexOf(' ');
				return { contactId: key.slice(0, at), folded: key.slice(at + 1) };
			});
		},

		async dismiss(entry: NewSurnameDismissal): Promise<void> {
			db.insert(suggestionDismissal)
				.values({
					id: entry.id,
					householdId: entry.householdId,
					relation: LAST_NAME,
					pairKey: surnameKey(entry.contactId, entry.folded),
					dismissedBy: entry.dismissedBy,
					dismissedAt: entry.dismissedAt
				})
				.onConflictDoNothing()
				.run();
		},

		async restore(viewer: Viewer, contactId: string, folded: string): Promise<boolean> {
			const gone = db
				.delete(suggestionDismissal)
				.where(theAnswer(viewer, surnameKey(contactId, folded)))
				.returning({ id: suggestionDismissal.id })
				.all();
			return gone.length > 0;
		}
	};
}

/** The relation a *Not the same* is stored under (docs/03 §3.9). */
const SAME_ADDRESS = 'same_address';

/*
 * Drizzle adapter for the household's *Not the same* (docs/02 §2.17, *Same address*): the same
 * log again, under `same_address`, keyed by `sameAddressKey`. Scoped to the household; the
 * use-case has checked every person in a key is visible before writing or taking one back.
 */
export function createDrizzleSameAddressDismissalRepository(
	db: BunSQLiteDatabase<typeof schema>
): SameAddressDismissalRepository {
	const ofHousehold = (viewer: Viewer) =>
		and(
			eq(suggestionDismissal.householdId, viewer.householdId),
			eq(suggestionDismissal.relation, SAME_ADDRESS)
		);

	return {
		async listForHousehold(viewer) {
			return db
				.select({ key: suggestionDismissal.pairKey })
				.from(suggestionDismissal)
				.where(ofHousehold(viewer))
				.all()
				.map(({ key }) => key);
		},

		async dismiss(entry) {
			db.insert(suggestionDismissal)
				.values({
					id: entry.id,
					householdId: entry.householdId,
					relation: SAME_ADDRESS,
					pairKey: entry.key,
					dismissedBy: entry.dismissedBy,
					dismissedAt: entry.dismissedAt
				})
				.onConflictDoNothing()
				.run();
		},

		async restore(viewer, key) {
			const gone = db
				.delete(suggestionDismissal)
				.where(and(ofHousehold(viewer), eq(suggestionDismissal.pairKey, key)))
				.returning({ id: suggestionDismissal.id })
				.all();
			return gone.length > 0;
		}
	};
}
