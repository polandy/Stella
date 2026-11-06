import { listContactFields } from '$lib/server/domain/contact-fields/contact-fields';
import {
	listCirclesForContact,
	listRoleSuggestionsByCircleName
} from '$lib/server/domain/circles/memberships';
import { listHomesOf } from '$lib/server/domain/homes/homes';
import { readSurnameHelp } from '$lib/server/domain/contacts/last-names';
import { textOf } from '$lib/i18n/linked';
import type { SurnameOption, SurnameProposal } from '$lib/suggestions/rules/surnames';
import type { Translate } from '$lib/i18n/translate';
import { listImportantDates } from '$lib/server/domain/dates/important-dates';
import { lastContactedOn } from '$lib/server/domain/interactions/interactions';
import { authorNames } from '$lib/server/domain/household/members';
import { listStoryPage } from '$lib/server/domain/story/story';
import { listGroupPhotosOf, listGroupPhotosToCut } from '$lib/server/domain/media/cuts';
import { listGallery } from '$lib/server/domain/media/gallery';
import { listMentionedIn } from '$lib/server/domain/mentions/mentioned-in';
import { listNotesForContact } from '$lib/server/domain/notes/notes';
import { listGiftsForContact } from '$lib/server/domain/gifts/gifts';
import { listOpenTodosForContact } from '$lib/server/domain/todos/todos';
import { readFamilyOf } from '$lib/server/domain/relationships/family';
import { listTagsForContact } from '$lib/server/domain/tags/tag-lists';
import type { Viewer } from '$lib/server/access/visibility';
import type { AppServices } from '$lib/server/services/app-services';
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
