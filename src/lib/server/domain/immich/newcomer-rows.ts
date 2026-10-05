import { mostPhotosFirst, type ImmichNewcomer } from '../../../immich/newcomers';
import { similarPeople } from '../../../immich/similar-names';
import { immichPersonUrl } from '../../../immich/web-link';
import type { PersonContext } from '../../../people/context';
import type { Viewer } from '../../access/visibility';
import { contextOfPeople, type PersonContextReads } from '../contacts/person-context';
import type { ImmichPerson } from './gateway';
import { faceUrlFor, newcomerFaceUrl } from './glimpse';
import type { ImmichHolder } from './links';
import type { ImmichNameIgnore } from './name-ignores';
import type { ImmichMediaSigner } from './signed-media';

/*
 * The rows of *New from Immich* (docs/02 §2.24.7), built from what `findImmichMatches` already
 * read: Immich's people, the links, the ignores. Each face comes with the people in Stella of a
 * similar name — the comparison step *Assign…* opens — so the member decides, face beside face,
 * before anyone is added: two people of one name are real, and nothing is decided for them.
 */

/** Someone in Stella a new face might be, as the comparison step shows them. */
export interface SimilarPerson {
	contact: { id: string; displayName: string; avatarPhotoId: string | null };
	description: string | null;
	/** Their circle and relationships as the viewer may see them, or null when there are none. */
	context: PersonContext | null;
	/**
	 * The face they are linked to already, or null when they have none — linking them here would
	 * replace it, so the step asks first. `faceUrl` is null when Immich no longer lists that face.
	 */
	linkedFace: { name: string | null; faceUrl: string | null } | null;
}

/** One row of *New from Immich*. */
export interface NewcomerRow {
	personId: string;
	name: string;
	/** How many photos they are in, or null when the key may not count them. */
	photoCount: number | null;
	/** The face through the signed proxy, signed for the viewer's household (no contact holds it). */
	faceUrl: string;
	/** Their page in Immich's web app. */
	openUrl: string;
	similar: SimilarPerson[];
}

/** A face the household ignored, as the tab's *Ignored* section shows it. */
export interface IgnoredNewcomer {
	personId: string;
	/** The name in Immich, or null when Immich no longer lists the face as named and shown. */
	immichName: string | null;
	faceUrl: string;
	/** The member who ignored it; the route puts a name to it. */
	ignoredBy: string;
	ignoredAt: number;
}

interface SimilarCandidate {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	avatarPhotoId: string | null;
	description: string | null;
}

/** What `findImmichMatches` read, handed on. */
interface NewcomerReadings {
	newcomers: readonly ImmichNewcomer[];
	counts: ReadonlyMap<string, number | null>;
	contacts: readonly SimilarCandidate[];
	linkedContactIds: ReadonlySet<string>;
	holders: ReadonlyMap<string, ImmichHolder>;
	personById: ReadonlyMap<string, ImmichPerson>;
	nameIgnores: readonly ImmichNameIgnore[];
}

export async function newcomerRows(
	deps: { signer: ImmichMediaSigner; contextReads: PersonContextReads; publicUrl: string },
	viewer: Viewer,
	day: { selfContactId: string | null; today: string },
	read: NewcomerReadings
): Promise<{ newcomers: NewcomerRow[]; ignoredNewcomers: IgnoredNewcomer[] }> {
	const similarOf = new Map(read.newcomers.map((n) => [n.personId, similarPeople(n.name, read.contacts)]));
	const similarIds = [...new Set([...similarOf.values()].flat())];
	// Every similar person's circle and links, whatever was typed about them: the step shows
	// both, so only the id and name go in (`contextOfPeople` skips anyone described already).
	const contextById = await contextOfPeople({ contextReads: deps.contextReads }, viewer, {
		people: read.contacts.filter((c) => similarIds.includes(c.id)).map(({ id, displayName }) => ({ id, displayName })),
		selfContactId: day.selfContactId,
		today: day.today
	});
	const contactById = new Map(read.contacts.map((c) => [c.id, c]));
	const faceOfContact = new Map([...read.holders].map(([personId, holder]) => [holder.contactId, personId]));

	const similarPerson = async (id: string): Promise<SimilarPerson> => {
		const { displayName, avatarPhotoId, description } = contactById.get(id)!;
		const linkedPersonId = faceOfContact.get(id);
		const linkedPerson = linkedPersonId ? read.personById.get(linkedPersonId) : undefined;
		return {
			contact: { id, displayName, avatarPhotoId },
			description,
			context: contextById[id] ?? null,
			linkedFace: !read.linkedContactIds.has(id)
				? null
				: {
						name: linkedPerson && linkedPerson.name !== '' ? linkedPerson.name : null,
						faceUrl: linkedPersonId ? await faceUrlFor(deps.signer, id, linkedPersonId) : null
					}
		};
	};

	const newcomers = mostPhotosFirst(
		await Promise.all(
			read.newcomers.map(
				async ({ personId, name }): Promise<NewcomerRow> => ({
					personId,
					name,
					photoCount: read.counts.get(personId) ?? null,
					faceUrl: await newcomerFaceUrl(deps.signer, viewer.householdId, personId),
					openUrl: immichPersonUrl(deps.publicUrl, personId),
					similar: await Promise.all((similarOf.get(personId) ?? []).map(similarPerson))
				})
			)
		)
	);

	// Newest first; a face someone holds by now is nobody's to add, ignored or not.
	const ignoredNewcomers = await Promise.all(
		read.nameIgnores
			.filter((ignore) => !read.holders.has(ignore.immichPersonId))
			.toSorted((a, b) => b.ignoredAt - a.ignoredAt)
			.map(async ({ immichPersonId, ignoredBy, ignoredAt }): Promise<IgnoredNewcomer> => {
				const person = read.personById.get(immichPersonId);
				return {
					personId: immichPersonId,
					immichName: person && person.name !== '' ? person.name : null,
					faceUrl: await newcomerFaceUrl(deps.signer, viewer.householdId, immichPersonId),
					ignoredBy,
					ignoredAt
				};
			})
	);
	return { newcomers, ignoredNewcomers };
}
