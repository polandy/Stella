import * as v from 'valibot';
import { isTakenAt } from '../media/taken-at';
import { INTERACTION_KINDS } from '../story/interaction-kinds';
import type { CommandType } from './commands';
import {
	GiftAddSchema,
	GiftEditSchema,
	GiftMarkGivenSchema,
	GiftRemoveSchema,
	TodoAddSchema,
	TodoEditSchema,
	TodoRefSchema
} from './gift-todo-payloads';
import {
	CommandIdSchema,
	ISO_DAY,
	nonEmpty,
	optionalText,
	requiredText,
	visibility
} from './payload-fields';
import {
	CircleJoinSchema,
	ContactAddSchema,
	DateAddSchema,
	FieldAddSchema,
	RelationshipAddManySchema,
	RelationshipAddSchema,
	TagAssignSchema
} from './person-payloads';

/*
 * What each command carries (docs/04 §4.11.2), as the one Valibot schema it is read with —
 * by `POST /api/commands` for a phone's outbox and by the form action that builds the same
 * command. The payload types in `commands.ts` are what these schemas read, so a field is
 * added in one place. Pure and client-safe; the browser imports only the types. The gift and
 * to-do schemas are in `gift-todo-payloads.ts`, a person's own in `person-payloads.ts`; this
 * file holds the moment's, the journal's and the gallery's, and the table of them all.
 */

/** A person named for the first time in a moment, with what tells them apart (docs/02 §2.2.3). */
export const MomentNewPersonSchema = v.object({
	/**
	 * Made on the device; the mention's placeholder id is `newPersonMentionId(key)`. Inside a
	 * mention token, so only the characters a token's id may use.
	 */
	key: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,64}$/)),
	firstName: requiredText,
	lastName: optionalText,
	description: optionalText
});

/** A moment as the composer hands it over (docs/02 §2.22.1). */
export const MomentCaptureSchema = v.object({
	/** Markdown body with typed `@Handle`s and/or canonical mention tokens. */
	body: requiredText,
	/** ISO `YYYY-MM-DD` day the moment is about — the writer's day, not the arrival's. */
	entryDate: v.pipe(v.string(), v.regex(ISO_DAY)),
	visibility,
	/**
	 * People the composer created with the moment. A person is mentioned in the body by the
	 * placeholder `@{contact:new:<key>}` until Stella has them; a bare display name is what an
	 * older build queued, found in the body by its `@Handle`.
	 */
	newPeople: v.optional(v.array(v.union([requiredText, MomentNewPersonSchema])), []),
	/**
	 * The person whose page the moment was written on (docs/02 §2.20): it lands in their journal
	 * without an `@`. Absent, the first person mentioned is the anchor; a phone that queued the
	 * moment before the field existed sends none.
	 */
	anchorId: v.optional(nonEmpty),
	/**
	 * Further people it is about, beside the anchor (docs/02 §2.20.3): the composer's chips. A
	 * phone that queued the moment before the field existed sends none, a moment about one.
	 */
	subjectIds: v.optional(v.array(nonEmpty))
});

/** A note on a person (docs/02 §2.5), as the person page's note form hands it over. */
export const NoteAddSchema = v.object({
	contactId: nonEmpty,
	/** Markdown with typed `@Handle`s and/or canonical mention tokens. */
	body: requiredText,
	visibility,
	isPinned: v.optional(v.boolean(), false)
});

/** A call, visit or other touchpoint with a person (docs/02 §2.6). */
export const InteractionLogSchema = v.object({
	contactId: nonEmpty,
	kind: v.picklist(INTERACTION_KINDS),
	/** ISO `YYYY-MM-DD`. */
	happenedAt: v.pipe(v.string(), v.regex(ISO_DAY)),
	title: v.optional(v.nullable(v.pipe(v.string(), v.trim())), null),
	description: v.optional(v.nullable(v.pipe(v.string(), v.trim())), null),
	visibility,
	participantIds: v.optional(v.array(nonEmpty), [])
});

/** An entry written on a person's journal page (docs/02 §2.20); its photos follow it. */
export const JournalWriteSchema = v.object({
	contactId: nonEmpty,
	/** ISO `YYYY-MM-DD` day the entry is about. */
	entryDate: v.pipe(v.string(), v.regex(ISO_DAY)),
	title: optionalText,
	/** Markdown with typed `@Handle`s and/or canonical mention tokens. */
	body: requiredText,
	visibility
});

/**
 * Photos going into a person's gallery (docs/02 §2.14). Carries no bytes itself: it checks
 * the person once, and each photo follows as a `gallery.photo` naming it.
 */
export const GalleryAddSchema = v.object({
	contactId: nonEmpty,
	visibility
});

/**
 * Photos going into a circle's gallery (docs/02 §2.4.2). Like a person's gallery upload it
 * carries no bytes: it checks the circle and the role once, and each photo follows as a
 * `circleGallery.photo` naming it. A role is picked, not typed; whether the circle has it is
 * the use-case's to judge.
 */
export const CircleGalleryAddSchema = v.object({
	circleId: nonEmpty,
	/** One of the circle's roles, or null for the circle as a whole. */
	role: optionalText,
	visibility
});

/**
 * A photo as it arrives, beside the command it follows (`parentId`). Photos carry bytes, so
 * they come as multipart fields rather than in a JSON batch, and the wire's nulls are dropped
 * on the way to the `PhotoPayload` the domain sees.
 */
export const PhotoWireSchema = v.object({
	parentId: CommandIdSchema,
	image: v.instance(Uint8Array),
	thumb: v.instance(Uint8Array),
	// A large circle photo's 1600 px view (docs/02 §2.4.2); every other photo is its own view.
	view: v.nullish(v.instance(Uint8Array)),
	width: v.pipe(v.number(), v.integer(), v.minValue(1)),
	height: v.pipe(v.number(), v.integer(), v.minValue(1)),
	// When the picture was taken, read from its EXIF on the phone (docs/02 §2.14). Most photos
	// carry none, which is normal; one that is sent and does not read is refused. Whether it
	// could be real is the use-case's to judge, against its clock.
	takenAt: v.nullish(v.pipe(v.string(), v.check(isTakenAt)))
});

/** Every command's payload schema, by command. */
export const COMMAND_PAYLOAD_SCHEMAS = {
	'moment.capture': MomentCaptureSchema,
	'moment.photo': PhotoWireSchema,
	'note.add': NoteAddSchema,
	'interaction.log': InteractionLogSchema,
	'gift.add': GiftAddSchema,
	'gift.edit': GiftEditSchema,
	'gift.markGiven': GiftMarkGivenSchema,
	'gift.remove': GiftRemoveSchema,
	'todo.add': TodoAddSchema,
	'todo.tick': TodoRefSchema,
	'todo.edit': TodoEditSchema,
	'todo.untick': TodoRefSchema,
	'todo.remove': TodoRefSchema,
	'tag.assign': TagAssignSchema,
	'circle.join': CircleJoinSchema,
	'relationship.add': RelationshipAddSchema,
	'relationship.addMany': RelationshipAddManySchema,
	'contact.add': ContactAddSchema,
	'journal.write': JournalWriteSchema,
	'field.add': FieldAddSchema,
	'date.add': DateAddSchema,
	'gallery.add': GalleryAddSchema,
	'gallery.photo': PhotoWireSchema,
	'circleGallery.add': CircleGalleryAddSchema,
	'circleGallery.photo': PhotoWireSchema
} as const satisfies Record<CommandType, v.GenericSchema>;
