import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { createContact, InvalidBirthDateError } from '$lib/server/domain/contacts/contacts';
import { getContactDeps } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * Quick-add: create a person from a minimal form (docs/02 §2.2). A name is required; the
 * display name is derived server-side. Visibility defaults to shared.
 */

const optional = v.optional(v.pipe(v.string(), v.trim()));

const QuickAddSchema = v.object({
	firstName: optional,
	lastName: optional,
	nickname: optional,
	description: optional,
	howWeMet: optional,
	metPlace: optional,
	birthDate: optional,
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared')
});

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const parsed = v.safeParse(QuickAddSchema, {
			firstName: form.get('firstName') || undefined,
			lastName: form.get('lastName') || undefined,
			nickname: form.get('nickname') || undefined,
			description: form.get('description') || undefined,
			howWeMet: form.get('howWeMet') || undefined,
			metPlace: form.get('metPlace') || undefined,
			birthDate: form.get('birthDate') || undefined,
			visibility: form.get('visibility') || undefined
		});
		if (!parsed.success) {
			return fail(400, { error: 'Please check the form and try again.' });
		}

		const creator = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			defaultVisibility: 'shared' as const // TODO: use the user's default (settings, §2.16)
		};

		let id: string;
		try {
			id = await createContact(getContactDeps(), creator, parsed.output);
		} catch (err) {
			return fail(400, {
				error:
					err instanceof InvalidBirthDateError
						? err.message
						: 'Please enter at least a name or nickname.'
			});
		}

		throw redirect(303, `/contacts/${id}`);
	}
};
