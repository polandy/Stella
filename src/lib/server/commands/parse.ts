import * as v from 'valibot';
import type { Command, JsonCommand } from '../../commands/commands';
import { CONTACT_FIELD_KINDS } from '../../contact-fields/kinds';
import { IMPORTANT_DATE_KINDS } from '../../dates/kinds';
import { INTERACTION_KINDS } from '../../interactions/kinds';
import { GENDERS } from '../../people/gender';
import { CURRENT_RELATIONSHIP_STATUS, RELATIONSHIP_STATUSES } from '../../relationships/status';
import { TAG_COLORS } from '../domain/tags/tags';
import { isTakenAt } from '../../image/taken-at';

/*
 * Reading a command off the wire (docs/concepts/offline-capture.md §3). The edge's half of the
 * vocabulary: what the domain may assume about a command, checked once here for the Home form
 * and for `POST /api/commands` alike. Anything that is not exactly a known command is refused
 * whole; a queued item written by an older build is not guessed at.
 */

/** A ULID, the id format Stella uses everywhere (docs/03 §3.1), made on the device too. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** An ISO calendar day. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Text that may be left out, as null: blank reads as not given. */
const textOrNull = v.optional(
	v.pipe(
		v.nullable(v.string()),
		v.transform((s) => s?.trim() || null)
	),
	null
);

const MomentNewPerson = v.object({
	// Inside a mention token, so only the characters a token's id may use.
	key: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,64}$/)),
	firstName: v.pipe(v.string(), v.trim(), v.minLength(1)),
	lastName: textOrNull,
	description: textOrNull
});

const MomentCapture = v.object({
	body: v.pipe(v.string(), v.trim(), v.minLength(1)),
	entryDate: v.pipe(v.string(), v.regex(ISO_DAY)),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared'),
	newPeople: v.optional(
		v.array(v.union([v.pipe(v.string(), v.trim(), v.minLength(1)), MomentNewPerson])),
		[]
	)
});

const NoteAdd = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	body: v.pipe(v.string(), v.trim(), v.minLength(1)),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared'),
	isPinned: v.optional(v.boolean(), false)
});

const InteractionLog = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	kind: v.picklist(INTERACTION_KINDS),
	happenedAt: v.pipe(v.string(), v.regex(ISO_DAY)),
	title: v.optional(v.nullable(v.pipe(v.string(), v.trim())), null),
	description: v.optional(v.nullable(v.pipe(v.string(), v.trim())), null),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared'),
	participantIds: v.optional(v.array(v.pipe(v.string(), v.minLength(1))), [])
});

const TagAssign = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	color: v.optional(v.nullable(v.picklist(TAG_COLORS)), null)
});

const CircleJoin = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	circleName: v.pipe(v.string(), v.trim(), v.minLength(1)),
	role: v.optional(
		v.nullable(
			v.pipe(
				v.string(),
				v.trim(),
				v.transform((role) => role || null)
			)
		),
		null
	)
});

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

const RelationshipAdd = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	targetId: v.pipe(v.string(), v.minLength(1)),
	typeChoice: v.pipe(v.string(), v.minLength(1)),
	description: optionalText,
	sinceDate: optionalText,
	status: optionalText
});

// The shared fields once, then each picked person with the since day worked out for that pair.
const RelationshipAddMany = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	typeChoice: v.pipe(v.string(), v.minLength(1)),
	// A link that exists is current until someone ends it, so "not said" reads as current.
	status: v.optional(
		v.pipe(
			v.nullable(v.picklist(RELATIONSHIP_STATUSES)),
			v.transform((status) => status ?? CURRENT_RELATIONSHIP_STATUS)
		),
		CURRENT_RELATIONSHIP_STATUS
	),
	description: optionalText,
	links: v.pipe(
		v.array(v.object({ targetId: v.pipe(v.string(), v.minLength(1)), sinceDate: optionalText })),
		v.minLength(1)
	)
});

const ContactAdd = v.pipe(
	v.object({
		firstName: optionalText,
		lastName: optionalText,
		nickname: optionalText,
		description: optionalText,
		howWeMet: optionalText,
		metPlace: optionalText,
		birthDate: optionalText,
		// Left out by a build from before the field, which is the same as none chosen.
		gender: v.optional(v.nullable(v.picklist(GENDERS)), null),
		visibility: v.optional(v.picklist(['shared', 'private']), 'shared'),
		// "This is me" (docs/02 §2.1.3); absent from a build that predates it, which means no.
		isSelf: v.optional(v.boolean(), false)
	}),
	// A person needs something to be called by (docs/02 §2.2).
	v.check((p) => Boolean(p.firstName || p.lastName || p.nickname))
);

