import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import { DateAddSchema } from '$lib/commands/payloads';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { ContactGoneError } from '$lib/server/domain/contacts/require-visible';
import { removeImportantDate } from '$lib/server/domain/dates/important-dates';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/** The profile card's dates (docs/02 §2.13). */
export const dateActions = {
	addDate: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		// The date field posts `--MM-DD` itself when the year was left blank (docs/02 §2.13), and
		// the two checkboxes are booleans the form leaves out when unticked.
		const form = await request.formData();
		const reading = readCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'date.add',
			payload: { ...fromFormData(DateAddSchema, form), contactId: params.id },
			issuedAt: systemClock.now()
		});
		if (!reading.ok && reading.part === 'payload') {
			return fail(400, { dateError: say(locals, 'errors.date.needKindAndDay') });
		}

		const contact = await getContact(locals.services.people.contactDeps, viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const outcome = reading.ok
			? await dispatchCommand(
					locals.services.offline.commandDeps,
					{ userId: viewer.id, householdId: viewer.householdId, locale: locals.locale },
					reading.command
				)
			: null;
		if (outcome?.status !== 'applied') {
			return fail(400, {
				dateError:
					outcome?.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.date.couldNotAdd')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	removeDate: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const dateId = form.get('dateId');
		if (typeof dateId !== 'string') return fail(400, {});

		try {
			await removeImportantDate(locals.services.records.importantDateDeps, viewer, {
				contactId: params.id,
				dateId
			});
		} catch (err) {
			if (err instanceof ContactGoneError) throw error(404, say(locals, 'errors.contact.notFound'));
			throw err;
		}
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
