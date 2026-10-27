import * as v from 'valibot';
import type { CardAnswer } from '$lib/server/domain/import/contact-review';

/** The review step's answers by card key, as its form sends them. */
const AnswersSchema = v.record(
	v.string(),
	v.variant('kind', [
		v.object({
			kind: v.literal('same'),
			personId: v.pipe(v.string(), v.minLength(1)),
			takeCard: v.array(v.picklist(['firstName', 'lastName', 'birthday']))
		}),
		v.object({ kind: v.literal('new') }),
		v.object({ kind: v.literal('skip') })
	])
);

/** The answers in the form's `answers` field, or null when they are not well-formed. */
export function parseAnswers(raw: FormDataEntryValue | null): Map<string, CardAnswer> | null {
	if (typeof raw !== 'string') return null;
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return null;
	}
	if (Array.isArray(json)) return null;
	const parsed = v.safeParse(AnswersSchema, json);
	return parsed.success ? new Map(Object.entries(parsed.output)) : null;
}
