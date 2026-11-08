import { allowedForAudience, type MentionAudience } from '$lib/mentions/audience';

/*
 * Whom a moment is about beside its anchor, as the composer offers them (docs/02 §2.20.3,
 * ADR-131): the anchor's homes in one tap each, never preselected, and anyone else by
 * *＋ Person*. A shared moment is about household-visible people only, so a private housemate
 * is offered only in a private moment. Pure; `MomentComposer` renders it.
 */

/** Somebody the composer can offer, with what decides whether the audience may name them. */
export interface OfferPerson {
	id: string;
	displayName: string;
	firstName: string | null;
	visibility: MentionAudience;
}

/** A home as the server reads it for the viewer: whom they see living there. */
export interface HomeMembers {
	id: string;
	memberIds: readonly string[];
}

/** One home's offer: whom a tap adds, and the private people only a private moment takes. */
export interface HomeOffer<P extends OfferPerson> {
	homeId: string;
	take: P[];
	privateOnly: P[];
}

/** The anchor's homes, each with the housemates not yet in the moment; none left, no offer. */
export function homeOffers<P extends OfferPerson>(
	anchorId: string | null,
	subjectIds: readonly string[],
	visibility: MentionAudience,
	homes: readonly HomeMembers[],
	people: readonly P[]
): HomeOffer<P>[] {
	if (!anchorId) return [];
	const already = new Set([anchorId, ...subjectIds]);
	const byId = new Map(people.map((p) => [p.id, p]));
	return homes.flatMap((home) => {
		if (!home.memberIds.includes(anchorId)) return [];
		const left = home.memberIds.flatMap((id) => {
			const person = already.has(id) ? undefined : byId.get(id);
			return person ? [person] : [];
		});
		const take = allowedForAudience(left, visibility);
		if (take.length === 0) return [];
		const allowed = new Set(take.map((p) => p.id));
		return [{ homeId: home.id, take, privateOnly: left.filter((p) => !allowed.has(p.id)) }];
	});
}

/** The subjects with `ids` added, each once and never the anchor, in the order chosen. */
export function subjectsAdded(
	subjectIds: readonly string[],
	ids: readonly string[],
	anchorId: string | null
): string[] {
	return [...new Set([...subjectIds, ...ids])].filter((id) => id !== anchorId);
}

/** The chips a moment of this audience may not be about: a private person in a shared one. */
export function subjectsUnfit<P extends OfferPerson>(
	subjectIds: readonly string[],
	visibility: MentionAudience,
	people: readonly P[]
): P[] {
	const allowed = new Set(allowedForAudience(people, visibility).map((p) => p.id));
	return subjectIds.flatMap((id) => {
		const person = people.find((p) => p.id === id);
		return person && !allowed.has(id) ? [person] : [];
	});
}

/** How many journals the moment lands in: the anchor and every other subject, once each. */
export function journalCount(anchorId: string | null, subjectIds: readonly string[]): number {
	return new Set([...(anchorId ? [anchorId] : []), ...subjectIds]).size;
}
