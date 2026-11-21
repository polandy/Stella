import type { Viewer } from '../access/visibility';
import { prepareCirclePhotoUpload } from '../domain/circles/circle-photos';
import { joinCircleByName } from '../domain/circles/circles';
import type {
	CommandActor,
	CommandHandlers,
	CommandReceiptRepository
} from '../domain/commands/dispatch';
import {
	attachCirclePhoto,
	attachGalleryPhoto,
	attachMomentPhoto,
	type EntryOwnership
} from '../domain/commands/photos';
import { writeReferringToImmich } from '../domain/commands/immich-references';
import { addContactField } from '../domain/contact-fields/contact-fields';
import { addPerson } from '../domain/contacts/add-person';
import { onVisibleContact } from '../domain/contacts/require-visible';
import { addImportantDate } from '../domain/dates/important-dates';
import { setBirthEstimate } from '../domain/dates/birth-estimate';
import {
	addGift,
	answerIdeaWhen,
	editGift,
	markGiftGiven,
	removeGift
} from '../domain/gifts/gifts';
import { markGiftBought } from '../domain/gifts/bought';
import { assignGift } from '../domain/gifts/giver';
import {
	addToGiftGroup,
	detachFromGiftGroup,
	dissolveGiftGroup,
	editGiftGroup,
	markGiftGroupBought,
	removeOpenOfGiftGroup
} from '../domain/gifts/gift-group-follow-up';
import { addGiftGroup } from '../domain/gifts/gift-groups';
import { logInteractionChecked } from '../domain/interactions/log-checked';
import { writeJournalEntry } from '../domain/journal/write-entry';
import { withNamesakeContext } from '../domain/mentions/namesake-context';
import { captureMoment } from '../domain/moments/moments';
import { writeNote } from '../domain/notes/write-note';
import { addRelationshipChecked } from '../domain/relationships/add-checked';
import { addRelationshipsOrRefuse } from '../domain/relationships/add-many';
import { assignTagByName } from '../domain/tags/tags';
import { addTodo, editTodo, removeTodo, tickTodo, untickTodo } from '../domain/todos/todos';
import { addPlan, answerPlanWhen, editPlan, removePlan } from '../domain/plans/plans';
import { bookPlan, donePlan, reopenPlan, unbookPlan } from '../domain/plans/progress';
import { againPlan, linkPlanMoment } from '../domain/plans/afterwards';
import type { AppServices } from '../services/app-services';

/*
 * The command handler table (docs/dev/04 §4.11.2): which use-case applies each command, wired from
 * the grouped contexts once per process by the `offline` group (`services/offline.ts`). Adding
 * a command adds its handler here; the `CommandHandlers` type and `handlers.test.ts` catch one
 * left out.
 */

/** The contexts whose use-cases the handlers call. */
export type HandlerContexts = Pick<
	AppServices,
	| 'auth'
	| 'people'
	| 'relationships'
	| 'circles'
	| 'media'
	| 'story'
	| 'notes'
	| 'records'
	| 'gifts'
	| 'todos'
	| 'plans'
	| 'immich'
>;

/** The offline context's own repositories a photo reads to find what it follows. */
export interface HandlerRepositories {
	receipts: Pick<CommandReceiptRepository, 'find'>;
	entries: EntryOwnership;
}

function viewerOf(actor: CommandActor): Viewer {
	return { id: actor.userId, householdId: actor.householdId };
}

