import type { PartialDate } from '../../../dates/partial-date';
import type { Viewer } from '../../access/visibility';
import type { Gift, GiftRepository } from './gifts';

/*
 * An in-memory GiftRepository for the gift use-case tests. It keeps the adapter's rule — a private
 * gift reaches only its author, a surprise never the member whose own person it is for — so the
 * use-cases can be seen relying on it; the Drizzle adapter proves the rule itself.
 */

/** `ownPeople`: a person's id, to the member whose own person it is. */
export function fakeGifts(
	birthOf: () => PartialDate | null,
	ownPeople: Map<string, string> = new Map()
): GiftRepository & { rows: Map<string, Gift> } {
	const rows = new Map<string, Gift>();
	const visible = (viewer: Viewer, gift: Gift) =>
		(gift.visibility === 'shared' || gift.createdBy === viewer.id) &&
		!(
			gift.hiddenFromRecipient &&
			gift.createdBy !== viewer.id &&
			ownPeople.get(gift.contactId) === viewer.id
		);
	return {
		rows,
		async insert(gift) {
			rows.set(gift.id, { ...gift });
		},
		async findVisibleTo(viewer, contactId, giftId) {
			const gift = rows.get(giftId);
			return gift && gift.contactId === contactId && visible(viewer, gift) ? { ...gift } : null;
		},
		async update(gift) {
			rows.set(gift.id, { ...gift });
		},
		async remove(giftId) {
			rows.delete(giftId);
		},
		async listForContactVisibleTo(viewer, contactId) {
			return [...rows.values()].filter((g) => g.contactId === contactId && visible(viewer, g));
		},
		async listStoryPageForContactVisibleTo() {
			return [];
		},
		async listOpenIdeaWhensVisibleTo(viewer, contactIds) {
			return [...rows.values()]
				.filter((g) => g.state === 'idea' && contactIds.includes(g.contactId) && visible(viewer, g))
				.map((g) => ({
					contactId: g.contactId,
					when: g.when,
					whenCheckedOn: g.whenCheckedOn,
					createdAt: g.createdAt,
					birth: birthOf()
				}));
		},
		async listOpenIdeasVisibleTo(viewer) {
			return [...rows.values()]
				.filter((g) => g.state === 'idea' && visible(viewer, g))
				.map((g) => ({ ...g, contactName: g.contactId, avatarPhotoId: null, birth: birthOf() }));
		},
		async listBoughtVisibleTo(viewer, contactIds) {
			return [...rows.values()]
				.filter(
					(g) => g.state === 'bought' && contactIds.includes(g.contactId) && visible(viewer, g)
				)
				.map(({ id, contactId, title }) => ({ id, contactId, title }));
		},
		async memberWhoseOwnPerson(_householdId, contactId) {
			return ownPeople.get(contactId) ?? null;
		},
		async membersOwnPeople() {
			return [...ownPeople].map(([contactId, memberId]) => ({ memberId, contactId }));
		}
	};
}
