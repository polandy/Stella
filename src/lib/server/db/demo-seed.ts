import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq, like } from 'drizzle-orm';
import type * as schema from './schema';
import { relationshipPair } from '../../relationships/endpoints';
import { defaultParentKindFor } from '../../relationships/parent-kinds';
import { hashPasswordSync } from '../auth/password';
import { systemClock, type Clock } from '../clock';
import {
	DEMO_ADMIN_EMAIL,
	DEMO_ADMIN_PASSWORD,
	DEMO_MEMBER_EMAIL,
	DEMO_THIRD_MEMBER_EMAIL,
	DEMO_THIRD_MEMBER_ID
} from './demo-constants';
import { CIRCLES, MEMBERSHIPS, PEOPLE, RELATIONSHIPS, type Person } from './demo-people';
import {
	DAY_MS,
	FIELDS,
	GIFTS,
	IMPORTANT_DATES,
	MEMORIES,
	NOTES,
	SEED_AGE_DAYS,
	STORY,
	SYMMETRIC_TYPES,
	TODOS,
	circleId,
	cid,
	dayBefore,
	mentionedBy,
	sameDayYearsBack,
	withMentions
} from './demo-story';
import {
	circle,
	circleMembership,
	contact,
	contactField,
	gift,
	household,
	importantDate,
	interaction,
	journalEntry,
	journalMention,
	note,
	noteMention,
	relationship,
	todo,
	user
} from './schema';

/*
 * Demo/test seed (docs/dev/06 roadmap — test phase). Populates the database with a realistic
 * Swiss family — the Brunners of Bern — their extended family, friends, and their children's
 * clubs and school classes, so every surface (contacts, relationships, the graph explorer,
 * circles, search) has meaningful data to exercise.
 *
 * Idempotent: every row uses a stable `demo-…` id and is inserted with `onConflictDoNothing`,
 * so it is safe to run on every startup (gated by SEED_DEMO). Reseeding never duplicates.
 *
 * Demo contacts and circles are attached to the existing household when one is present
 * (e.g. after the setup wizard); on a fresh database a demo household and a break-glass admin
 * are created so there is a known login. Credentials are logged once on creation.
 */

/** How the seed turns the demo password into what it stores. */
export type HashPassword = (password: string) => string;

/** What the seed needs from the outside world. */
export interface DemoSeedDeps {
	/**
	 * Defaults to the real Argon2id adapter. Tests inject a cheap stub: Argon2id is
	 * deliberately expensive, and paying for it in every case that only looks at contacts
	 * or circles made the suite slow enough to trip its own timeout.
	 */
	hashPassword?: HashPassword;
	/**
	 * Defaults to the system clock. Every "today", "recent" and "years back" date in the
	 * dataset is counted from it, so a test passes a fixed one and asserts exact days.
	 */
	clock?: Clock;
}

/**
 * Populate the database with the Brunner demo dataset. Idempotent via stable ids +
 * `onConflictDoNothing`. Returns a short summary for logging.
 */
