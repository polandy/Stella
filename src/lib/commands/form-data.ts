import type * as v from 'valibot';

/*
 * A form's fields as the payload a command schema reads (docs/04 §4.11.2), so a form action
 * parses its command once, with the schema the outbox's commands are parsed with, instead of
 * declaring the same fields again. Not a parse: the result is still untrusted, and the schema
 * judges it. The rules are spelled out in the test beside this file.
 */

/** A schema that is a wrapper (`optional`, `nullable`, …) around another one. */
interface Wrapper {
	readonly wrapped: v.GenericSchema;
}

/** What a value is at heart: the schema inside every `optional` / `nullable` around it. */
function innerType(schema: v.GenericSchema): string {
	let inner: v.GenericSchema = schema;
	while ('wrapped' in inner) inner = (inner as Wrapper).wrapped;
	return inner.type;
}

/** The text a field posted, or undefined when it is missing, empty or a file. */
function textOf(value: FormDataEntryValue | null): string | undefined {
	return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The fields of `form` the object `schema` names, each read as the schema expects it: a list
 * whole, a boolean as a checkbox, a number with `Number`, anything else as its first text.
 * Fields the form left out or empty are left out, so the schema's own default applies.
 */
export function fromFormData(
	schema: { readonly entries: v.ObjectEntries },
	form: FormData
): Record<string, unknown> {
	const read: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(schema.entries)) {
		const type = innerType(entry);
		if (type === 'array') {
			read[key] = form.getAll(key).filter((value) => typeof value === 'string');
		} else if (type === 'boolean') {
			read[key] = form.has(key);
		} else {
			const text = textOf(form.get(key));
			if (text === undefined) continue;
			read[key] = type === 'number' ? Number(text) : text;
		}
	}
	return read;
}
