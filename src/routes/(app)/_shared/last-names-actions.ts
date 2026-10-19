import { error, fail, type RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import type { Locale } from '$lib/i18n/locales';
import type { Translate } from '$lib/i18n/translate';
import type { Viewer } from '$lib/server/access/visibility';
import { requireViewer } from '$lib/server/auth/guards';
import {
	EmptyLastNameError,
	LastNameChangedError,
	LastNameWouldOverwriteError,
	setLastNames,
	takeBackLastName,
	type LastNameDeps
} from '$lib/server/domain/contacts/last-names';
import { translator } from '$lib/server/i18n/say';
import { LAST_NAME_CHANGED_STATUS } from '$lib/surnames/chip-give';

/*
 * The one form action behind every path that gives several people a last name
 * (docs/02 §2.2.4): the *Last names* list, *Select* on People and on a
 * circle, and passing a name on. Each page spreads it into its own actions, so the rule — every
 * id visible or nothing written, no silent overwrite, one log line — lives in one place.
 */

const SetLastNamesSchema = v.object({
	lastName: v.pipe(v.string(), v.trim(), v.minLength(1)),
	contactIds: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
	/** Those of `contactIds` ticked by hand to replace the last name they already have. */
	replaceIds: v.array(v.string())
});

/** The slice of `locals.services.people` the action writes through. */
export interface LastNameServices {
	lastNameDeps: LastNameDeps;
}

/**
 * Apply one submitted form: the people's last names, or a form message saying why not. Takes
 * its deps and the request's translator as arguments, so the action below hands in
 * `locals.services.people` and a test hands in a fake (docs/08 §8.3).
 */
export async function setLastNamesFromForm(
	people: LastNameServices,
	viewer: Viewer,
	form: Pick<FormData, 'get' | 'getAll'>,
	locale: Locale,
	t: Translate
) {
	const parsed = v.safeParse(SetLastNamesSchema, {
		lastName: form.get('lastName') ?? '',
		contactIds: form.getAll('contactId'),
		replaceIds: form.getAll('replaceId')
	});
	if (!parsed.success) return fail(400, { lastNamesError: t('errors.contact.emptyLastName') });

	const { lastName, contactIds, replaceIds } = parsed.output;
	const replace = new Set(replaceIds);
	try {
		const written = await setLastNames(
			people.lastNameDeps,
			viewer,
			contactIds.map((contactId) => ({ contactId, lastName, replace: replace.has(contactId) })),
			locale
		);
		if (written === null) throw error(404, t('errors.contact.notFound'));
		return { lastNamesSet: written };
	} catch (err) {
		if (err instanceof EmptyLastNameError || err instanceof LastNameWouldOverwriteError)
			return fail(400, { lastNamesError: err.phrase(t) });
		throw err;
	}
}

export const lastNameActions = {
	setLastNames: async ({ request, locals }: RequestEvent) =>
		setLastNamesFromForm(
			locals.services.people,
			requireViewer(locals),
			await request.formData(),
			locals.locale,
			translator(locals)
		)
};

const TakeBackLastNameSchema = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	lastName: v.pipe(v.string(), v.trim(), v.minLength(1)),
	beforeDisplayName: v.pipe(v.string(), v.trim(), v.minLength(1)),
	/** Blank when the person had no first name before. */
	beforeFirstName: v.pipe(v.string(), v.trim())
});

/**
 * *Undo* on the profile chip's toast (docs/02 §2.2.4.6): the person's name as it was before the
 * chip gave a last name, or a `LAST_NAME_CHANGED_STATUS` form message when it was changed
 * meanwhile and nothing was written.
 */
export async function takeBackLastNameFromForm(
	people: LastNameServices,
	viewer: Viewer,
	form: Pick<FormData, 'get'>,
	locale: Locale,
	t: Translate
) {
	const parsed = v.safeParse(TakeBackLastNameSchema, {
		contactId: form.get('contactId') ?? '',
		lastName: form.get('lastName') ?? '',
		beforeDisplayName: form.get('beforeDisplayName') ?? '',
		beforeFirstName: form.get('beforeFirstName') ?? ''
	});
	if (!parsed.success) return fail(400, { lastNamesError: t('errors.contact.emptyLastName') });

	const { contactId, lastName, beforeDisplayName, beforeFirstName } = parsed.output;
	try {
		const found = await takeBackLastName(
			people.lastNameDeps,
			viewer,
			{
				contactId,
				lastName,
				before: { displayName: beforeDisplayName, firstName: beforeFirstName || null }
			},
			locale
		);
		if (!found) throw error(404, t('errors.contact.notFound'));
		return { lastNameTakenBack: true };
	} catch (err) {
		if (err instanceof LastNameChangedError)
			return fail(LAST_NAME_CHANGED_STATUS, { lastNamesError: err.phrase(t) });
		throw err;
	}
}

/** Only the person page offers the chip, so only it takes a chip's name back. */
export const lastNameTakeBackActions = {
	takeBackLastName: async ({ request, locals }: RequestEvent) =>
		takeBackLastNameFromForm(
			locals.services.people,
			requireViewer(locals),
			await request.formData(),
			locals.locale,
			translator(locals)
		)
};
