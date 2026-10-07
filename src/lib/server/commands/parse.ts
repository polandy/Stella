import * as v from 'valibot';
import {
	COMMAND_TYPES,
	isPhotoCommandType,
	PHOTO_COMMAND_TYPES,
	type Command,
	type JsonCommand
} from '../../commands/commands';
import { COMMAND_PAYLOAD_SCHEMAS, CommandIdSchema, PhotoWireSchema } from '../../commands/payloads';

/*
 * Reading a command off the wire (docs/04 §4.11.2). The edge's half of the
 * vocabulary: what the domain may assume about a command, checked once here for the form
 * actions and for `POST /api/commands` alike, with the payload schemas `lib/commands/payloads.ts`
 * owns. Anything that is not exactly a known command is refused whole; a queued item written
 * by an older build is not guessed at.
 */

const envelope = {
	id: CommandIdSchema,
	issuedAt: v.pipe(v.number(), v.integer(), v.minValue(0))
};

type JsonCommandType = JsonCommand['type'];

/** One command that travels as JSON: the envelope, its type, and the payload its schema reads. */
function jsonCommandSchema(type: JsonCommandType) {
	return v.object({
		...envelope,
		type: v.literal(type),
		payload: COMMAND_PAYLOAD_SCHEMAS[type]
	});
}

/*
 * Built from the payload map, so a new command is read as soon as its schema is there. The
 * output is the `JsonCommand` union by construction — each payload type is its schema's
 * output — which Valibot cannot see through a mapped list, hence the one cast in `readCommand`.
 */
const CommandSchema = v.variant(
	'type',
	COMMAND_TYPES.filter((type) => !isPhotoCommandType(type)).map((type) =>
		jsonCommandSchema(type as JsonCommandType)
	)
);

/** The command of type `T`. */
type JsonCommandOf<T extends JsonCommandType> = Extract<JsonCommand, { type: T }>;

/**
 * What became of reading a command: the command, or which part did not read — its envelope
 * (id, type, time), or its payload with the first field that failed (null when the payload
 * was refused as a whole, as a person with no name is). A form action answers by that part.
 */
export type CommandReading<C extends JsonCommand = JsonCommand> =
	| { ok: true; command: C }
	| { ok: false; part: 'envelope' }
	| { ok: false; part: 'payload'; field: string | null };

/** `raw` read as a command of its `type`, or which part of it did not read. */
export function readCommand<T extends JsonCommandType>(raw: {
	id: unknown;
	type: T;
	payload: unknown;
	issuedAt: unknown;
}): CommandReading<JsonCommandOf<T>> {
	const parsed = v.safeParse(CommandSchema, raw);
	if (parsed.success) return { ok: true, command: parsed.output as JsonCommandOf<T> };
	// The payload is what a member typed, so its problem is the one worth naming.
	const inPayload = parsed.issues.find((issue) => issue.path?.[0]?.key === 'payload');
	if (!inPayload) return { ok: false, part: 'envelope' };
	const field = inPayload.path?.[1]?.key;
	return { ok: false, part: 'payload', field: typeof field === 'string' ? field : null };
}

/** `raw` as a command, or null when it is not exactly one. */
export function parseCommand(raw: unknown): JsonCommand | null {
	const parsed = v.safeParse(CommandSchema, raw);
	return parsed.success ? (parsed.output as JsonCommand) : null;
}

const PhotoSchema = v.object({
	...envelope,
	type: v.picklist(PHOTO_COMMAND_TYPES),
	...PhotoWireSchema.entries
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
