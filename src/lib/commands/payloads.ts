import * as v from 'valibot';
import { CONTACT_FIELD_KINDS } from '../contact-fields/kinds';
import { IMPORTANT_DATE_KINDS } from '../dates/kinds';
import { isTakenAt } from '../image/taken-at';
import { INTERACTION_KINDS } from '../interactions/kinds';
import { GENDERS } from '../people/gender';
import { CURRENT_RELATIONSHIP_STATUS, RELATIONSHIP_STATUSES } from '../relationships/status';
import { TAG_COLORS } from '../tags/colors';
import type { CommandType } from './commands';

/*
 * What each command carries (docs/04 §4.11.2), as the one Valibot schema it is read with —
 * by `POST /api/commands` for a phone's outbox and by the form action that builds the same
 * command. The payload types in `commands.ts` are what these schemas read, so a field is
 * added in one place. Pure and client-safe; the browser imports only the types.
 */

/** A ULID, the id format Stella uses everywhere (docs/03 §3.1), made on the device too. */
export const CommandIdSchema = v.pipe(v.string(), v.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/));

/** An ISO calendar day. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Who may see what a command adds; shared unless the member said otherwise. */
const visibility = v.optional(v.picklist(['shared', 'private']), 'shared');

/** An id or a code the form wrote: anything but empty. */
const nonEmpty = v.pipe(v.string(), v.minLength(1));

/** Text that must say something: trimmed, and refused when nothing is left. */
const requiredText = v.pipe(v.string(), v.trim(), v.minLength(1));

/** An optional text field: trimmed, and empty meaning absent. */
const optionalText = v.optional(
	v.nullable(
		v.pipe(
			v.string(),
			v.trim(),
			v.transform((text) => text || null)
		)
	),
	null
);

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
	anchorId: v.optional(nonEmpty)
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

/** A tag put on a person by name; a name the household has not used yet makes a new tag. */
export const TagAssignSchema = v.object({
	contactId: nonEmpty,
	name: requiredText,
	color: v.optional(v.nullable(v.picklist(TAG_COLORS)), null)
});

/** A person put in a circle by name; a name nobody visible uses yet makes a new circle. */
export const CircleJoinSchema = v.object({
	contactId: nonEmpty,
	circleName: requiredText,
	role: optionalText
});

/** A link between the person whose page it was entered on and someone else (docs/02 §2.4). */
export const RelationshipAddSchema = v.object({
	contactId: nonEmpty,
	targetId: nonEmpty,
	/** Type *and* side, as the picker encodes them (`encodeRelationshipChoice`). */
	typeChoice: nonEmpty,
	description: optionalText,
	sinceDate: optionalText,
	status: optionalText
});

/**
 * One type of link between the person whose page it was entered on and several others at once
 * (docs/02 §2.4, ADR-118). The type, status and description are shared; each pair keeps its
 * own since day. Applied all or nothing: one person refused, and none of the links is stored.
 */
export const RelationshipAddManySchema = v.object({
	contactId: nonEmpty,
	/** Type *and* side, as the picker encodes them (`encodeRelationshipChoice`). */
	typeChoice: nonEmpty,
	// A link that exists is current until someone ends it, so "not said" reads as current.
	status: v.optional(
		v.pipe(
			v.nullable(v.picklist(RELATIONSHIP_STATUSES)),
			v.transform((status) => status ?? CURRENT_RELATIONSHIP_STATUS)
		),
		CURRENT_RELATIONSHIP_STATUS
	),
	/** Copied onto each link; editable on its own row afterwards. */
	description: optionalText,
	/** At least one; a since day the form worked out per pair, or null for none. */
	links: v.pipe(v.array(v.object({ targetId: nonEmpty, sinceDate: optionalText })), v.minLength(1))
});

/** A new person, as the *Add person* form hands them over (docs/02 §2.2). */
export const ContactAddSchema = v.pipe(
	v.object({
		firstName: optionalText,
		lastName: optionalText,
		nickname: optionalText,
		description: optionalText,
		howWeMet: optionalText,
		metPlace: optionalText,
		/** ISO `YYYY-MM-DD`, or `--MM-DD` when the year is not known. */
		birthDate: optionalText,
		// Left out by a build from before the field, which is the same as none chosen.
		gender: v.optional(v.nullable(v.picklist(GENDERS)), null),
		visibility,
		// "This is me" (docs/02 §2.1.3): Stella records this person as who the member is. Absent
		// from a build that predates it, which means no.
		isSelf: v.optional(v.boolean(), false)
	}),
	// A person needs something to be called by (docs/02 §2.2).
	v.check((p) => Boolean(p.firstName || p.lastName || p.nickname))
);

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

/** A phone number, address or other way to reach a person (docs/02 §2.3). */
export const FieldAddSchema = v.object({
	contactId: nonEmpty,
	kind: v.picklist(CONTACT_FIELD_KINDS),
	label: optionalText,
	value: requiredText
});

/**
 * An important date on a person (docs/02 §2.13). The day — ISO `YYYY-MM-DD`, or `--MM-DD`
 * when the year is not known — is the use-case's to judge, with a reason to show.
 */
export const DateAddSchema = v.object({
	contactId: nonEmpty,
	kind: v.picklist(IMPORTANT_DATE_KINDS),
	label: optionalText,
	date: requiredText,
	recursYearly: v.optional(v.boolean(), true),
	remind: v.optional(v.boolean(), true)
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
