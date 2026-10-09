import * as v from 'valibot';

/*
 * The pick the circle page posts to add people or re-role them (docs/02 §2.4.2): the people
 * chosen, one `contactId` field each, and the role they are to take. A blank role is handed on
 * as it came; the use-cases read it as none.
 */

const PeopleAndRoleSchema = v.object({
	contactIds: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
	role: v.optional(v.pipe(v.string(), v.trim()))
});

export type PeopleAndRole = v.InferOutput<typeof PeopleAndRoleSchema>;

/** Who was chosen and under which role, or null when nobody was or the form does not read. */
export function readPeopleAndRole(form: FormData): PeopleAndRole | null {
	const parsed = v.safeParse(PeopleAndRoleSchema, {
		contactIds: form.getAll('contactId'),
		role: form.get('role') ?? undefined
	});
	return parsed.success ? parsed.output : null;
}
