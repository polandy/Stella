import { listContactFields } from '#lib/server/domain/contact-fields/contact-fields.js';
import {
	listCirclesForContact,
	listRoleSuggestionsByCircleName
} from '#lib/server/domain/circles/memberships.js';
import { listHomesOf } from '#lib/server/domain/homes/homes.js';
import { readSurnameHelp } from '#lib/server/domain/contacts/last-names.js';
import { textOf } from '#lib/i18n/linked.js';
import type { SurnameOption, SurnameProposal } from '#lib/suggestions/rules/surnames.js';
import type { Translate } from '#lib/i18n/translate.js';
import { listImportantDates } from '#lib/server/domain/dates/important-dates.js';
import { lastContactedOn } from '#lib/server/domain/interactions/interactions.js';
import { authorNames } from '#lib/server/domain/household/members.js';
import { listStoryPage } from '#lib/server/domain/story/story.js';
import { listGroupPhotosOf, listGroupPhotosToCut } from '#lib/server/domain/media/cuts.js';
import { listGallery } from '#lib/server/domain/media/gallery.js';
import { listMentionedIn } from '#lib/server/domain/mentions/mentioned-in.js';
import { listNotesForContact } from '#lib/server/domain/notes/notes.js';
import { listGiftsForContact } from '#lib/server/domain/gifts/gifts.js';
import { listPlansForContact } from '#lib/server/domain/plans/plans.js';
import { readGiftGroupsOf } from '#lib/server/domain/gifts/gift-group-follow-up.js';
import { mayKeepFrom } from '#lib/server/domain/shared/idea-on-person.js';
import { membersOwnPeopleOf } from '#lib/server/domain/gifts/giver.js';
import { listOpenTodosForContact } from '#lib/server/domain/todos/todos.js';
import { readFamilyOf } from '#lib/server/domain/relationships/family.js';
import { listTagsForContact } from '#lib/server/domain/tags/tag-lists.js';
import type { Viewer } from '#lib/server/access/visibility.js';
import type { AppServices } from '#lib/server/services/app-services.js';
import { allOf } from './all-of';
import { STORY_PAGE_SIZE } from './story-view';

/**
 * Everything the person page reads, at once and each under its own name. Every read goes
 * through a use-case scoped to the viewer; nothing here decides what anyone may see.
 */
export function readPersonPage(
	{
		people,
		relationships,
		circles,
		media,
		story,
		notes,
		records,
		household,
		gifts,
		plans,
		todos
	}: Pick<
		AppServices,
		| 'people'
		| 'relationships'
		| 'circles'
		| 'media'
		| 'story'
		| 'notes'
		| 'records'
		| 'household'
		| 'gifts'
		| 'plans'
		| 'todos'
	>,
	viewer: Viewer,
	contactId: string,
	request: { reviewOpen: boolean; proposeFor: { a: string; b: string }[] }
) {
	return allOf({
		// The person's own records.
		dates: listImportantDates(records.importantDateDeps, viewer, contactId),
		fields: listContactFields(records.contactFieldDeps, viewer, contactId),
		homes: listHomesOf(records.homeListDeps, viewer, contactId),
		tags: listTagsForContact(records.tagListDeps, viewer, contactId),
		contactCircles: listCirclesForContact(circles.circleMembershipDeps, viewer, contactId),
		storyPage: listStoryPage(story.storyDeps, viewer, contactId, { limit: STORY_PAGE_SIZE }),
		lastContactedAt: lastContactedOn(story.interactionDeps, viewer, contactId),
		notes: listNotesForContact(notes.noteDeps, viewer, contactId),
		gifts: listGiftsForContact(gifts.giftDeps, viewer, contactId),
		// The ideas they share with others, each with all of it the viewer sees (§2.25.11).
		giftGroups: readGiftGroupsOf(gifts.giftGroupDeps, viewer, contactId),
		// Whether a gift may be kept from them, they being another member (§2.25.10).
		recipientIsMember: mayKeepFrom(gifts.giftDeps.ownPeople, viewer, contactId),
		// The members' own people, whom *Wer schenkt?* suggests with their children (§2.25.12).
		memberPeople: membersOwnPeopleOf(gifts.giftDeps, {
			userId: viewer.id,
			householdId: viewer.householdId
		}),
		// Outing ideas, open and done (§2.27); kept from them the way a gift is.
		plans: listPlansForContact(plans.planDeps, viewer, contactId),
		todos: listOpenTodosForContact(todos.todoDeps, viewer, contactId),
		mentionedIn: listMentionedIn(notes.mentionedInDeps, viewer, contactId),
		gallery: listGallery(media.galleryDeps, viewer, contactId),
		groupPhotos: listGroupPhotosOf(circles.cutDeps, viewer, contactId),
		groupPhotosToCut: listGroupPhotosToCut(circles.cutDeps, viewer, contactId),

		/*
		 * Their place in the family: their links, derived kin, proposals, the review, what the
		 * picker greys out and the map, all from one read of the visible graph. The map is cut
		 * from the same access-scoped snapshot the explorer route reads, and for the same reason:
		 * derived kinship is worked out over the whole visible graph, so an inference cut from a
		 * slice could name the wrong relative. Only the person's own slice is sent to the browser.
		 */
		family: readFamilyOf(relationships.familyReadDeps, viewer, contactId, request),
		surnameHelp: readSurnameHelp(people.surnameReviewDeps, viewer, contactId),

		// What the forms offer, and who wrote what.
		nameOfAuthor: authorNames(household.memberDeps, viewer.householdId),
		relationshipTypes: relationships.relationshipTypes.listTypes(viewer),
		circleRolesByName: listRoleSuggestionsByCircleName(circles.circleMembershipDeps, viewer)
	});
}

/** The proposal as the hero's chips: one name, or each of several equally sure ones (§3.4). */
export function lastNameChips(
	proposal: SurnameProposal,
	t: Translate
): { name: string; why: string }[] {
	const chip = (option: SurnameOption) => ({
		name: option.name,
		why: option.reasons.map((reason) => textOf(reason(t))).join(' · ')
	});
	if (proposal.kind === 'one') return [chip(proposal)];
	if (proposal.kind === 'choose') return proposal.options.map(chip);
	return [];
}
