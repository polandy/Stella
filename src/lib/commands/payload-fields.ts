import * as v from 'valibot';
import { SENT_IMMICH_LIMIT } from '../immich/library-pick';

/*
 * The fields every command payload is built from (docs/dev/04 §4.11.2): ids, days, visibility and
 * text as a form writes it. Pure and client-safe.
 */

/** A ULID, the id format Stella uses everywhere (docs/dev/03 §3.1), made on the device too. */
export const CommandIdSchema = v.pipe(v.string(), v.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/));

/** An ISO calendar day. */
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Who may see what a command adds; shared unless the member said otherwise. */
export const visibility = v.optional(v.picklist(['shared', 'private']), 'shared');

/** An id or a code the form wrote: anything but empty. */
export const nonEmpty = v.pipe(v.string(), v.minLength(1));

/** Text that must say something: trimmed, and refused when nothing is left. */
export const requiredText = v.pipe(v.string(), v.trim(), v.minLength(1));

/** An optional text field: trimmed, and empty meaning absent. */
export const optionalText = v.optional(
	v.nullable(
		v.pipe(
			v.string(),
			v.trim(),
			v.transform((text) => text || null)
		)
	),
	null
);

/** Immich photos a new entry refers to, as the picker's signed tokens (docs/dev/04 ADR-132). */
export const immichTokens = v.optional(
	v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.maxLength(SENT_IMMICH_LIMIT))
);
