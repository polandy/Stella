import type {
	CircleColor,
	CircleKind,
	CircleRepository,
	CircleWithCount
} from '../circles/circles';
import type { CircleDirectoryReads } from '../circles/directory';
import type { CircleMembershipReads } from '../circles/memberships';

/*
 * In-memory read models of the household's circles. Like the people fakes (`contacts.ts`), the
 * rows a fake is built over are the ones the viewer may see: scoping is the access layer's job,
 * covered against SQLite in `db/circle-reads.test.ts`.
 */

/** A circle with every optional field empty and nobody in it, plus whatever the test is about. */
export function someCircle(
	id: string,
	name: string,
	fields: Partial<Omit<CircleWithCount, 'id' | 'name'>> = {}
): CircleWithCount {
	return {
		id,
		householdId: 'h',
		createdBy: 'u',
		visibility: 'shared',
		name,
		description: null,
		kind: 'other',
		color: 'blue',
		startDate: null,
		endDate: null,
		memberCount: 0,
		preview: [],
		...fields
	};
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** `CircleDirectoryReads` over a fixed list of circles. */
export function inMemoryCircleDirectory(circles: readonly CircleWithCount[]): CircleDirectoryReads {
	return { listVisibleTo: async () => [...circles].sort(byName) };
}

/** One person in one circle, as every membership list reads it. */
export interface FakeMembership {
	membershipId: string;
	circleId: string;
	circleName: string;
	kind: CircleKind;
	color: CircleColor;
	contactId: string;
	displayName: string;
	avatarPhotoId: string | null;
	role: string | null;
}

/** `contactId` in `circleId` without a role, both named by their ids unless the test says. */
export function membership(
	circleId: string,
	contactId: string,
	fields: Partial<Omit<FakeMembership, 'circleId' | 'contactId'>> = {}
): FakeMembership {
	return {
		membershipId: `${circleId}/${contactId}`,
		circleId,
		circleName: circleId,
		kind: 'other',
		color: 'blue',
		contactId,
		displayName: contactId,
		avatarPhotoId: null,
		role: null,
		...fields
	};
}

/** SQLite's order: no role sorts before any role. */
const byRole = (a: string | null, b: string | null) =>
	a === b ? 0 : a === null ? -1 : b === null ? 1 : a.localeCompare(b);

/** `CircleMembershipReads` over a fixed list of memberships. */
export function inMemoryCircleMemberships(
	memberships: readonly FakeMembership[]
): CircleMembershipReads {
	return {
		listMembersVisibleTo: async (_viewer, circleId) =>
			memberships
				.filter((m) => m.circleId === circleId)
				.sort((a, b) => a.displayName.localeCompare(b.displayName))
				.map(({ membershipId, contactId, displayName, avatarPhotoId, role }) => ({
					membershipId,
					contactId,
					displayName,
					avatarPhotoId,
					role
				})),
		listForContactVisibleTo: async (_viewer, contactId) =>
			memberships
				.filter((m) => m.contactId === contactId)
				.sort((a, b) => a.circleName.localeCompare(b.circleName))
				.map(({ membershipId, circleId, circleName, kind, color, role }) => ({
					membershipId,
					circleId,
					name: circleName,
					kind,
					color,
					role
				})),
		listRoleUsesVisibleTo: async () =>
			[...memberships]
				.sort((a, b) => a.circleName.localeCompare(b.circleName) || byRole(a.role, b.role))
				.map(({ circleName, role }) => ({ circleName, role }))
	};
}

/** Every method of the port: a method added to it and not here fails to compile. */
const CIRCLE_REPOSITORY_METHODS: Record<keyof CircleRepository, true> = {
	insert: true,
	findByNameVisibleTo: true,
	getVisibleTo: true,
	addMemberships: true,
	removeMembership: true,
	setRoles: true,
	renameRole: true
};

/**
 * A `CircleRepository` that does what the test hands it and fails loud on anything else (as
 * `contactRepositoryWith`). The writes a test records are its own: that is what it asserts.
 */
export function circleRepositoryWith(methods: Partial<CircleRepository>): CircleRepository {
	const unexpected = (name: string) => async () => {
		throw new Error(`CircleRepository.${name} was not expected in this test`);
	};
	const stubs = Object.fromEntries(
		Object.keys(CIRCLE_REPOSITORY_METHODS).map((name) => [name, unexpected(name)])
	) as unknown as CircleRepository;
	return { ...stubs, ...methods };
}
