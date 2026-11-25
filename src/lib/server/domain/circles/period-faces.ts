import {
	circleIsPast,
	memberWindow,
	periodFace,
	thenChangesAnything,
	type PeriodFace
} from '../../../circles/period-face';
import { todayFor } from '../../../dates/today';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';

/*
 * Each member's face at the time of their circle (docs/dev/02 §2.4.2, *Then · Now*): one batched
 * read of the members' square pictures the reader may see, then the pure pick per member. Nothing
 * is stored for it; the faces are the photo rows Stella already holds (docs/dev/02 §2.14).
 */

/** One square picture of a person, dated as `datedAt` dates a photo. */
export interface PersonFace {
	contactId: string;
	photoId: string;
	datedAt: number;
	/** The circle of the group photo it was cut from, when the reader sees that photo. */
	circleId: string | null;
}

/** The faces of people, read through the access layer (docs/dev/03 §3.7). */
export interface PersonFaceReads {
	/** Every visible face of `contactIds`: square pictures, framings and cuts. */
	listFacesOfVisibleTo(viewer: Viewer, contactIds: readonly string[]): Promise<PersonFace[]>;
}

export interface PeriodFaceDeps {
	faces: PersonFaceReads;
	clock: Clock;
}

type Period = { startDate: string | null; endDate: string | null };

/** A membership to pick a face for, with its circle's period. */
export interface PeriodFaceMember extends Period {
	/** What the answer is keyed by: a membership id, or a card and person on *Arrange people*. */
	key: string;
	contactId: string;
	avatarPhotoId: string | null;
	circle: Period & { id: string };
}

/** The face of each member, by key. */
export async function readPeriodFaces(
	deps: PeriodFaceDeps,
	viewer: Viewer,
	members: readonly PeriodFaceMember[]
): Promise<Record<string, PeriodFace>> {
	if (members.length === 0) return {};
	const faces = await deps.faces.listFacesOfVisibleTo(viewer, [
		...new Set(members.map((m) => m.contactId))
	]);
	const byPerson = new Map<string, PersonFace[]>();
	for (const f of faces) byPerson.set(f.contactId, [...(byPerson.get(f.contactId) ?? []), f]);
	const today = todayFor(deps.clock);
	return Object.fromEntries(
		members.map((m) => [
			m.key,
			periodFace({
				circleId: m.circle.id,
				window: memberWindow(m, m.circle),
				today,
				faces: byPerson.get(m.contactId) ?? [],
				avatarPhotoId: m.avatarPhotoId
			})
		])
	);
}

/** What the *Then · Now* toggle of a page needs: the faces, and whether and how it shows. */
export interface ThenView {
	/** Each member's face then, by key. */
	faces: Record<string, PeriodFace>;
	/** Whether *Then* shows anyone differently; the toggle is hidden otherwise. */
	shown: boolean;
	/** Whether the page opens on *Then* until the reader chooses: a circle that has ended. */
	startsOnThen: boolean;
}

/** The faces of a page's members, and its toggle, for the circle `circle` (docs/dev/02 §2.4.2). */
export async function readThenView(
	deps: PeriodFaceDeps,
	viewer: Viewer,
	circle: { endDate: string | null },
	members: readonly PeriodFaceMember[]
): Promise<ThenView> {
	const faces = await readPeriodFaces(deps, viewer, members);
	return {
		faces,
		shown: thenChangesAnything(
			members.map((m) => ({ avatarPhotoId: m.avatarPhotoId, face: faces[m.key] }))
		),
		startsOnThen: circleIsPast(circle, todayFor(deps.clock))
	};
}
