import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { GENDERS } from '$lib/people/gender';
import { JOB_EDITOR_PLACES } from '$lib/people/job';
import {
	editProfile,
	EmptyContactNameError,
	InvalidGenderError,
	JobFieldTooLongError,
	setGender,
	setJob,
	getContact
} from '$lib/server/domain/contacts/contacts';
import { InvalidAvatarError, setContactAvatar } from '$lib/server/domain/media/avatars';
import { editNameParts } from '$lib/server/domain/contacts/name-parts';
import { getAvatarDeps, getContactDeps, getNameDeps } from '$lib/server/services';
import { takenAtField } from '$lib/server/http/taken-at-field';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

const EditProfileSchema = v.object({
	description: v.optional(v.pipe(v.string(), v.trim()))
});

/**
 * The three name parts and *Shown as*; each may be emptied (docs/concepts/surnames.md §3.4) —
 * the use-case refuses only a name with nothing left in it. The gender rides along: it is
 * edited with the name (docs/02 §2.2), one of the three or empty for none on record.
 */
const NamePartsSchema = v.object({
	firstName: v.pipe(v.string(), v.trim()),
	lastName: v.pipe(v.string(), v.trim()),
	nickname: v.pipe(v.string(), v.trim()),
	displayName: v.pipe(v.string(), v.trim()),
	formerName: v.pipe(v.string(), v.trim()),
	keepFormerName: v.boolean(),
	gender: v.optional(v.union([v.picklist(GENDERS), v.literal('')]))
});

/**
 * The job editor's two fields; either may be emptied. Trimming and the length are the
 * use-case's. `place` says which of the two editors posted, so only it reopens on a refusal.
 */
const JobSchema = v.object({
	place: v.picklist(JOB_EDITOR_PLACES),
	jobTitle: v.string(),
	company: v.string()
});

/** The hero: name and gender, description, face, and the job among the facts (docs/02 §2.2). */
export const profileActions = {
	/* The hero's description, edited in place; the name has its own editor (docs/02 §2.2). */
	editProfile: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(EditProfileSchema, {
			description: form.get('description') || undefined
		});
		if (!parsed.success) throw error(400, say(locals, 'errors.contact.notFound'));

		const saved = await editProfile(getContactDeps(), viewer, params.id, {
			description: parsed.output.description ?? null
		});
		if (!saved) throw error(404, say(locals, 'errors.contact.notFound'));

		throw redirect(303, `/contacts/${params.id}`);
	},

	/* The whole name — parts, *Shown as* and gender — from the one editor behind the name (docs/02 §2.2). */
	editNameParts: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(NamePartsSchema, {
			firstName: form.get('firstName') ?? '',
			lastName: form.get('lastName') ?? '',
			nickname: form.get('nickname') ?? '',
			displayName: form.get('displayName') ?? '',
			formerName: form.get('formerName') ?? '',
			keepFormerName: form.get('keepFormerName') === 'on',
			// Absent from a form older than the field: the gender is then left as it is.
			gender: form.get('gender') ?? undefined
		});
		if (!parsed.success)
			return fail(400, { namePartsError: say(locals, 'errors.contact.namePartsInvalid') });

		const { gender, ...nameParts } = parsed.output;
		try {
			const saved = await editNameParts(getNameDeps(), viewer, params.id, nameParts, locals.locale);
			if (!saved) throw error(404, say(locals, 'errors.contact.notFound'));
			// After the name, so a refused name leaves the gender as it was too.
			if (gender !== undefined)
				await setGender(getContactDeps(), viewer, params.id, gender || null);
		} catch (err) {
			if (err instanceof EmptyContactNameError || err instanceof InvalidGenderError)
				return fail(400, { namePartsError: err.phrase(translator(locals)) });
			throw err;
		}
		throw redirect(303, `/contacts/${params.id}`);
	},

	/* Job title and company from the profile's one job editor, saved together (docs/02 §2.2). */
	setJob: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(JobSchema, {
			place: form.get('place') ?? 'profile',
			jobTitle: form.get('jobTitle') ?? '',
			company: form.get('company') ?? ''
		});
		if (!parsed.success)
			return fail(400, {
				jobError: say(locals, 'errors.form.checkAndRetry'),
				jobErrorAt: 'profile' as const
			});
		const { place, jobTitle, company } = parsed.output;

		try {
			const saved = await setJob(getContactDeps(), viewer, params.id, { jobTitle, company });
			if (!saved) throw error(404, say(locals, 'errors.contact.notFound'));
		} catch (err) {
			if (err instanceof JobFieldTooLongError)
				return fail(400, { jobError: err.phrase(translator(locals)), jobErrorAt: place });
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
			height: Number(form.get('height')),
			takenAt: takenAtField(form)
		};

		try {
			await setContactAvatar(
				getAvatarDeps(),
				{ userId: locals.user.id, householdId: locals.user.householdId },
				params.id,
				upload
			);
		} catch (err) {
			if (err instanceof InvalidAvatarError)
				return fail(400, { avatarError: err.phrase(translator(locals)) });
			return fail(400, { avatarError: say(locals, 'errors.image.couldNotSave') });
		}

		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