export function seedDemoData(
	db: BunSQLiteDatabase<typeof schema>,
	deps: DemoSeedDeps = {}
): {
	created: boolean;
	householdId: string;
	contacts: number;
} {
	const { householdId, authorId, memberId, created } = resolveHouseholdAndAuthor(
		db,
		deps.hashPassword ?? hashPasswordSync
	);

	const displayName = (p: Person) => `${p.first} ${p.last}`;
	const now = (deps.clock ?? systemClock).now();
	const seededAt = now - SEED_AGE_DAYS * DAY_MS;

	db.insert(contact)
		.values(
			PEOPLE.map((p) => ({
				id: cid(p.key),
				householdId,
				createdBy: authorId,
				firstName: p.first,
				lastName: p.last,
				displayName: displayName(p),
				nickname: p.nickname ?? null,
				gender: p.gender,
				description: p.description ?? null,
				birthDate: p.birth ?? null,
				jobTitle: p.job ?? null,
				company: p.company ?? null,
				createdAt: seededAt,
				updatedAt: seededAt
			}))
		)
		.onConflictDoNothing()
		.run();

	db.insert(contactField)
		.values(
			FIELDS.map((f, i) => ({
				id: `demo-field-${f.person}-${i}`,
				contactId: cid(f.person),
				kind: f.kind,
				label: f.label,
				value: f.value,
				sortOrder: i
			}))
		)
		.onConflictDoNothing()
		.run();

	db.insert(relationship)
		.values(
			RELATIONSHIPS.map((r) => {
				const symmetric = r.symmetric ?? SYMMETRIC_TYPES.has(r.type);
				return {
					id: `demo-rel-${r.from}-${r.to}-${r.type}`,
					householdId,
					...relationshipPair(cid(r.from), cid(r.to), symmetric),
					typeId: r.type,
					parentKind: defaultParentKindFor(r.type),
					createdBy: authorId,
					createdAt: seededAt
				};
			})
		)
		.onConflictDoNothing()
		.run();

	db.insert(circle)
		.values(
			CIRCLES.map((c) => ({
				id: circleId(c.key),
				householdId,
				createdBy: authorId,
				name: c.name,
				description: c.description ?? null,
				kind: c.kind,
				color: c.color,
				parentCircleId: c.parent ? circleId(c.parent) : null,
				startDate: c.start ?? null
			}))
		)
		.onConflictDoNothing()
		.run();

	db.insert(circleMembership)
		.values(
			MEMBERSHIPS.map((m) => ({
				id: `demo-mem-${m.circle}-${m.person}`,
				circleId: circleId(m.circle),
				contactId: cid(m.person),
				role: m.role ?? null,
				startDate: m.start ?? null,
				createdBy: authorId
			}))
		)
		.onConflictDoNothing()
		.run();

	// An earlier version of this seed wrote a birthday row per person, which now shadows the
	// derived birthday and silences it (docs/dev/02 §2.13.2). Drop those; they are demo rows.
	db.delete(importantDate).where(like(importantDate.id, 'demo-date-bday-%')).run();

	// No birthday rows: a birthday is derived from `contact.birth_date` and duplicating it
	// here would shadow the derived one (docs/dev/02 §2.13.2). Only the dates a birth date
	// cannot express are seeded.
	db.insert(importantDate)
		.values(
			IMPORTANT_DATES.map((d, i) => ({
				id: `demo-date-${d.person}-${i}`,
				contactId: cid(d.person),
				kind: d.kind,
				label: d.label ?? null,
				date: d.date,
				recursYearly: d.once ? 0 : 1,
				remind: 1
			}))
		)
		.onConflictDoNothing()
		.run();

	const notes = NOTES.map((n, i) => ({
		id: `demo-note-${n.person}-${i}`,
		contactId: cid(n.person),
		createdBy: authorId,
		title: n.title,
		body: withMentions(n.body),
		isPinned: n.pinned ? 1 : 0
	}));
	db.insert(note).values(notes).onConflictDoNothing().run();
	if (created) {
		db.insert(note)
			.values([
				{
					id: 'demo-note-lukas-shared',
					contactId: cid('noah'),
					createdBy: DEMO_THIRD_MEMBER_ID,
					body: 'Noah will im Sommer mit ins Lager — Anmeldung bis Ende Mai.',
					visibility: 'shared'
				},
				{
					id: 'demo-note-lukas-private',
					contactId: cid('noah'),
					createdBy: DEMO_THIRD_MEMBER_ID,
					body: 'Geschenkidee: das Buch über Vulkane.',
					visibility: 'private'
				}
			])
			.onConflictDoNothing()
			.run();
	}
	const noteMentions = notes.flatMap((n) =>
		mentionedBy(n).map((contactId) => ({ noteId: n.id, contactId }))
	);
	if (noteMentions.length > 0) {
		db.insert(noteMention).values(noteMentions).onConflictDoNothing().run();
	}

	const entries = STORY.filter((s) => s.kind === undefined).map((s, i) => ({
		id: `demo-journal-${s.person}-${i}`,
		contactId: cid(s.person),
		subjectKey: cid(s.person),
		createdBy: s.byMember ? memberId : authorId,
		entryDate: dayBefore(now, s.daysAgo),
		body: withMentions(s.text),
		// Dated when they happened, so the stream does not show a year of "just now".
		createdAt: now - s.daysAgo * DAY_MS,
		updatedAt: now - s.daysAgo * DAY_MS
	}));
	db.insert(journalEntry).values(entries).onConflictDoNothing().run();
	const journalMentions = entries.flatMap((e) =>
		mentionedBy(e).map((contactId) => ({ journalEntryId: e.id, contactId }))
	);
	if (journalMentions.length > 0) {
		db.insert(journalMention).values(journalMentions).onConflictDoNothing().run();
	}

	const dated = STORY.flatMap((s) => (s.kind === undefined ? [] : [{ ...s, kind: s.kind }])).map(
		(s, i) => ({
			id: `demo-touch-${s.person}-${i}`,
			kind: s.kind,
			contactId: cid(s.person),
			createdBy: s.byMember ? memberId : authorId,
			day: dayBefore(now, s.daysAgo),
			title: s.text,
			createdAt: now - s.daysAgo * DAY_MS,
			updatedAt: now - s.daysAgo * DAY_MS
		})
	);
	db.insert(interaction)
		.values(
			dated.flatMap(({ kind, day, ...row }) =>
				kind === 'gift' ? [] : [{ ...row, kind, happenedAt: day }]
			)
		)
		.onConflictDoNothing()
		.run();
	db.insert(gift)
		.values(
			dated.flatMap(({ kind, day, ...row }) =>
				kind === 'gift' ? [{ ...row, state: 'given' as const, givenOn: day }] : []
			)
		)
		.onConflictDoNothing()
		.run();

	const memoryAt = (yearsAgo: number) => Date.parse(sameDayYearsBack(now, yearsAgo));
	const memoryMoments = MEMORIES.filter((m) => m.kind === undefined).map((m) => ({
		id: `demo-memory-${m.key}`,
		contactId: cid(m.person),
		subjectKey: cid(m.person),
		createdBy: authorId,
		entryDate: sameDayYearsBack(now, m.yearsAgo),
		body: withMentions(m.text),
		createdAt: memoryAt(m.yearsAgo),
		updatedAt: memoryAt(m.yearsAgo)
	}));
	db.insert(journalEntry).values(memoryMoments).onConflictDoNothing().run();
	db.insert(journalMention)
		.values(
			memoryMoments.flatMap((e) =>
				mentionedBy(e).map((contactId) => ({ journalEntryId: e.id, contactId }))
			)
		)
		.onConflictDoNothing()
		.run();
	db.insert(interaction)
		.values(
			MEMORIES.flatMap((m) =>
				m.kind === undefined
					? []
					: [
							{
								id: `demo-memory-${m.key}`,
								kind: m.kind,
								contactId: cid(m.person),
								createdBy: authorId,
								happenedAt: sameDayYearsBack(now, m.yearsAgo),
								title: m.text,
								createdAt: memoryAt(m.yearsAgo),
								updatedAt: memoryAt(m.yearsAgo)
							}
						]
			)
		)
		.onConflictDoNothing()
		.run();

	db.insert(gift)
		.values(
			GIFTS.map((g) => ({
				id: `demo-gift-${g.key}`,
				contactId: cid('ursula'),
				createdBy: g.byMember ? memberId : authorId,
				state: g.state,
				title: g.title,
				note: g.note ?? null,
				url: g.url ?? null,
				givenOn: g.state === 'idea' ? null : dayBefore(now, g.daysAgo),
				occasion: g.occasion ?? null,
				createdAt: now - g.daysAgo * DAY_MS,
				updatedAt: now - g.daysAgo * DAY_MS
			}))
		)
		.onConflictDoNothing()
		.run();

	db.insert(todo)
		.values(
			TODOS.map((t) => ({
				id: `demo-todo-${t.key}`,
				contactId: cid(t.person ?? 'peter'),
				createdBy: t.byMember ? memberId : authorId,
				visibility: t.private ? ('private' as const) : ('shared' as const),
				title: t.title,
				dueOn: t.dueIn === null ? null : dayBefore(now, -t.dueIn),
				doneAt: t.doneDaysAgo === undefined ? null : now - t.doneDaysAgo * DAY_MS,
				doneOn: t.doneDaysAgo === undefined ? null : dayBefore(now, t.doneDaysAgo),
				doneBy: t.doneDaysAgo === undefined ? null : authorId,
				createdAt: now - 20 * DAY_MS,
				updatedAt: now - 20 * DAY_MS
			}))
		)
		.onConflictDoNothing()
		.run();

	return { created, householdId, contacts: PEOPLE.length };
}

