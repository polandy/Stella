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
import { editNameParts } from '$lib/server/domain/contacts/name-parts';
import { getAvatarDeps, getContactDeps, getNameDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

const EditProfileSchema = v.object({
	description: v.optional(v.pipe(v.string(), v.trim()))
});

/**
 * The three name parts and *Shown as*; each may be emptied (docs/concepts/surnames.md §3.4) —
 * the use-case refuses only a name with nothing left in it.
 */
const NamePartsSchema = v.object({
	firstName: v.pipe(v.string(), v.trim()),
	lastName: v.pipe(v.string(), v.trim()),
	nickname: v.pipe(v.string(), v.trim()),
	displayName: v.pipe(v.string(), v.trim()),
	keepFormerName: v.boolean()
});

/** One of the three, or empty for taking the gender off the record (docs/02 §2.2). */
const GenderSchema = v.union([v.picklist(GENDERS), v.literal('')]);

/** The hero: name, description, face, and the gender on the profile card (docs/02 §2.2). */
export const profileActions = {
	/* The hero's description, edited in place; the name has its own editor (docs/02 §2.2). */
	editProfile: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(EditProfileSchema, { description: form.get('description') || undefined });
		if (!parsed.success) throw error(400, say(locals, 'errors.contact.notFound'));

		const saved = await editProfile(getContactDeps(), viewer, params.id, {
			description: parsed.output.description ?? null
		});
		if (!saved) throw error(404, say(locals, 'errors.contact.notFound'));

		throw redirect(303, `/contacts/${params.id}`);
	},

	/* The whole name — parts and *Shown as* — from the one editor behind the name (docs/02 §2.2). */
	editNameParts: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(NamePartsSchema, {
			firstName: form.get('firstName') ?? '',
			lastName: form.get('lastName') ?? '',
			nickname: form.get('nickname') ?? '',
			displayName: form.get('displayName') ?? '',
			keepFormerName: form.get('keepFormerName') === 'on'
		});
		if (!parsed.success) return fail(400, { namePartsError: say(locals, 'errors.contact.namePartsInvalid') });

		try {
			const saved = await editNameParts(getNameDeps(), viewer, params.id, parsed.output);
			if (!saved) throw error(404, say(locals, 'errors.contact.notFound'));
		} catch (err) {
			if (err instanceof EmptyContactNameError)
				return fail(400, { namePartsError: err.phrase(translator(locals)) });
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