export function createCommandHandlers(
	{
		auth,
		people,
		relationships,
		circles,
		media,
		story,
		notes,
		records,
		gifts,
		todos,
		plans,
		immich
	}: HandlerContexts,
	{ receipts, entries }: HandlerRepositories
): CommandHandlers {
	const { contacts, directory, contactNames, contactDeps, namesakeContextDeps } = people;
	const { captureMomentDeps, interactionDeps, journalDeps } = story;
	const { contactFieldDeps, importantDateDeps, tagDeps } = records;
	const relationshipDeps = { ...relationships.relationshipDeps, contacts };
	const immichPhotoDeps = immich?.entryImmichPhotoDeps ?? null;
	return {
		// A moment carries its own visibility, so it is also the author's default for anyone
		// the moment creates inline — and what a photo sent after it inherits.
		'moment.capture': async (actor, payload) => {
			const captured = await writeReferringToImmich(
				immichPhotoDeps,
				viewerOf(actor),
				payload.immichTokens,
				() =>
					withNamesakeContext(namesakeContextDeps, viewerOf(actor), () =>
						captureMoment(
							captureMomentDeps,
							{
								userId: actor.userId,
								householdId: actor.householdId,
								locale: actor.locale,
								defaultVisibility: payload.visibility
							},
							payload
						)
					)
			);
			// A moment written for a done outing idea (§2.27.8) links to it on its person.
			if (payload.planId)
				await linkPlanMoment(plans.planDeps, actor, {
					contactId: captured.anchorContactId,
					planId: payload.planId,
					momentId: captured.entryId
				});
			return { ...captured, visibility: payload.visibility };
		},
		'tag.assign': onVisibleContact(contacts, async (actor, payload) => ({
			tagId: await assignTagByName(
				tagDeps,
				actor.householdId,
				payload.contactId,
				payload.name,
				payload.color
			)
		})),
		'circle.join': onVisibleContact(contacts, async (actor, payload) => ({
			circleId: await joinCircleByName(
				circles.circleDeps,
				{ ...actor, defaultVisibility: 'shared' },
				payload.contactId,
				payload.circleName,
				payload.role
			)
		})),
		'contact.add': (actor, payload) =>
			addPerson({ ...contactDeps, accounts: auth.accounts }, actor, payload),
		'relationship.add': (actor, payload) =>
			addRelationshipChecked(relationshipDeps, actor, payload),
		'relationship.addMany': (actor, payload) =>
			addRelationshipsOrRefuse(relationshipDeps, actor, payload),
		'interaction.log': (actor, payload) =>
			logInteractionChecked({ ...interactionDeps, contacts, contactNames }, actor, payload),
		// A gift (docs/dev/02 §2.25): noted on a phone or online alike; the rest wait for Stella.
		'gift.add': (actor, payload) => addGift(gifts.giftDeps, actor, payload),
		'gift.edit': (actor, payload) => editGift(gifts.giftDeps, actor, payload),
		'gift.markGiven': (actor, payload) => markGiftGiven(gifts.giftDeps, actor, payload),
		'gift.markBought': (actor, payload) => markGiftBought(gifts.giftDeps, actor, payload),
		'gift.assign': (actor, payload) => assignGift(gifts.giftDeps, actor, payload),
		'gift.answerWhen': (actor, payload) => answerIdeaWhen(gifts.giftDeps, actor, payload),
		'gift.remove': (actor, payload) => removeGift(gifts.giftDeps, actor, payload),
		'giftGroup.add': (actor, payload) => addGiftGroup(gifts.giftGroupDeps, actor, payload),
		'giftGroup.addRecipients': (actor, payload) =>
			addToGiftGroup(gifts.giftGroupDeps, actor, payload),
		'giftGroup.edit': (actor, payload) => editGiftGroup(gifts.giftGroupDeps, actor, payload),
		'giftGroup.markBought': (actor, payload) =>
			markGiftGroupBought(gifts.giftGroupDeps, actor, payload),
		'giftGroup.dissolve': (actor, payload) =>
			dissolveGiftGroup(gifts.giftGroupDeps, actor, payload),
		'giftGroup.detach': (actor, payload) =>
			detachFromGiftGroup(gifts.giftGroupDeps, actor, payload),
		'giftGroup.removeOpen': (actor, payload) =>
			removeOpenOfGiftGroup(gifts.giftGroupDeps, actor, payload),
		// A to-do (docs/dev/02 §2.26): noted and ticked on a phone or online; the rest wait for Stella.
		'todo.add': (actor, payload) => addTodo(todos.todoDeps, actor, payload),
		'todo.tick': (actor, payload) => tickTodo(todos.todoDeps, actor, payload),
		'todo.edit': (actor, payload) => editTodo(todos.todoDeps, actor, payload),
		'todo.untick': (actor, payload) => untickTodo(todos.todoDeps, actor, payload),
		'todo.remove': (actor, payload) => removeTodo(todos.todoDeps, actor, payload),
		'plan.add': (actor, payload) => addPlan(plans.planDeps, actor, payload),
		'plan.book': (actor, payload) => bookPlan(plans.planDeps, actor, payload),
		'plan.done': (actor, payload) => donePlan(plans.planDeps, actor, payload),
		'plan.edit': (actor, payload) => editPlan(plans.planDeps, actor, payload),
		'plan.unbook': (actor, payload) => unbookPlan(plans.planDeps, actor, payload),
		'plan.reopen': (actor, payload) => reopenPlan(plans.planDeps, actor, payload),
		'plan.answerWhen': (actor, payload) => answerPlanWhen(plans.planDeps, actor, payload),
		'plan.again': (actor, payload) => againPlan(plans.planDeps, actor, payload),
		'plan.remove': (actor, payload) => removePlan(plans.planDeps, actor, payload),
		'note.add': (actor, payload) =>
			withNamesakeContext(namesakeContextDeps, viewerOf(actor), () =>
				writeNote({ ...notes.noteDeps, contacts, directory }, actor, payload)
			),
		'moment.photo': (actor, payload) =>
			attachMomentPhoto({ receipts, entries, photos: media.journalPhotoDeps }, actor, payload),
		'journal.write': (actor, payload) =>
			writeReferringToImmich(immichPhotoDeps, viewerOf(actor), payload.immichTokens, () =>
				withNamesakeContext(namesakeContextDeps, viewerOf(actor), () =>
					writeJournalEntry({ ...journalDeps, contacts, directory }, actor, payload)
				)
			),
		'field.add': onVisibleContact(contacts, async (_actor, payload) => ({
			fieldId: await addContactField(contactFieldDeps, payload)
		})),
		'date.add': onVisibleContact(contacts, async (_actor, payload) => ({
			dateId: await addImportantDate(importantDateDeps, payload)
		})),
		'contact.birthEstimate': async (actor, payload) => {
			await setBirthEstimate(importantDateDeps, viewerOf(actor), payload);
			return { contactId: payload.contactId };
		},
		// Checks the person once; the photos following it land where it says (`photos.ts`).
		'gallery.add': onVisibleContact(contacts, async (_actor, payload) => ({
			contactId: payload.contactId,
			visibility: payload.visibility
		})),
		'gallery.photo': (actor, payload) =>
			attachGalleryPhoto({ receipts, contacts, photos: media.galleryUploadDeps }, actor, payload),
		// Checks the circle and the role once; the photos following it land where it says.
		'circleGallery.add': (actor, payload) =>
			prepareCirclePhotoUpload(circles.circlePhotoDeps, viewerOf(actor), payload),
		'circleGallery.photo': (actor, payload) =>
			attachCirclePhoto(
				{ receipts, circles: circles.circles, photos: circles.circlePhotoDeps },
				actor,
				payload
			)
	};
}
