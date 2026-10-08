import { createServices, type AppServices } from './app-services';
import { APP_VERSION } from '../../version';
import { systemClock } from '../clock';
import { getConfig } from '../config';
import { getDb, getSqlite } from '../db';
import { withNamesakeContext } from '../domain/mentions/namesake-context';
import { prepareCirclePhotoUpload } from '../domain/circles/circle-photos';
import { captureMoment } from '../domain/moments/moments';
import type {
	CommandActor,
	CommandDeps,
	CommandReceiptRepository
} from '../domain/commands/dispatch';
import type { Viewer } from '../access/visibility';
import { createDrizzleCommandReceiptRepository } from '../db/command-receipt-repository';
import { createDrizzleEntryOwnership } from '../db/entry-ownership';
import {
	attachCirclePhoto,
	attachGalleryPhoto,
	attachMomentPhoto
} from '../domain/commands/photos';
import { writeJournalEntry } from '../domain/journal/write-entry';
import { addContactField } from '../domain/contact-fields/contact-fields';
import { addImportantDate } from '../domain/dates/important-dates';
import { writeNote } from '../domain/notes/write-note';
import { logInteractionChecked } from '../domain/interactions/log-checked';
import { onVisibleContact } from '../domain/contacts/require-visible';
import { addRelationshipChecked } from '../domain/relationships/add-checked';
import { addRelationshipsOrRefuse } from '../domain/relationships/add-many';
import { addPerson } from '../domain/contacts/add-person';
import { assignTagByName } from '../domain/tags/tags';
import { joinCircleByName } from '../domain/circles/circles';
import { ulidGenerator } from '../id';

/*
 * Composition root — the single place that wires concrete adapters (Drizzle repositories,
 * system clock, ULID generator, Bun password hashing) into the domain use-cases' `deps`
 * (docs/08 §8.3). Everything is lazy so importing this module has no side effects and the
 * build's route analysis never touches the Bun-only database (see db/index.ts).
 *
 * The object graph is moving into `AppServices` one bounded context at a time (AR-01): a
 * grouped context is built by `createServices` once per process and handed to every request
 * as `locals.services`; the `get*()` factories below wire the contexts not grouped yet.
 */

let services: AppServices | null = null;

/**
 * The process's one `AppServices`, built on the first request. Only `hooks.server.ts` calls
 * this; everything else reads `locals.services`, or — for a factory below that needs a grouped
 * repository — this same graph, so no repository exists twice.
 */
export function getServices(): AppServices {
	return (services ??= createServices({
		config: getConfig(),
		db: getDb(),
		sqlite: getSqlite(),
		clock: systemClock,
		ids: ulidGenerator,
		version: APP_VERSION
	}));
}

/** The people context, for the factories of contexts not grouped yet. */
function people(): AppServices['people'] {
	return getServices().people;
}

/** The media context, for the factories of contexts not grouped yet. */
function media(): AppServices['media'] {
	return getServices().media;
}

let commandReceiptRepository: CommandReceiptRepository | null = null;

function viewerOf(actor: CommandActor): Viewer {
	return { id: actor.userId, householdId: actor.householdId };
}

/** The dispatcher every change goes through (docs/04 §4.11.2). */
export function getCommandDeps(): CommandDeps {
	const { captureMomentDeps, interactionDeps, journalDeps } = getServices().story;
	const { noteDeps } = getServices().notes;
	const { contactFieldDeps, importantDateDeps, tagDeps } = getServices().records;
	const receipts = (commandReceiptRepository ??= createDrizzleCommandReceiptRepository(getDb()));
	return {
		receipts,
		clock: systemClock,
		handlers: {
			// A moment carries its own visibility, so it is also the author's default for anyone
			// the moment creates inline — and what a photo sent after it inherits.
			'moment.capture': async (actor, payload) => ({
				...(await withNamesakeContext(people().namesakeContextDeps, viewerOf(actor), () =>
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
			'tag.assign': onVisibleContact(people().contacts, async (actor, payload) => ({
				tagId: await assignTagByName(
					tagDeps,
					actor.householdId,
					payload.contactId,
					payload.name,
					payload.color
				)
			})),
			'circle.join': onVisibleContact(people().contacts, async (actor, payload) => ({
				circleId: await joinCircleByName(
					getServices().circles.circleDeps,
					{ ...actor, defaultVisibility: 'shared' },
					payload.contactId,
					payload.circleName,
					payload.role
				)
			})),
			'contact.add': (actor, payload) =>
				addPerson(
					{ ...people().contactDeps, accounts: getServices().auth.accounts },
					actor,
					payload
				),
			'relationship.add': (actor, payload) =>
				addRelationshipChecked(
					{ ...getServices().relationships.relationshipDeps, contacts: people().contacts },
					actor,
					payload
				),
			'relationship.addMany': (actor, payload) =>
				addRelationshipsOrRefuse(
					{ ...getServices().relationships.relationshipDeps, contacts: people().contacts },
					actor,
					payload
				),
			'interaction.log': (actor, payload) =>
				logInteractionChecked({ ...interactionDeps, contacts: people().contacts }, actor, payload),
			'note.add': (actor, payload) =>
				withNamesakeContext(people().namesakeContextDeps, viewerOf(actor), () =>
					writeNote({ ...noteDeps, contacts: people().contacts }, actor, payload)
				),
			'moment.photo': (actor, payload) =>
				attachMomentPhoto(
					{
						receipts,
						entries: createDrizzleEntryOwnership(getDb()),
						photos: media().journalPhotoDeps
					},
					actor,
					payload
				),
			'journal.write': (actor, payload) =>
				withNamesakeContext(people().namesakeContextDeps, viewerOf(actor), () =>
					writeJournalEntry({ ...journalDeps, contacts: people().contacts }, actor, payload)
				),
			'field.add': onVisibleContact(people().contacts, async (_actor, payload) => ({
				fieldId: await addContactField(contactFieldDeps, payload)
			})),
			'date.add': onVisibleContact(people().contacts, async (_actor, payload) => ({
				dateId: await addImportantDate(importantDateDeps, payload)
			})),
			// Checks the person once; the photos following it land where it says (`photos.ts`).
			'gallery.add': onVisibleContact(people().contacts, async (_actor, payload) => ({
				contactId: payload.contactId,
				visibility: payload.visibility
			})),
			'gallery.photo': (actor, payload) =>
				attachGalleryPhoto(
					{ receipts, contacts: people().contacts, photos: media().galleryUploadDeps },
					actor,
					payload
				),
			// Checks the circle and the role once; the photos following it land where it says.
			'circleGallery.add': (actor, payload) =>
				prepareCirclePhotoUpload(getServices().circles.circlePhotoDeps, viewerOf(actor), payload),
			'circleGallery.photo': (actor, payload) => {
				const { circles, circlePhotoDeps } = getServices().circles;
				return attachCirclePhoto({ receipts, circles, photos: circlePhotoDeps }, actor, payload);
			}
		}
	};
}
