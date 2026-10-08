import { fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import { createTranslator } from '$lib/i18n/translate';
import { readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import { ContactAddSchema } from '$lib/commands/payloads';
import { systemClock } from '$lib/server/clock';
import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { ulidGenerator } from '$lib/server/id';
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

export const load: PageServerLoad = async ({ locals, url }) => {
	requireViewer(locals);
	return readNewPersonRequest(url.searchParams);
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const viewer = requireViewer(locals);

		// A command (docs/04 §4.11.2), named by the form so one kept on the phone is recognised.
		// `isSelf` is a hidden field the form posts only for the member adding themselves.
		const form = await request.formData();
		const reading = readCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'contact.add',
			payload: fromFormData(ContactAddSchema, form),
			issuedAt: systemClock.now()
		});
		// The reader's language: everything this action can say back is a message key rendered
		// here, where the request's locale is known (docs/02 §2.19).
		const t = createTranslator(locals.locale);
		if (!reading.ok) {
			// A field that does not read is the form's to fix; a person with nothing to be called
			// by is refused as a whole.
			const fieldWrong = reading.part === 'payload' && reading.field !== null;
			return fail(400, {
				error: t(fieldWrong ? 'errors.form.checkAndRetry' : 'errors.contact.needAName')
			});
		}
		const { command } = reading;
		// An existing person to link right after creating (docs/02 §2.2.1); not the command's.
		const relate = form.get('relateTo');
		const relateTo = typeof relate === 'string' ? relate.trim() : '';
		const author = {
			userId: viewer.id,
			householdId: viewer.householdId,
			locale: locals.locale
		};
		const outcome = await dispatchCommand(locals.services.offline.commandDeps, author, command);
		if (outcome.status !== 'applied') {
			return fail(400, {
				error: outcome.status === 'refused' ? outcome.reason(t) : t('errors.contact.needAName')
			});
		}
		const id = outcome.result.contactId;

		throw redirect(
			303,
			relateTo ? `/contacts/${id}?relate=${encodeURIComponent(relateTo)}` : `/contacts/${id}`
		);
	}
};