/**
 * Attach the demo data to the existing household (using its first admin as author) when one
 * exists; otherwise create a demo household and a break-glass admin with a known login.
 * `created` is true only when this call created the demo household (a fresh database).
 */
function resolveHouseholdAndAuthor(
	db: BunSQLiteDatabase<typeof schema>,
	hashPassword: HashPassword
): {
	householdId: string;
	authorId: string;
	/** Whoever the second member is; the first one again when the household has only one. */
	memberId: string;
	created: boolean;
} {
	const existingHousehold = db.select({ id: household.id }).from(household).limit(1).all();
	if (existingHousehold.length > 0) {
		const householdId = existingHousehold[0].id;
		const members = db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.householdId, householdId))
			.limit(2)
			.all();
		if (members.length > 0) {
			return {
				householdId,
				authorId: members[0].id,
				memberId: (members[1] ?? members[0]).id,
				created: false
			};
		}
	}

	// Reached only when no household exists at all, so this is always a fresh creation.
	const householdId = 'demo-household';
	const authorId = 'demo-user-admin';
	const memberId = 'demo-user-member';
	db.insert(household).values({ id: householdId, name: 'Familie Brunner' }).run();
	const passwordHash = hashPassword(DEMO_ADMIN_PASSWORD);
	db.insert(user)
		.values({
			id: authorId,
			householdId,
			email: DEMO_ADMIN_EMAIL,
			name: 'Demo Admin',
			passwordHash,
			role: 'admin',
			roleLocked: 1
		})
		.run();

	// A second member so the story has two names on it; they share the demo password.
	db.insert(user)
		.values({
			id: memberId,
			householdId,
			email: DEMO_MEMBER_EMAIL,
			name: 'Nina Brunner',
			passwordHash,
			role: 'member'
		})
		.run();

	db.insert(user)
		.values({
			id: DEMO_THIRD_MEMBER_ID,
			householdId,
			email: DEMO_THIRD_MEMBER_EMAIL,
			name: 'Lukas Brunner',
			passwordHash,
			role: 'member'
		})
		.run();

	console.log(
		`[seed] created demo household + admin — login: ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD}`
	);
	return { householdId, authorId, memberId, created: true };
}