const JournalWrite = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	entryDate: v.pipe(v.string(), v.regex(ISO_DAY)),
	title: optionalText,
	body: v.pipe(v.string(), v.trim(), v.minLength(1)),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared')
});

const FieldAdd = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	kind: v.picklist(CONTACT_FIELD_KINDS),
	label: optionalText,
	value: v.pipe(v.string(), v.trim(), v.minLength(1))
});

// The day's shape and whether it exists are the use-case's to judge, with a reason to show.
const DateAdd = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	kind: v.picklist(IMPORTANT_DATE_KINDS),
	label: optionalText,
	date: v.pipe(v.string(), v.trim(), v.minLength(1)),
	recursYearly: v.optional(v.boolean(), true),
	remind: v.optional(v.boolean(), true)
});

const GalleryAdd = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared')
});

// A role is picked, not typed; whether the circle has it is the use-case's to judge.
const CircleGalleryAdd = v.object({
	circleId: v.pipe(v.string(), v.minLength(1)),
	role: v.optional(
		v.pipe(
			v.nullable(v.string()),
			v.transform((role) => (role === null || role.trim() === '' ? null : role.trim()))
		),
		null
	),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared')
});

const envelope = {
	id: v.pipe(v.string(), v.regex(ULID)),
	issuedAt: v.pipe(v.number(), v.integer(), v.minValue(0))
};

const CommandSchema = v.variant('type', [
	v.object({ ...envelope, type: v.literal('moment.capture'), payload: MomentCapture }),
	v.object({ ...envelope, type: v.literal('note.add'), payload: NoteAdd }),
	v.object({ ...envelope, type: v.literal('interaction.log'), payload: InteractionLog }),
	v.object({ ...envelope, type: v.literal('tag.assign'), payload: TagAssign }),
	v.object({ ...envelope, type: v.literal('circle.join'), payload: CircleJoin }),
	v.object({ ...envelope, type: v.literal('relationship.add'), payload: RelationshipAdd }),
	v.object({ ...envelope, type: v.literal('relationship.addMany'), payload: RelationshipAddMany }),
	v.object({ ...envelope, type: v.literal('contact.add'), payload: ContactAdd }),
	v.object({ ...envelope, type: v.literal('journal.write'), payload: JournalWrite }),
	v.object({ ...envelope, type: v.literal('field.add'), payload: FieldAdd }),
	v.object({ ...envelope, type: v.literal('date.add'), payload: DateAdd }),
	v.object({ ...envelope, type: v.literal('gallery.add'), payload: GalleryAdd }),
	v.object({ ...envelope, type: v.literal('circleGallery.add'), payload: CircleGalleryAdd })
]);

/** `raw` as a command, or null when it is not exactly one. */
export function parseCommand(raw: unknown): JsonCommand | null {
	const parsed = v.safeParse(CommandSchema, raw);
	return parsed.success ? parsed.output : null;
}

const PhotoSchema = v.object({
	...envelope,
	type: v.picklist(['moment.photo', 'gallery.photo', 'circleGallery.photo']),
	parentId: v.pipe(v.string(), v.regex(ULID)),
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

/**
 * A photo as a command, or null. Photos carry bytes, so they arrive as multipart form fields
 * rather than in a JSON batch; the route reads the fields and hands them over here.
 */
export function parsePhotoCommand(raw: {
	id: unknown;
	type: unknown;
	parentId: unknown;
	image: unknown;
	thumb: unknown;
	view?: unknown;
	takenAt?: unknown;
	width: unknown;
	height: unknown;
	issuedAt: unknown;
}): Command | null {
	const parsed = v.safeParse(PhotoSchema, raw);
	if (!parsed.success) return null;
	const { id, type, issuedAt, view, takenAt, ...rest } = parsed.output;
	const payload = { ...rest, ...(view ? { view } : {}), ...(takenAt ? { takenAt } : {}) };
	return { id, type, payload, issuedAt };
}
