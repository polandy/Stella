import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import { FORMER_RELATIONSHIP_STATUS } from '../../relationships/status';
import {
	circleColumnsVisibleTo,
	contactVisibleTo,
	relationshipVisibleTo
} from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { NewActivityEntry } from '../domain/activity/activity';
import type {
	ApiImportCounts,
	ApiImportRepository,
	HouseholdReading
} from '../domain/import/api/api-import';
import type { ApiImportPlan, KnownPerson } from '../domain/import/api/plan';
import { loadKinshipGraph } from './kinship-graph-read';
import type * as schema from './schema';
import {
	activityLog,
	circle,
	circleMembership,
	contact,
	contactField,
	relationship,
	relationshipType
} from './schema';

/*
 * Drizzle adapter for the import API's port (docs/02 §2.16.1).
 *
 * Reading: every row the planner is shown passes the central scoping (docs/03 §3.7), so a
 * document can neither link to nor be told about somebody the member may not see. The one
 * thing read past that scope is whether an id is *taken* — only ever as a yes, never with what
 * holds it — so a new record is refused rather than colliding with a hidden one.
 *
 * Writing: one transaction, every insert "do nothing on conflict". That makes the plan's own
 * `alreadyThere` a courtesy and this the guarantee: two sendings racing each other still add
 * everything exactly once, and a link the household stored under another id meets the
 * relationship's unique key instead of a second row.
 */

/** SQLite takes a limited number of bound values per statement; ids are looked up in batches. */
const ID_BATCH = 400;

function inBatches<T>(ids: readonly string[], read: (batch: string[]) => T[]): T[] {
	const rows: T[] = [];
	for (let at = 0; at < ids.length; at += ID_BATCH)
		rows.push(...read(ids.slice(at, at + ID_BATCH)));
	return rows;
}

/** Build the import API adapter over a Drizzle handle. */
export function createDrizzleApiImportRepository(
	db: BunSQLiteDatabase<typeof schema>
): ApiImportRepository {
	return {
		async readHousehold(viewer: Viewer, ids): Promise<HouseholdReading> {
			const directory: KnownPerson[] = db
				.select({ id: contact.id, displayName: contact.displayName, birthDate: contact.birthDate })
				.from(contact)
				.where(contactVisibleTo(viewer))
				.all();
			const visibleById = new Map(directory.map((p) => [p.id, p]));
			const people = new Map(
				ids.contactIds.flatMap((id) => {
					const known = visibleById.get(id);
					return known ? [[id, known] as const] : [];
				})
			);
			const takenContacts = inBatches(ids.contactIds, (batch) =>
				db.select({ id: contact.id }).from(contact).where(inArray(contact.id, batch)).all()
			);

			const visibleCircles = inBatches(ids.circleIds, (batch) =>
				db
					.select({ id: circle.id, name: circle.name })
					.from(circle)
					.where(and(inArray(circle.id, batch), circleColumnsVisibleTo(viewer, circle)))
					.all()
			);
			const memberRows = inBatches(
				visibleCircles.map((c) => c.id),
				(batch) =>
					db
						.select({ circleId: circleMembership.circleId, contactId: circleMembership.contactId })
						.from(circleMembership)
						.where(inArray(circleMembership.circleId, batch))
						.all()
			);
			const circles = new Map(
				visibleCircles.map((c) => [
					c.id,
					{
						id: c.id,
						name: c.name,
						memberIds: memberRows.filter((m) => m.circleId === c.id).map((m) => m.contactId)
					}
				])
			);
			const takenCircles = inBatches(ids.circleIds, (batch) =>
				db.select({ id: circle.id }).from(circle).where(inArray(circle.id, batch)).all()
			);

			const hiddenIds = new Set([
				...takenContacts.map((r) => r.id).filter((id) => !people.has(id)),
				...takenCircles.map((r) => r.id).filter((id) => !circles.has(id))
			]);

			const types = db
				.select()
				.from(relationshipType)
				.where(
					or(
						isNull(relationshipType.householdId),
						eq(relationshipType.householdId, viewer.householdId)
					)
				)
				.all()
				.map((t) => ({ ...t, symmetric: t.symmetric === 1 }));

			const named = [...people.keys()];
			const fromC = alias(contact, 'from_c');
			const toC = alias(contact, 'to_c');
			const links = inBatches(named, (batch) =>
				db
					.select({
						id: relationship.id,
						fromContactId: relationship.fromContactId,
						toContactId: relationship.toContactId,
						typeId: relationship.typeId,
						status: relationship.status
					})
					.from(relationship)
					.innerJoin(fromC, eq(relationship.fromContactId, fromC.id))
					.innerJoin(toC, eq(relationship.toContactId, toC.id))
					.where(
						and(
							// Defence in depth: the planner only compares links between people the
							// document names, all of them visible, so a hidden far end could not
							// change an answer — but it has no business being read either.
							relationshipVisibleTo(viewer, fromC, toC),
							or(
								inArray(relationship.fromContactId, batch),
								inArray(relationship.toContactId, batch)
							)
						)
					)
					.all()
			);
			// A link touching two named people turns up in both of their batches' reads.
			const uniqueLinks = [...new Map(links.map((l) => [l.id, l])).values()].map((l) => ({
				id: l.id,
				fromContactId: l.fromContactId,
				toContactId: l.toContactId,
				typeId: l.typeId,
				former: l.status === FORMER_RELATIONSHIP_STATUS
			}));

			return {
				people,
				hiddenIds,
				circles,
				types,
				links: uniqueLinks,
				graph: loadKinshipGraph(db, viewer),
				directory
			};
		},

		async applyPlan(plan: ApiImportPlan, audit: NewActivityEntry | null): Promise<ApiImportCounts> {
			return db.transaction((tx) => {
				// The Bun driver types `run()` as void, so rows are counted through `returning()`.
				const inserted = (rows: unknown[]) => rows.length;
				let people = 0;
				for (const row of plan.contacts) {
					people += inserted(
						tx.insert(contact).values(row).onConflictDoNothing().returning({ id: contact.id }).all()
					);
				}
				let fields = 0;
				for (const row of plan.fields) {
					fields += inserted(
						tx
							.insert(contactField)
							.values(row)
							.onConflictDoNothing()
							.returning({ id: contactField.id })
							.all()
					);
				}
				let relationships = 0;
				for (const { description, ...row } of plan.relationships) {
					relationships += inserted(
						tx
							.insert(relationship)
							.values({ ...row, note: description })
							.onConflictDoNothing()
							.returning({ id: relationship.id })
							.all()
					);
				}
				let circles = 0;
				for (const row of plan.circles) {
					circles += inserted(
						tx.insert(circle).values(row).onConflictDoNothing().returning({ id: circle.id }).all()
					);
				}
				let memberships = 0;
				for (const row of plan.memberships) {
					// A membership has no unique key of its own; whether this person is in the
					// circle already is decided here, inside the transaction, like `addMemberships`.
					const member = tx
						.select({ id: circleMembership.id })
						.from(circleMembership)
						.where(
							and(
								eq(circleMembership.circleId, row.circleId),
								eq(circleMembership.contactId, row.contactId)
							)
						)
						.get();
					if (member) continue;
					memberships += inserted(
						tx
							.insert(circleMembership)
							.values(row)
							.onConflictDoNothing()
							.returning({ id: circleMembership.id })
							.all()
					);
				}
				if (audit) tx.insert(activityLog).values(audit).run();
				return { people, fields, relationships, circles, memberships };
			});
		}
	};
}
