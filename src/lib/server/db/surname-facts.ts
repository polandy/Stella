import { and, eq, isNull } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import {
	circleColumnsVisibleTo,
	contactVisibleTo,
	membershipVisibleTo
} from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { SurnameFactsSource, SurnameListPerson } from '../domain/contacts/last-names';
import type { FamilyCircle } from '../../suggestions/rules/surnames';
import type * as schema from './schema';
import { circle, circleMembership, contact } from './schema';

/*
 * Drizzle adapter for what the last-name rules read beyond the kinship graph
 * (docs/02 §2.2.4.1): every person the viewer may see — archived ones too,
 * since a grandmother's name is still a source — and the family-kind circles with their visible
 * members. Scoped through the central conditions (docs/03 §3.7); a circle's name is carried for
 * the reason only and never read as a name.
 */
export function createDrizzleSurnameFacts(
	db: BunSQLiteDatabase<typeof schema>
): SurnameFactsSource {
	return {
		async loadSurnameFactsVisibleTo(viewer: Viewer) {
			const people: SurnameListPerson[] = db
				.select({
					id: contact.id,
					displayName: contact.displayName,
					firstName: contact.firstName,
					lastName: contact.lastName,
					nickname: contact.nickname,
					formerName: contact.formerName,
					avatarPhotoId: contact.avatarPhotoId,
					isDeceased: contact.isDeceased,
					archivedAt: contact.archivedAt
				})
				.from(contact)
				.where(contactVisibleTo(viewer))
				.all()
				.map(({ isDeceased, archivedAt, ...p }) => ({
					...p,
					isDeceased: isDeceased === 1,
					archived: archivedAt !== null
				}));

			const memberships = db
				.select({ circleId: circle.id, name: circle.name, contactId: circleMembership.contactId })
				.from(circleMembership)
				.innerJoin(circle, eq(circleMembership.circleId, circle.id))
				.innerJoin(contact, eq(circleMembership.contactId, contact.id))
				.where(
					and(
						circleColumnsVisibleTo(viewer, circle),
						membershipVisibleTo(viewer, circle, contact),
						eq(circle.kind, 'family'),
						isNull(circle.archivedAt)
					)
				)
				.all();
			const circles = new Map<string, FamilyCircle & { memberIds: string[] }>();
			for (const m of memberships) {
				const known = circles.get(m.circleId) ?? { id: m.circleId, name: m.name, memberIds: [] };
				known.memberIds.push(m.contactId);
				circles.set(m.circleId, known);
			}
			return { people, familyCircles: [...circles.values()] };
		}
	};
}
