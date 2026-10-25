import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactColumnsVisibleTo, contactVisibleTo } from '../access/query-scoping';
import type { HeldAddress, HomeOf, HomeReads, HomeRepository } from '../domain/homes/homes';
import type * as schema from './schema';
import { contact, contactField, home, homeMember } from './schema';

/*
 * Drizzle adapters for the home ports (docs/08 §8.3). A home has no visibility of its own: it
 * is reached through a member, and that member is scoped through the central
 * `contactVisibleTo` — so is everyone named beside them. The database deletes a home with its
 * last member (migration 0031), so no write here has to remember to.
 */

export function createDrizzleHomeRepository(db: BunSQLiteDatabase<typeof schema>): HomeRepository {
	return {
		async findForMemberVisibleTo(viewer, homeId, contactId) {
			const found = db
				.select({
					id: home.id,
					householdId: home.householdId,
					label: home.label,
					value: home.value,
					meta: home.meta
				})
				.from(home)
				.innerJoin(homeMember, eq(homeMember.homeId, home.id))
				.innerJoin(contact, eq(contact.id, homeMember.contactId))
				.where(
					and(eq(home.id, homeId), eq(homeMember.contactId, contactId), contactVisibleTo(viewer))
				)
				.get();
			if (!found) return null;
			const members = db
				.select({
					contactId: homeMember.contactId,
					visible: sql<number>`${contactVisibleTo(viewer)}`
				})
				.from(homeMember)
				.innerJoin(contact, eq(contact.id, homeMember.contactId))
				.where(eq(homeMember.homeId, homeId))
				.all();
			return {
				...found,
				members: members.map((m) => ({ contactId: m.contactId, visible: Boolean(m.visible) }))
			};
		},

		async addressesOf(contactIds) {
			if (contactIds.length === 0) return [];
			const ids = [...contactIds];
			const own: HeldAddress[] = db
				.select({
					contactId: contactField.contactId,
					id: contactField.id,
					label: contactField.label,
					value: contactField.value,
					meta: contactField.meta
				})
				.from(contactField)
				.where(and(inArray(contactField.contactId, ids), eq(contactField.kind, 'address')))
				.orderBy(asc(contactField.sortOrder), asc(contactField.createdAt))
				.all()
				.map((row) => ({ ...row, source: 'field' }));
			const homes: HeldAddress[] = db
				.select({
					contactId: homeMember.contactId,
					id: home.id,
					label: home.label,
					value: home.value,
					meta: home.meta
				})
				.from(homeMember)
				.innerJoin(home, eq(home.id, homeMember.homeId))
				.where(inArray(homeMember.contactId, ids))
				.orderBy(asc(homeMember.createdAt))
				.all()
				.map((row) => ({ ...row, source: 'home' }));
			return [...own, ...homes];
		},

		async apply(change) {
			db.transaction((tx) => {
				if (change.create) tx.insert(home).values(change.create).run();
				if (change.update) {
					const { id, ...set } = change.update;
					tx.update(home).set(set).where(eq(home.id, id)).run();
				}
				for (const drop of change.dropFields) {
					tx.delete(contactField)
						.where(and(eq(contactField.id, drop.fieldId), eq(contactField.contactId, drop.contactId)))
						.run();
				}
				if (change.addFields.length > 0) tx.insert(contactField).values(change.addFields).run();
				if (change.join.length > 0) {
					tx.insert(homeMember).values(change.join).onConflictDoNothing().run();
				}
				for (const out of change.leave) {
					tx.delete(homeMember)
						.where(and(eq(homeMember.homeId, out.homeId), eq(homeMember.contactId, out.contactId)))
						.run();
				}
			});
		}
	};
}

export function createDrizzleHomeReads(db: BunSQLiteDatabase<typeof schema>): HomeReads {
	const other = alias(contact, 'other');
	const otherMember = alias(homeMember, 'other_member');
	return {
		async listForContactVisibleTo(viewer, contactId) {
			const rows = db
				.select({
					id: home.id,
					label: home.label,
					value: home.value,
					otherId: other.id,
					otherName: other.displayName
				})
				.from(homeMember)
				.innerJoin(contact, eq(contact.id, homeMember.contactId))
				.innerJoin(home, eq(home.id, homeMember.homeId))
				.leftJoin(
					otherMember,
					and(eq(otherMember.homeId, home.id), ne(otherMember.contactId, contactId))
				)
				.leftJoin(
					other,
					and(eq(other.id, otherMember.contactId), contactColumnsVisibleTo(viewer, other))
				)
				.where(and(eq(homeMember.contactId, contactId), contactVisibleTo(viewer)))
				.orderBy(asc(homeMember.createdAt), asc(home.id), asc(other.displayName))
				.all();

			const homes = new Map<string, HomeOf>();
			for (const row of rows) {
				let found = homes.get(row.id);
				if (!found) {
					found = { id: row.id, label: row.label, value: row.value, livesWith: [] };
					homes.set(row.id, found);
				}
				if (row.otherId !== null && row.otherName !== null) {
					found.livesWith.push({ id: row.otherId, displayName: row.otherName });
				}
			}
			return [...homes.values()];
		}
	};
}
