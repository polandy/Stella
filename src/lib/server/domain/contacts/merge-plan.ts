/*
 * What a merge does to everything that points at the record being merged away (docs/02 §2.2),
 * as data: the tables in the order they are walked, and per column what happens where the
 * survivor already has that row. `db/contact-merge.ts` runs this list in its one transaction
 * and owns the SQL; the decisions are here, so a new table that points at a person is one line
 * in this file, and `db/merge-plan-coverage.test.ts` fails until it is.
 *
 * A step that cannot be said as "move this column" is a named settlement the adapter
 * implements — named, not squeezed into a format that would only pretend to describe it. The
 * search index is not in here: its triggers follow every row the plan moves.
 */

/**
 * - `cannot-collide`: nothing keys on this column, or a settlement before it has cleared every
 *   collision; a plain update, which would fail loud if that ever stopped being true.
 * - `survivor-keeps`: the column is part of a key, so the survivor may already have the row.
 *   Theirs stays; the merged record's copy is left behind and goes with that record.
 */
export type MergeConflictRule = 'cannot-collide' | 'survivor-keeps';

/** The steps the adapter implements by name, each on the table it settles. */
export type MergeSettlement =
	/** A cut the merged record wears becomes a photo of its own before its photos move. */
	| 'turn-merged-cuts'
	/** Two entries by the same member about the same day become one, both bodies kept. */
	| 'join-journal-days'
	/**
	 * A link to a third person lands in stored order (`merge-links.ts`): one the survivor
	 * already has folds into theirs, a symmetric one is re-sorted.
	 */
	| 'move-links-in-stored-order'
	/** A link that ran between the two now runs from the survivor to themselves. */
	| 'drop-self-links'
	/** A membership of a circle the survivor is already in; nothing keys on it, so drop it. */
	| 'drop-memberships-survivor-has';

export type MergeStep =
	| { kind: 'repoint'; table: string; column: string; onConflict: MergeConflictRule }
	| { kind: 'settle'; settle: MergeSettlement; table: string };

const repoint = (table: string, column: string, onConflict: MergeConflictRule): MergeStep => ({
	kind: 'repoint',
	table,
	column,
	onConflict
});
const settle = (settlement: MergeSettlement, table: string): MergeStep => ({
	kind: 'settle',
	settle: settlement,
	table
});

/** In the order it runs. Table and column names are the database's (docs/03). */
export const MERGE_PLAN: readonly MergeStep[] = [
	settle('join-journal-days', 'journal_entry'),
	repoint('journal_entry', 'contact_id', 'cannot-collide'),
	// Only the links between the two are left for the repoints, and they become self links.
	settle('move-links-in-stored-order', 'relationship'),
	repoint('relationship', 'from_contact_id', 'survivor-keeps'),
	repoint('relationship', 'to_contact_id', 'survivor-keeps'),
	settle('drop-self-links', 'relationship'),
	settle('drop-memberships-survivor-has', 'circle_membership'),
	repoint('circle_membership', 'contact_id', 'cannot-collide'),
	// One cut per person and group photo: the merged record's cuts arrive as photos of their own.
	settle('turn-merged-cuts', 'photo'),

	repoint('note_mention', 'contact_id', 'survivor-keeps'),
	repoint('journal_mention', 'contact_id', 'survivor-keeps'),
	repoint('interaction_participant', 'contact_id', 'survivor-keeps'),
	repoint('contact_tag', 'contact_id', 'survivor-keeps'),
	// One Immich link per person: a survivor that has one keeps it (docs/02 §2.24.5).
	repoint('immich_link', 'contact_id', 'survivor-keeps'),
	// An ignored proposal follows the person; the survivor's own record of a pair wins.
	repoint('immich_ignore', 'contact_id', 'survivor-keeps'),

	repoint('contact_field', 'contact_id', 'cannot-collide'),
	repoint('note', 'contact_id', 'cannot-collide'),
	repoint('interaction', 'contact_id', 'cannot-collide'),
	repoint('important_date', 'contact_id', 'cannot-collide'),
	repoint('gift', 'contact_id', 'cannot-collide'),
	repoint('photo', 'contact_id', 'cannot-collide'),
	repoint('activity_log', 'contact_id', 'cannot-collide'),
	// A member who said "I am this person" follows the record that survives the merge.
	repoint('user', 'self_contact_id', 'cannot-collide')
];

/**
 * Columns that name a person but which a merge deliberately does not move. Whatever stays
 * behind is deleted with the merged record by its foreign key, or — without one — simply names
 * a record that is gone.
 */
export const MERGE_LEAVES_BEHIND: readonly { table: string; column: string; why: string }[] = [
	{
		table: 'suggestion_dismissal',
		column: 'pair_key',
		why: 'a declined suggestion names the pair it was declined for; the survivor makes a different pair and is asked afresh'
	}
];
