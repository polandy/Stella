import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { createTranslator } from '$lib/i18n/translate';
import { parseCommand } from '$lib/server/commands/parse';
import { systemClock } from '$lib/server/clock';
import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { ulidGenerator } from '$lib/server/id';
import { getCommandDeps } from '$lib/server/services';
import { GENDERS } from '$lib/people/gender';
import { readNewPersonRequest } from '$lib/people/new-person';
import type { Actions, PageServerLoad } from './$types';

/*
 * Quick-add: create a person from a minimal form (docs/02 §2.2). A name is required; the
 * display name is derived server-side. Visibility defaults to shared. Saved as a `contact.add`
 * command, which is what lets the form keep a person on the phone out of reach (§2.18).
 *
 * `?name=` starts the form from a search that found nobody; `?self=1` is the member adding
 * themselves (§2.1.3, the first-run card), and the person saved is then recorded as them.
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
	gender: v.optional(v.picklist(GENDERS)),
	/** An existing person to link right after creating (docs/02 §2.2.1). */
	relateTo: optional,
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared'),
	isSelf: v.optional(v.literal('1'))
});

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	return readNewPersonRequest(url.searchParams);
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
			gender: form.get('gender') || undefined,
			relateTo: form.get('relateTo') || undefined,
			visibility: form.get('visibility') || undefined,
			isSelf: form.get('isSelf') || undefined
		});
		// The reader's language: everything this action can say back is a message key rendered
		// here, where the request's locale is known (docs/02 §2.19).
		const t = createTranslator(locals.locale);
		if (!parsed.success) {
			return fail(400, { error: t('errors.form.checkAndRetry') });
		}

		// A command (docs/04 §4.11.2), named by the form so one kept on the phone is recognised.
		const { relateTo, isSelf, ...input } = parsed.output;
		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'contact.add',
			payload: { ...input, isSelf: isSelf === '1' },
			issuedAt: systemClock.now()
		});
		if (command?.type !== 'contact.add') return fail(400, { error: t('errors.contact.needAName') });
		const author = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			locale: locals.locale
		};
		const outcome = await dispatchCommand(getCommandDeps(), author, command).catch(() => null);
		if (outcome?.status !== 'applied') {
			return fail(400, {
				error: outcome?.status === 'refused' ? outcome.reason(t) : t('errors.contact.needAName')
			});
		}
		const id = outcome.result.contactId;

		throw redirect(
			303,
			relateTo ? `/contacts/${id}?relate=${encodeURIComponent(relateTo)}` : `/contacts/${id}`
		);
	}
};
