import type { SelectablePerson } from '../people/select';

/*
 * The people a moment is about as a page draws them (docs/02 §2.20.3): names and faces, the
 * anchor first. Client-safe, so the timeline, the journal page and the editor read one shape.
 */

/** A subject the reader may see, with what draws them. */
export interface SubjectFace {
	id: string;
	displayName: string;
	avatarPhotoId: string | null;
}

/** The entry's subjects the reader may see, in the entry's order. */
export function subjectFacesOf(
	subjectIds: readonly string[],
	faceOf: (contactId: string) => SubjectFace | null
): SubjectFace[] {
	return subjectIds.flatMap((id) => {
		const face = faceOf(id);
		return face ? [face] : [];
	});
}

/** The others beside the person whose page it is — the *with …* line. */
export function othersThan(subjects: readonly SubjectFace[], contactId: string): SubjectFace[] {
	return subjects.filter((s) => s.id !== contactId);
}

/** A lookup over faces already read, by contact id. */
export function faceLookup(
	faces: readonly SubjectFace[]
): (contactId: string) => SubjectFace | null {
	const byId = new Map(faces.map((f) => [f.id, f]));
	return (contactId) => byId.get(contactId) ?? null;
}

/** Someone the editor may offer: the mention candidates' shape. */
export interface SubjectCandidate {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	visibility: 'shared' | 'private';
	description?: string | null;
	avatarPhotoId: string | null;
}

/**
 * Whom a moment's people field offers: its subjects, then the candidates the moment's audience
 * may see — for a shared moment only people the household sees (ADR-131).
 */
export function subjectPool(
	subjects: readonly SubjectFace[],
	candidates: readonly SubjectCandidate[],
	visibility: 'shared' | 'private'
): SelectablePerson[] {
	const onIt = new Set(subjects.map((s) => s.id));
	const offered = candidates.filter(
		(c) => !onIt.has(c.id) && (visibility === 'private' || c.visibility === 'shared')
	);
	return [...subjects.map((s) => ({ ...s, firstName: null, lastName: null })), ...offered].map(
		(p) => ({
			id: p.id,
			displayName: p.displayName,
			firstName: p.firstName,
			lastName: p.lastName,
			nickname: null,
			description: 'description' in p ? (p.description ?? null) : null,
			avatarPhotoId: p.avatarPhotoId
		})
	);
}
