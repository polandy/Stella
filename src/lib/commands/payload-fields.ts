import * as v from 'valibot';

/*
 * The fields every command payload is built from (docs/04 §4.11.2): ids, days, visibility and
 * text as a form writes it. Pure and client-safe.
 */

/** A ULID, the id format Stella uses everywhere (docs/03 §3.1), made on the device too. */
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
