import * as v from 'valibot';
import type { Command, JsonCommand } from '../../commands/commands';
import { INTERACTION_KINDS } from '../../interactions/kinds';

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

const MomentCapture = v.object({
	body: v.pipe(v.string(), v.trim(), v.minLength(1)),
	entryDate: v.pipe(v.string(), v.regex(ISO_DAY)),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared'),
	newPeople: v.optional(v.array(v.pipe(v.string(), v.trim(), v.minLength(1))), [])
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

const envelope = {
	id: v.pipe(v.string(), v.regex(ULID)),
	issuedAt: v.pipe(v.number(), v.integer(), v.minValue(0))
};

const CommandSchema = v.variant('type', [
	v.object({ ...envelope, type: v.literal('moment.capture'), payload: MomentCapture }),
	v.object({ ...envelope, type: v.literal('note.add'), payload: NoteAdd }),
	v.object({ ...envelope, type: v.literal('interaction.log'), payload: InteractionLog })
]);

/** `raw` as a command, or null when it is not exactly one. */
export function parseCommand(raw: unknown): JsonCommand | null {
	const parsed = v.safeParse(CommandSchema, raw);
	return parsed.success ? parsed.output : null;
}

const PhotoSchema = v.object({
	...envelope,
	momentId: v.pipe(v.string(), v.regex(ULID)),
	image: v.instance(Uint8Array),
	thumb: v.instance(Uint8Array),
	width: v.pipe(v.number(), v.integer(), v.minValue(1)),
	height: v.pipe(v.number(), v.integer(), v.minValue(1))
});

/**
 * A photo for a moment as a command, or null. Photos carry bytes, so they arrive as multipart
 * form fields rather than in a JSON batch; the route reads the fields and hands them over here.
 */
export function parsePhotoCommand(raw: {
	id: unknown;
	momentId: unknown;
	image: unknown;
	thumb: unknown;
	width: unknown;
	height: unknown;
	issuedAt: unknown;
}): Command | null {
	const parsed = v.safeParse(PhotoSchema, raw);
	if (!parsed.success) return null;
	const { id, issuedAt, ...payload } = parsed.output;
	return { id, type: 'moment.photo', payload, issuedAt };
}
