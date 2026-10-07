import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import { isImmichId } from './gateway';
import { ImmichLinkRefusedError } from './links';

/*
 * Faces of *New from Immich* the household said are nobody to add (docs/02 §2.24.7,
 * docs/02 §2.24.7). Unlike an ignored pair of *Find your people*, there is no
 * contact to hang it on: it is about the Immich person alone, so it belongs to the household —
 * every member sees it and may take it back. Kept with who said so and when, so the tab can show
 * it rather than having a face silently vanish. Not in the activity log, like an ignored pair.
 */

/** One ignored face. */
export interface ImmichNameIgnore {
	householdId: string;
	immichPersonId: string;
	/** The member who ignored it. */
	ignoredBy: string;
	ignoredAt: number;
}

/** Where ignored faces are kept, per household. */
export interface ImmichNameIgnoreRepository {
	/** The viewer's household's ignored faces, oldest first. */
	listForHousehold(viewer: Viewer): Promise<ImmichNameIgnore[]>;
	/** Keeps the face; one already kept keeps its first record (who, when). */
	save(ignore: ImmichNameIgnore): Promise<void>;
	/** Forgets the face for the viewer's household; false when nothing was removed. */
	remove(viewer: Viewer, immichPersonId: string): Promise<boolean>;
}

export interface ImmichNameIgnoreDeps {
	nameIgnores: ImmichNameIgnoreRepository;
	clock: Clock;
}

type Actor = { userId: string; householdId: string };

/** *Ignore* on a row of *New from Immich*. Needs nothing from Immich. */
export async function ignoreNewcomer(
	deps: ImmichNameIgnoreDeps,
	actor: Actor,
	immichPersonId: string
): Promise<void> {
	if (!isImmichId(immichPersonId)) throw new ImmichLinkRefusedError('notFound');
	await deps.nameIgnores.save({
		householdId: actor.householdId,
		immichPersonId,
		ignoredBy: actor.userId,
		ignoredAt: deps.clock.now()
	});
}

/** *Propose again*: forget that the face was ignored. */
export function proposeNewcomerAgain(
	deps: Pick<ImmichNameIgnoreDeps, 'nameIgnores'>,
	viewer: Viewer,
	immichPersonId: string
): Promise<boolean> {
	return deps.nameIgnores.remove(viewer, immichPersonId);
}
