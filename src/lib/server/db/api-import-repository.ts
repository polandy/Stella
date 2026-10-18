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
import {
	localizedActivityEntry,
	type ActivityOf,
	type ActivityWording
} from '../domain/activity/activity';
import type {
	ApiImportRepository,
	ApiImportWritten,
	HouseholdReading
} from '../domain/import/api/api-import';
import type { ApiImportPlan, KnownField, KnownPerson } from '../domain/import/api/plan';
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
 * document can neither link to nor be told about somebody the member may not see. Two things are
 * read past that scope, each only ever answering yes or no and never shown: whether an id is
 * *taken*, so a new record is refused rather than colliding with a hidden one, and the
 * household's circle nesting as bare ids, so a move cannot close a loop through a hidden circle
 * (ADR-125).
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
	db: BunSQLiteDatabase<typeof schema>,
	wording: ActivityWording
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
			const fieldRows = inBatches([...people.keys()], (batch) =>
				db
					.select({
						contactId: contactField.contactId,
						id: contactField.id,
						kind: contactField.kind,
						value: contactField.value,
						sortOrder: contactField.sortOrder
					})
					.from(contactField)
					.where(inArray(contactField.contactId, batch))
					.all()
			);
			const fieldsOf = new Map<string, KnownField[]>();
			for (const { contactId, ...field } of fieldRows) {
				fieldsOf.set(contactId, [...(fieldsOf.get(contactId) ?? []), field]);
			}
			const takenContacts = inBatches(ids.contactIds, (batch) =>
				db.select({ id: contact.id }).from(contact).where(inArray(contact.id, batch)).all()
			);

			const visibleCircles = inBatches(ids.circleIds, (batch) =>
				db
					.select({
						id: circle.id,
						name: circle.name,
						kind: circle.kind,
						description: circle.description,
						startDate: circle.startDate,
						endDate: circle.endDate,
						parentCircleId: circle.parentCircleId
					})
					.from(circle)
					.where(and(inArray(circle.id, batch), circleColumnsVisibleTo(viewer, circle)))
					.all()
			);
			// A parent's name only where the member may see it; otherwise it is only said to be there.
			const parentIds = [
				...new Set(visibleCircles.flatMap((c) => (c.parentCircleId ? [c.parentCircleId] : [])))
			];
			const parentNames = new Map(
				inBatches(parentIds, (batch) =>
					db
						.select({ id: circle.id, name: circle.name })
						.from(circle)
						.where(and(inArray(circle.id, batch), circleColumnsVisibleTo(viewer, circle)))
						.all()
				).map((p) => [p.id, p.name])
			);
			// Read past the scope on purpose: the whole nesting, ids only, so a move cannot close a
			// loop through a circle the member may not see. It never reaches the caller.
			const circleParents = new Map(
				db
					.select({ id: circle.id, parentCircleId: circle.parentCircleId })
					.from(circle)
					.where(eq(circle.householdId, viewer.householdId))
					.all()
					.map((c) => [c.id, c.parentCircleId])
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
						kind: c.kind,
						description: c.description,
						startDate: c.startDate,
						endDate: c.endDate,
						parent: c.parentCircleId
							? { id: c.parentCircleId, name: parentNames.get(c.parentCircleId) ?? null }
							: null,
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
				fieldsOf,
				hiddenIds,
				circles,
				circleParents,
				types,
				links: uniqueLinks,
				graph: loadKinshipGraph(db, viewer),
				directory
			};
		},

		async applyPlan(
			viewer: Viewer,
			plan: ApiImportPlan,
			audit: ActivityOf<'people.imported'> | null
		): Promise<ApiImportWritten> {
			return db.transaction((tx) => {
				// The Bun driver types `run()` as void, so rows are counted through `returning()`.
				const written = (rows: unknown[]) => rows.length;
				let people = 0;
				for (const row of plan.contacts) {
					people += written(
						tx.insert(contact).values(row).onConflictDoNothing().returning({ id: contact.id }).all()
					);
				}
				let fields = 0;
				for (const row of plan.fields) {
					fields += written(
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
					relationships += written(
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
					circles += written(
						tx.insert(circle).values(row).onConflictDoNothing().returning({ id: circle.id }).all()
					);
				}
				// After the new circles, so a circle can move inside one this sending creates; scoped
				// as the circle's edit form writes it, so one that turned private meanwhile is skipped.
				let circlesChanged = 0;
				for (const change of plan.circleChanges) {
					circlesChanged += written(
						tx
							.update(circle)
							.set({ ...change.set, updatedAt: change.updatedAt })
							.where(and(eq(circle.id, change.id), circleColumnsVisibleTo(viewer, circle)))
							.returning({ id: circle.id })
							.all()
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
					memberships += written(
						tx
							.insert(circleMembership)
							.values(row)
							.onConflictDoNothing()
							.returning({ id: circleMembership.id })
							.all()
					);
				}
				if (audit) tx.insert(activityLog).values(localizedActivityEntry(audit, wording)).run();
				return {
					added: { people, fields, relationships, circles, memberships },
					changed: { circles: circlesChanged }
				};
			});
		}
	};
}
