import { beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias, type SQLiteColumn, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import type * as schema from '../db/schema';
import {
	activityLog,
	circle,
	circleMembership,
	contact,
	gift,
	interaction,
	journalEntry,
	note,
	photo,
	relationship
} from '../db/schema';
import {
	activityVisibleTo,
	authoredEditableBy,
	authoredRemovableBy,
	circlePhotoRemovableBy,
	childRecordVisibleTo,
	circleColumnsVisibleTo,
	circlePhotoVisibleTo,
	contactVisibleTo,
	membershipVisibleTo,
	relationshipVisibleTo
} from './query-scoping';
import { REMOVERS, seedParityDb, U1, U2, U3, VIEWERS } from './visibility-parity.fixture';
import {
	canEditAuthored,
	canRemoveAuthored,
	canRemoveCirclePhoto,
	canViewActivity,
	canViewChildRecord,
	canViewCircle,
	canViewCirclePhoto,
	canViewContact,
	canViewMembership,
	canViewRelationship,
	type CircleAccess,
	type ContactAccess,
	type Remover,
	type Viewer,
	type Visibility
} from './visibility';

/*
 * Parity of the two statements of the visibility rules (docs/03 §3.7, AR-19): every rule in
 * `visibility.ts` is restated as SQL in `query-scoping.ts`, because lists are filtered in the
 * database. For one fixed set of rows — shared and private, own and someone else's, across two
 * households, every record kind a rule covers — and several viewers, each pair must pick the
 * same ids: the TS rule filtering every row in memory, the SQL condition filtering in SQLite.
 * A mismatch is a visibility bug on one side, never something to fix in this test.
 */

let db: BunSQLiteDatabase<typeof schema>;

beforeAll(() => {
	db = seedParityDb();
});

// ---- reading rows back, for the TS side -------------------------------------------------

function asVisibility(value: unknown): Visibility {
	if (value === 'shared' || value === 'private') return value;
	throw new Error(`not a visibility: ${String(value)}`);
}

function contactsById(): Map<string, ContactAccess> {
	return new Map(
		db
			.select()
			.from(contact)
			.all()
			.map((c) => [
				c.id,
				{ householdId: c.householdId, ownerId: c.createdBy, visibility: c.visibility }
			])
	);
}

function circlesById(): Map<string, CircleAccess> {
	return new Map(
		db
			.select()
			.from(circle)
			.all()
			.map((k) => [
				k.id,
				{ householdId: k.householdId, ownerId: k.createdBy, visibility: k.visibility }
			])
	);
}

function parentOf<T>(parents: Map<string, T>, id: string): T {
	const parent = parents.get(id);
	if (!parent) throw new Error(`no parent row ${id}`);
	return parent;
}

const ids = (rows: { id: unknown }[]) => rows.map((r) => String(r.id)).sort();

// ---- the pairs --------------------------------------------------------------------------

interface Pair {
	/** What `CASES` names it by. */
	key: string;
	name: string;
	/** Ids the `visibility.ts` rule allows, filtering every row in memory. */
	ts: (viewer: Viewer) => string[];
	/** Ids the `query-scoping.ts` condition lets through in SQLite. */
	sql: (viewer: Viewer) => string[];
}

/** A table of records hanging off a contact, as `childRecordVisibleTo` sees it. */
interface ChildTable {
	table: SQLiteTable;
	id: SQLiteColumn;
	contactId: SQLiteColumn;
	visibility: SQLiteColumn;
	createdBy: SQLiteColumn;
}

function childRecordPair(name: string, t: ChildTable): Pair {
	return {
		key: name,
		name: `canViewChildRecord ↔ childRecordVisibleTo (${name})`,
		ts: (viewer) => {
			const contacts = contactsById();
			return ids(
				db
					.select({
						id: t.id,
						contactId: t.contactId,
						createdBy: t.createdBy,
						visibility: t.visibility
					})
					.from(t.table)
					.all()
					// A photo of a circle's gallery is no contact's child: `circlePhoto` covers it.
					.filter((r) => r.contactId !== null)
					.filter((r) =>
						canViewChildRecord(viewer, {
							ownerId: String(r.createdBy),
							visibility: asVisibility(r.visibility),
							contact: parentOf(contacts, String(r.contactId))
						})
					)
			);
		},
		sql: (viewer) =>
			ids(
				db
					.select({ id: t.id })
					.from(t.table)
					.innerJoin(contact, eq(t.contactId, contact.id))
					.where(childRecordVisibleTo(viewer, { visibility: t.visibility, createdBy: t.createdBy }))
					.all()
			)
	};
}

const PAIRS: Pair[] = [
	{
		key: 'contact',
		name: 'canViewContact ↔ contactVisibleTo',
		ts: (viewer) =>
			ids([...contactsById()].filter(([, c]) => canViewContact(viewer, c)).map(([id]) => ({ id }))),
		sql: (viewer) =>
			ids(db.select({ id: contact.id }).from(contact).where(contactVisibleTo(viewer)).all())
	},
	childRecordPair('note', { table: note, ...note }),
	childRecordPair('journal entry', { table: journalEntry, ...journalEntry }),
	childRecordPair('interaction', { table: interaction, ...interaction }),
	childRecordPair('gift', { table: gift, ...gift }),
	childRecordPair('contact photo', { table: photo, ...photo }),
	{
		key: 'relationship',
		name: 'canViewRelationship ↔ relationshipVisibleTo',
		ts: (viewer) => {
			const contacts = contactsById();
			return ids(
				db
					.select()
					.from(relationship)
					.all()
					.filter((r) =>
						canViewRelationship(viewer, {
							from: parentOf(contacts, r.fromContactId),
							to: parentOf(contacts, r.toContactId)
						})
					)
			);
		},
		sql: (viewer) => {
			const fromContact = alias(contact, 'from_contact');
			const toContact = alias(contact, 'to_contact');
			return ids(
				db
					.select({ id: relationship.id })
					.from(relationship)
					.innerJoin(fromContact, eq(relationship.fromContactId, fromContact.id))
					.innerJoin(toContact, eq(relationship.toContactId, toContact.id))
					.where(relationshipVisibleTo(viewer, fromContact, toContact))
					.all()
			);
		}
	},
	{
		key: 'circle',
		name: 'canViewCircle ↔ circleColumnsVisibleTo',
		ts: (viewer) =>
			ids([...circlesById()].filter(([, k]) => canViewCircle(viewer, k)).map(([id]) => ({ id }))),
		sql: (viewer) =>
			ids(
				db
					.select({ id: circle.id })
					.from(circle)
					.where(circleColumnsVisibleTo(viewer, circle))
					.all()
			)
	},
	{
		key: 'membership',
		name: 'canViewMembership ↔ membershipVisibleTo',
		ts: (viewer) => {
			const contacts = contactsById();
			const circles = circlesById();
			return ids(
				db
					.select()
					.from(circleMembership)
					.all()
					.filter((m) =>
						canViewMembership(viewer, {
							circle: parentOf(circles, m.circleId),
							contact: parentOf(contacts, m.contactId)
						})
					)
			);
		},
		sql: (viewer) =>
			ids(
				db
					.select({ id: circleMembership.id })
					.from(circleMembership)
					.innerJoin(circle, eq(circleMembership.circleId, circle.id))
					.innerJoin(contact, eq(circleMembership.contactId, contact.id))
					.where(membershipVisibleTo(viewer, circle, contact))
					.all()
			)
	},
	{
		key: 'circle photo',
		name: 'canViewCirclePhoto ↔ circlePhotoVisibleTo',
		ts: (viewer) => {
			const circles = circlesById();
			return ids(
				db
					.select()
					.from(photo)
					.all()
					.filter((p) => p.circleId !== null)
					.filter((p) =>
						canViewCirclePhoto(viewer, {
							ownerId: p.createdBy,
							visibility: p.visibility,
							circle: parentOf(circles, String(p.circleId))
						})
					)
			);
		},
		sql: (viewer) =>
			ids(
				db
					.select({ id: photo.id })
					.from(photo)
					.innerJoin(circle, eq(photo.circleId, circle.id))
					.where(
						circlePhotoVisibleTo(viewer, {
							visibility: photo.visibility,
							createdBy: photo.createdBy
						})
					)
					.all()
			)
	},
	{
		key: 'activity',
		name: 'canViewActivity ↔ activityVisibleTo',
		ts: (viewer) =>
			ids(
				db
					.select()
					.from(activityLog)
					.all()
					.filter((a) => canViewActivity(viewer, a))
			),
		sql: (viewer) =>
			ids(
				db.select({ id: activityLog.id }).from(activityLog).where(activityVisibleTo(viewer)).all()
			)
	}
];

describe('visibility.ts and query-scoping.ts pick the same rows', () => {
	for (const pair of PAIRS) {
		for (const [name, viewer] of Object.entries(VIEWERS)) {
			it(`${pair.name}, viewer ${name}`, () => {
				expect(pair.sql(viewer)).toEqual(pair.ts(viewer));
			});
		}
	}
});

/*
 * Equal sets would also be two empty sets, or two complete ones. So each case below pins one
 * row the viewer must not see, next to a positive control: a row of the same kind the same
 * viewer does see — on both sides.
 */
const CHILD_PREFIXES: Record<string, string> = {
	note: 'n',
	'journal entry': 'j',
	interaction: 'i',
	gift: 'g',
	'contact photo': 'p'
};

/** Per pair: [viewer, the row it must not see, the control it sees, why it is hidden]. */
type Case = [viewer: string, hidden: string, control: string, why: string];

const CASES: Record<string, Case[]> = {
	contact: [
		['u2', 'c-priv-u1', 'c-shared', "another member's private contact"],
		['u1', 'c-priv-u2', 'c-priv-u1', 'owning one private contact opens no other'],
		['u3', 'c-shared', 'c-foreign', 'another household'],
		['u4', 'c-foreign-priv', 'c-foreign', "a foreign member's private contact"]
	],
	...Object.fromEntries(
		Object.entries(CHILD_PREFIXES).map(([kind, x]): [string, Case[]] => [
			kind,
			[
				['u2', `${x}-priv-u1`, `${x}-shared`, "another member's private record"],
				['u1', `${x}-on-priv-u2`, `${x}-on-priv-u1`, 'a shared record on a private contact'],
				['u3', `${x}-shared`, `${x}-foreign`, 'another household'],
				['u4', `${x}-foreign-priv-u3`, `${x}-foreign`, "a foreign member's private record"]
			]
		])
	),
	relationship: [
		['u2', 'r-c-shared--c-priv-u1', 'r-c-shared--c-priv-u2', 'one end is hidden'],
		['u1', 'r-c-priv-u2--c-shared', 'r-c-priv-u1--c-shared', 'the other end, the other owner'],
		['u3', 'r-c-shared--c-priv-u1', 'r-c-foreign--c-foreign-priv', 'another household']
	],
	circle: [
		['u2', 'k-priv-u1', 'k-shared', "another member's private circle"],
		['u3', 'k-shared', 'k-foreign', 'another household']
	],
	membership: [
		['u2', 'm-k-priv-u1--c-shared', 'm-k-shared--c-shared', 'a hidden circle'],
		['u2', 'm-k-shared--c-priv-u1', 'm-k-shared--c-priv-u2', 'a hidden contact'],
		['u4', 'm-k-foreign--c-foreign-priv', 'm-k-foreign--c-foreign', 'a hidden foreign contact']
	],
	'circle photo': [
		['u2', 'kp-priv-u1', 'kp-shared', "another member's private photo"],
		['u1', 'kp-on-priv-u2', 'kp-on-priv-u1', 'a shared photo in a private circle'],
		['u3', 'kp-shared', 'kp-foreign', 'another household']
	],
	activity: [
		['u2', `a-${U1}-private`, `a-${U1}-shared`, "another member's private action"],
		['u2', `a-${U3}-shared`, `a-${U2}-private`, 'another household'],
		['u4', `a-${U3}-private`, `a-${U3}-shared`, "a foreign member's private action"]
	]
};

describe('each hidden row has a visible control', () => {
	for (const pair of PAIRS) {
		for (const [viewerName, hidden, control, why] of CASES[pair.key] ?? []) {
			it(`${pair.key}: ${viewerName} does not see ${hidden} (${why}), sees ${control}`, () => {
				const viewer = VIEWERS[viewerName];
				for (const side of [pair.ts(viewer), pair.sql(viewer)]) {
					expect(side).not.toContain(hidden);
					expect(side).toContain(control);
				}
				// A mistyped id would be "not seen" for free: the hidden row is real, someone sees it.
				const seenBySomeone = Object.values(VIEWERS).some((v) => pair.ts(v).includes(hidden));
				expect(seenBySomeone).toBe(true);
			});
		}
	}

	it('pins a case to every pair', () => {
		expect(PAIRS.filter((p) => !CASES[p.key]?.length).map((p) => p.key)).toEqual([]);
	});
});

/*
 * The removal rule (docs/03 §3.7) is no visibility rule but is stated twice the same way:
 * `canRemoveAuthored` decides one record, `authoredRemovableBy` scopes a delete. Same rows,
 * same answer — over every authored table, so the rule holds before the next kind uses it.
 */
const AUTHORED: [string, ChildTable][] = [
	['note', { table: note, ...note }],
	['journal entry', { table: journalEntry, ...journalEntry }],
	['interaction', { table: interaction, ...interaction }],
	['contact photo', { table: photo, ...photo }]
];

function removable(t: ChildTable) {
	return {
		ts: (remover: Remover) => {
			const contacts = contactsById();
			return ids(
				db
					.select({
						id: t.id,
						contactId: t.contactId,
						createdBy: t.createdBy,
						visibility: t.visibility
					})
					.from(t.table)
					.all()
					.filter((r) => r.contactId !== null)
					.filter((r) =>
						canRemoveAuthored(remover, {
							ownerId: String(r.createdBy),
							visibility: asVisibility(r.visibility),
							contact: parentOf(contacts, String(r.contactId))
						})
					)
			);
		},
		sql: (remover: Remover) =>
			ids(
				db
					.select({ id: t.id })
					.from(t.table)
					.innerJoin(contact, eq(t.contactId, contact.id))
					.where(authoredRemovableBy(remover, { visibility: t.visibility, createdBy: t.createdBy }))
					.all()
			)
	};
}

describe('canRemoveAuthored and authoredRemovableBy pick the same rows', () => {
	for (const [kind, table] of AUTHORED) {
		const pair = removable(table);
		for (const [name, remover] of Object.entries(REMOVERS)) {
			it(`${kind}, remover ${name}`, () => {
				expect(pair.sql(remover)).toEqual(pair.ts(remover));
			});
		}
	}
});

/** The circle twin: `canRemoveCirclePhoto` and `circlePhotoRemovableBy` over a circle's gallery. */
const circlePhotoRemovable = {
	ts: (remover: Remover) => {
		const circles = circlesById();
		return ids(
			db
				.select()
				.from(photo)
				.all()
				.filter((p) => p.circleId !== null)
				.filter((p) =>
					canRemoveCirclePhoto(remover, {
						ownerId: p.createdBy,
						visibility: p.visibility,
						circle: parentOf(circles, String(p.circleId))
					})
				)
		);
	},
	sql: (remover: Remover) =>
		ids(
			db
				.select({ id: photo.id })
				.from(photo)
				.innerJoin(circle, eq(photo.circleId, circle.id))
				.where(
					circlePhotoRemovableBy(remover, {
						visibility: photo.visibility,
						createdBy: photo.createdBy
					})
				)
				.all()
		)
};

describe('canRemoveCirclePhoto and circlePhotoRemovableBy pick the same rows', () => {
	for (const [name, remover] of Object.entries(REMOVERS)) {
		it(`circle photo, remover ${name}`, () => {
			expect(circlePhotoRemovable.sql(remover)).toEqual(circlePhotoRemovable.ts(remover));
		});
	}

	it("an admin removes another member's shared photo, never a private one", () => {
		for (const side of [
			circlePhotoRemovable.ts(REMOVERS.u1Admin),
			circlePhotoRemovable.sql(REMOVERS.u1Admin)
		]) {
			expect(side).toContain('kp-shared-u2');
			expect(side).not.toContain('kp-priv-u2');
		}
	});

	it("a member never removes someone else's, and an admin of another household neither", () => {
		for (const side of [
			circlePhotoRemovable.ts(REMOVERS.u2),
			circlePhotoRemovable.sql(REMOVERS.u2)
		]) {
			expect(side).toContain('kp-priv-u2');
			expect(side).not.toContain('kp-shared');
		}
		for (const side of [
			circlePhotoRemovable.ts(REMOVERS.u3Admin),
			circlePhotoRemovable.sql(REMOVERS.u3Admin)
		]) {
			expect(side).not.toContain('kp-shared-u2');
			expect(side).toContain('kp-foreign');
		}
	});
});

/** [remover, the note it may not remove, a note it may, why]. */
const REMOVAL_CASES: [remover: string, refused: string, control: string, why: string][] = [
	['u1Admin', 'n-priv-u2', 'n-shared-u2', "an admin on another member's private note"],
	['u2', 'n-shared', 'n-shared-u2', "a member on someone else's shared note"],
	['u3Admin', 'n-shared', 'n-foreign', 'an admin of another household'],
	['u1Admin', 'n-on-priv-u2', 'n-on-priv-u1', 'a shared note on a contact the admin cannot see']
];

describe('each refused removal has an allowed control', () => {
	const pair = removable({ table: note, ...note });

	it('the author removes their own note, shared and private', () => {
		for (const side of [pair.ts(REMOVERS.u2), pair.sql(REMOVERS.u2)]) {
			expect(side).toContain('n-shared-u2');
			expect(side).toContain('n-priv-u2');
		}
	});

	for (const [name, refused, control, why] of REMOVAL_CASES) {
		it(`${name} may not remove ${refused} (${why}), may remove ${control}`, () => {
			for (const side of [pair.ts(REMOVERS[name]), pair.sql(REMOVERS[name])]) {
				expect(side).not.toContain(refused);
				expect(side).toContain(control);
			}
			// A mistyped id would be refused for free: someone may remove the row.
			const removableBySomeone = Object.values(REMOVERS).some((r) => pair.ts(r).includes(refused));
			expect(removableBySomeone).toBe(true);
		});
	}
});

/*
 * The edit rule is the author's alone, and still needs to see the record: `canEditAuthored` and
 * `authoredEditableBy` over the same authored tables.
 */
function editable(t: ChildTable) {
	return {
		ts: (viewer: Viewer) => {
			const contacts = contactsById();
			return ids(
				db
					.select({
						id: t.id,
						contactId: t.contactId,
						createdBy: t.createdBy,
						visibility: t.visibility
					})
					.from(t.table)
					.all()
					.filter((r) => r.contactId !== null)
					.filter((r) =>
						canEditAuthored(viewer, {
							ownerId: String(r.createdBy),
							visibility: asVisibility(r.visibility),
							contact: parentOf(contacts, String(r.contactId))
						})
					)
			);
		},
		sql: (viewer: Viewer) =>
			ids(
				db
					.select({ id: t.id })
					.from(t.table)
					.innerJoin(contact, eq(t.contactId, contact.id))
					.where(authoredEditableBy(viewer, { visibility: t.visibility, createdBy: t.createdBy }))
					.all()
			)
	};
}

describe('canEditAuthored and authoredEditableBy pick the same rows', () => {
	for (const [kind, table] of AUTHORED) {
		const pair = editable(table);
		for (const [name, remover] of Object.entries(REMOVERS)) {
			it(`${kind}, user ${name}`, () => {
				expect(pair.sql(remover)).toEqual(pair.ts(remover));
			});
		}
	}
});

/** [user, the note they may not edit, a note they may, why]. */
const EDIT_CASES: [user: string, refused: string, control: string, why: string][] = [
	['u1Admin', 'n-shared-u2', 'n-shared', "an admin on another member's shared note"],
	['u2', 'n-shared', 'n-shared-u2', "a member on someone else's shared note"],
	['u3Admin', 'n-shared', 'n-foreign', 'a user of another household'],
	['u1Admin', 'n-priv-u2', 'n-priv-u1', "someone else's private note"],
	['u3Admin', 'n-shared-u2', 'n-foreign', 'a note of another household']
];

describe('each refused edit has an allowed control', () => {
	const pair = editable({ table: note, ...note });

	for (const [name, refused, control, why] of EDIT_CASES) {
		it(`${name} may not edit ${refused} (${why}), may edit ${control}`, () => {
			for (const side of [pair.ts(REMOVERS[name]), pair.sql(REMOVERS[name])]) {
				expect(side).not.toContain(refused);
				expect(side).toContain(control);
			}
			const editableBySomeone = Object.values(REMOVERS).some((r) => pair.ts(r).includes(refused));
			expect(editableBySomeone).toBe(true);
		});
	}

	it('the author may not edit their shared note on a contact private to someone else', () => {
		// u2 wrote n-on-priv-u1 on u1's private contact; control: u2's own note on u2's private one.
		for (const side of [pair.ts(REMOVERS.u2), pair.sql(REMOVERS.u2)]) {
			expect(side).not.toContain('n-on-priv-u1');
			expect(side).toContain('n-on-priv-u2');
		}
	});
});
