import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import { createDrizzleCircleDirectoryReads } from '../db/circle-directory-reads';
import { createDrizzleCircleMembershipReads } from '../db/circle-membership-reads';
import { createDrizzleCirclePhotoRepository } from '../db/circle-photo-repository';
import { createDrizzleCircleRepository } from '../db/circle-repository';
import { createDrizzleCutRepository } from '../db/cut-repository';
import type * as schema from '../db/schema';
import type { CirclePhotoDeps, CirclePhotoRepository } from '../domain/circles/circle-photos';
import type {
	CircleDeps,
	CircleRepository,
	MemberRemovalDeps,
	MemberRoleDeps
} from '../domain/circles/circles';
import type { CircleDirectoryDeps } from '../domain/circles/directory';
import type { CircleMembershipDeps } from '../domain/circles/memberships';
import type { RenameRoleDeps } from '../domain/circles/rename-role';
import type { MediaStore } from '../domain/media/avatars';
import type { CutDeps, CutRepository } from '../domain/media/cuts';
import type { IdGenerator } from '../id';

/*
 * The `circles` bounded context of the composition root (docs/08 §8.3): the groups people
 * belong to and the roles they hold there, the circle's photos, and the profile pictures cut
 * from them. Built once per process by `createServices`; the edge reads it off
 * `locals.services.circles`.
 *
 * A repository an edge — or another context — reads directly sits under its plural noun
 * (`circles`); everything else is a use-case's `deps`, named after its type
 * (`circleDeps` is a `CircleDeps`). A circle's writes and its lists are separate ports with an
 * adapter each (docs/08 §8.3): the overview (`circleDirectoryDeps`) and who is in which circle
 * (`circleMembershipDeps`), which re-roling, removing, renaming a role and the photos read too.
 */
export interface CircleServices {
	/** A circle's writes and one-circle reads: every use-case below, and the command handlers. */
	circles: CircleRepository;
	/** The one circle photo repository (docs/02 §2.4.2). */
	circlePhotos: CirclePhotoRepository;
	/** The one cut repository: who wears a picture cut from which group photo (docs/02 §2.14). */
	cuts: CutRepository;
	circleDeps: CircleDeps;
	circleDirectoryDeps: CircleDirectoryDeps;
	circleMembershipDeps: CircleMembershipDeps;
	memberRoleDeps: MemberRoleDeps;
	memberRemovalDeps: MemberRemovalDeps;
	circlePhotoDeps: CirclePhotoDeps;
	/** Renaming a role touches the circle's members and its photos alike. */
	renameRoleDeps: RenameRoleDeps;
	cutDeps: CutDeps;
}

export interface CircleWiring {
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
	/** Whom a picture is cut for; the people context owns the repository. */
	contacts: CutDeps['contacts'];
	/** Where a circle photo's and a cut's bytes are kept; the media context owns the store. */
	media: MediaStore;
}

export function createCircleServices({
	db,
	clock,
	ids,
	contacts,
	media
}: CircleWiring): CircleServices {
	const circles = createDrizzleCircleRepository(db);
	const memberships = createDrizzleCircleMembershipReads(db);
	const circlePhotos = createDrizzleCirclePhotoRepository(db);
	const cuts = createDrizzleCutRepository(db);

	return {
		circles,
		circlePhotos,
		cuts,
		circleDeps: { circles, ids, clock },
		circleDirectoryDeps: { directory: createDrizzleCircleDirectoryReads(db) },
		circleMembershipDeps: { memberships },
		memberRoleDeps: { circles, memberships, clock },
		memberRemovalDeps: { circles, memberships },
		circlePhotoDeps: { circlePhotos, circles, memberships, media, ids, clock },
		renameRoleDeps: { circles, memberships, circlePhotos, clock },
		cutDeps: { cuts, contacts, media, ids, clock }
	};
}
