import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';
import { fromFormData } from './form-data';

/*
 * A form's fields as the payload a command schema reads (docs/04 §4.11.2). The schema names
 * the keys and says what each one is; the form only posts strings, files and absent fields.
 * The rules, one per case below:
 * - only the schema's keys are read: a form-only field (`commandId`, `return`) never lands
 *   in the payload;
 * - a missing or empty field is left out, so the schema's default (or its refusal) decides;
 * - a repeated field is read whole only where the schema wants a list; elsewhere the first
 *   value counts, as `FormData.get` reads it;
 * - a boolean is a checkbox: posted means true, not posted means false;
 * - a number is read with `Number`, so what is not one fails the schema rather than passing;
 * - a file is not a field value, and is left out.
 */

const Schema = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	body: v.pipe(v.string(), v.trim(), v.minLength(1)),
	label: v.optional(v.nullable(v.string()), null),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared'),
	isPinned: v.optional(v.boolean(), true),
	participantIds: v.optional(v.array(v.string()), []),
	count: v.optional(v.number())
});

function form(entries: [string, string | Blob][]): FormData {
	const data = new FormData();
	for (const [key, value] of entries) data.append(key, value);
	return data;
}

describe('fromFormData', () => {
	it('reads only the keys the schema names', () => {
		const read = fromFormData(
			Schema,
			form([
				['body', 'Hello'],
				['commandId', '01K6A5ZQ3V9W8X7Y6Z5A4B3C2D'],
				['return', '/contacts']
			])
		);
		expect(read).toEqual({ body: 'Hello', isPinned: false, participantIds: [] });
	});

	it('leaves a missing or empty field out, so the schema decides what it means', () => {
		const read = fromFormData(
			Schema,
			form([
				['label', ''],
				['visibility', '']
			])
		);
		expect(read).not.toHaveProperty('label');
		expect(read).not.toHaveProperty('visibility');
		expect(read).not.toHaveProperty('contactId');
		expect(v.parse(v.omit(Schema, ['contactId', 'body']), read)).toMatchObject({
			label: null,
			visibility: 'shared'
		});
	});

	it('keeps text as posted, for the schema to trim', () => {
		expect(fromFormData(Schema, form([['body', '  Hello  ']]))).toMatchObject({
			body: '  Hello  '
		});
	});

	it('reads every value of a list, and only the first of anything else', () => {
		const read = fromFormData(
			Schema,
			form([
				['participantIds', 'a'],
				['participantIds', 'b'],
				['body', 'first'],
				['body', 'second']
			])
		);
		expect(read).toMatchObject({ participantIds: ['a', 'b'], body: 'first' });
	});

	it('reads a boolean as a checkbox: posted is true, not posted is false', () => {
		expect(fromFormData(Schema, form([['isPinned', 'on']]))).toMatchObject({ isPinned: true });
		expect(fromFormData(Schema, form([['isPinned', '1']]))).toMatchObject({ isPinned: true });
		expect(fromFormData(Schema, form([]))).toMatchObject({ isPinned: false });
	});

	it('reads a number with Number, so what is not one fails the schema', () => {
		expect(fromFormData(Schema, form([['count', '3']]))).toMatchObject({ count: 3 });
		const read = fromFormData(Schema, form([['count', 'three']]));
		expect(read.count).toBeNaN();
		expect(v.safeParse(v.partial(Schema), read).success).toBe(false);
	});

	it('leaves a file out, whether one value or one of a list', () => {
		const file = new File(['x'], 'x.txt');
		const read = fromFormData(
			Schema,
			form([
				['body', file],
				['participantIds', file],
				['participantIds', 'a']
			])
		);
		expect(read).not.toHaveProperty('body');
		expect(read).toMatchObject({ participantIds: ['a'] });
	});

	it('reads through a check on the object as a whole', () => {
		const Named = v.pipe(
			v.object({ firstName: v.optional(v.string()) }),
			v.check((p) => Boolean(p.firstName))
		);
		expect(fromFormData(Named, form([['firstName', 'Ada']]))).toEqual({ firstName: 'Ada' });
	});
});
