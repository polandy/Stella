import * as v from 'valibot';
import type { Command } from '../../commands/commands';

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

const envelope = {
	id: v.pipe(v.string(), v.regex(ULID)),
	issuedAt: v.pipe(v.number(), v.integer(), v.minValue(0))
};

const CommandSchema = v.variant('type', [
	v.object({ ...envelope, type: v.literal('moment.capture'), payload: MomentCapture })
]);

/** `raw` as a command, or null when it is not exactly one. */
export function parseCommand(raw: unknown): Command | null {
	const parsed = v.safeParse(CommandSchema, raw);
	return parsed.success ? parsed.output : null;
}
