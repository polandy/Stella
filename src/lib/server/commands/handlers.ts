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
import { addContactField } from '../domain/contact-fields/contact-fields';
import { addPerson } from '../domain/contacts/add-person';
import { onVisibleContact } from '../domain/contacts/require-visible';
import { addImportantDate } from '../domain/dates/important-dates';
import { logInteractionChecked } from '../domain/interactions/log-checked';
import { writeJournalEntry } from '../domain/journal/write-entry';
import { withNamesakeContext } from '../domain/mentions/namesake-context';
import { captureMoment } from '../domain/moments/moments';
import { writeNote } from '../domain/notes/write-note';
import { addRelationshipChecked } from '../domain/relationships/add-checked';
import { addRelationshipsOrRefuse } from '../domain/relationships/add-many';
import { assignTagByName } from '../domain/tags/tags';
import type { AppServices } from '../services/app-services';

/*
 * The command handler table (docs/04 §4.11.2): which use-case applies each command, wired from
 * the grouped contexts once per process by the `offline` group (`services/offline.ts`). Adding
 * a command adds its handler here; the `CommandHandlers` type and `handlers.test.ts` catch one
 * left out.
 */

/** The contexts whose use-cases the handlers call. */
export type HandlerContexts = Pick<
	AppServices,
	'auth' | 'people' | 'relationships' | 'circles' | 'media' | 'story' | 'notes' | 'records'
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
	{ auth, people, relationships, circles, media, story, notes, records }: HandlerContexts,
	{ receipts, entries }: HandlerRepositories
): CommandHandlers {
	const { contacts, contactDeps, namesakeContextDeps } = people;
	const { captureMomentDeps, interactionDeps, journalDeps } = story;
	const { contactFieldDeps, importantDateDeps, tagDeps } = records;
	const relationshipDeps = { ...relationships.relationshipDeps, contacts };
	return {
		// A moment carries its own visibility, so it is also the author's default for anyone
		// the moment creates inline — and what a photo sent after it inherits.
		'moment.capture': async (actor, payload) => ({
			...(await withNamesakeContext(namesakeContextDeps, viewerOf(actor), () =>
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
			)),
			visibility: payload.visibility
		}),
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
			logInteractionChecked({ ...interactionDeps, contacts }, actor, payload),
		'note.add': (actor, payload) =>
			withNamesakeContext(namesakeContextDeps, viewerOf(actor), () =>
				writeNote({ ...notes.noteDeps, contacts }, actor, payload)
			),
		'moment.photo': (actor, payload) =>
			attachMomentPhoto({ receipts, entries, photos: media.journalPhotoDeps }, actor, payload),
		'journal.write': (actor, payload) =>
			withNamesakeContext(namesakeContextDeps, viewerOf(actor), () =>
				writeJournalEntry({ ...journalDeps, contacts }, actor, payload)
			),
		'field.add': onVisibleContact(contacts, async (_actor, payload) => ({
			fieldId: await addContactField(contactFieldDeps, payload)
		})),
		'date.add': onVisibleContact(contacts, async (_actor, payload) => ({
			dateId: await addImportantDate(importantDateDeps, payload)
		})),
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
