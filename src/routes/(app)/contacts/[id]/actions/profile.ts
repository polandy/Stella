import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { GENDERS } from '$lib/people/gender';
import {
	editProfile,
	EmptyContactNameError,
	InvalidGenderError,
	setGender,
	getContact
} from '$lib/server/domain/contacts/contacts';
import { InvalidAvatarError, setContactAvatar } from '$lib/server/domain/media/avatars';
import { getAvatarDeps, getContactDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

const EditProfileSchema = v.object({
	displayName: v.pipe(v.string(), v.trim(), v.minLength(1)),
	description: v.optional(v.pipe(v.string(), v.trim()))
});

/** One of the three, or empty for taking the gender off the record (docs/02 §2.2). */
const GenderSchema = v.union([v.picklist(GENDERS), v.literal('')]);

/** The hero: name, description, face, and the gender on the profile card (docs/02 §2.2). */
export const profileActions = {
	/* The hero's name and description, edited in place (docs/02 §2.2). */
	editProfile: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(EditProfileSchema, {
			displayName: form.get('displayName'),
			description: form.get('description') || undefined
		});
		if (!parsed.success) return fail(400, { profileError: say(locals, 'errors.contact.emptyName') });

		try {
			const saved = await editProfile(getContactDeps(), viewer, params.id, {
				displayName: parsed.output.displayName,
				description: parsed.output.description ?? null
			});
			if (!saved) throw error(404, say(locals, 'errors.contact.notFound'));
		} catch (err) {
			if (err instanceof EmptyContactNameError)
				return fail(400, { profileError: err.phrase(translator(locals)) });
			throw err;
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	/* A gender from the profile's chips; an empty value takes it off the record (docs/02 §2.2). */
	setGender: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const parsed = v.safeParse(GenderSchema, (await request.formData()).get('gender') ?? '');
		if (!parsed.success) return fail(400, { genderError: say(locals, 'errors.contact.invalidGender') });

		try {
			const saved = await setGender(getContactDeps(), viewer, params.id, parsed.output || null);
			if (!saved) throw error(404, say(locals, 'errors.contact.notFound'));
		} catch (err) {
			if (err instanceof InvalidGenderError) return fail(400, { genderError: err.phrase(translator(locals)) });
			throw err;
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	setAvatar: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const form = await request.formData();
		const image = form.get('image');
		const thumb = form.get('thumb');
		if (!(image instanceof File) || !(thumb instanceof File)) {
			return fail(400, { avatarError: say(locals, 'errors.image.chooseOne') });
		}

		const upload = {
			image: new Uint8Array(await image.arrayBuffer()),
			thumb: new Uint8Array(await thumb.arrayBuffer()),
			width: Number(form.get('width')),
			height: Number(form.get('height'))
		};

		try {
			await setContactAvatar(
				getAvatarDeps(),
				{ userId: locals.user.id, householdId: locals.user.householdId },
				params.id,
				upload
			);
		} catch (err) {
			if (err instanceof InvalidAvatarError) return fail(400, { avatarError: err.phrase(translator(locals)) });
			return fail(400, { avatarError: say(locals, 'errors.image.couldNotSave') });
		}

		throw redirect(303, `/contacts/${params.id}`);
	},
} satisfies Actions;
