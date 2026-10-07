import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parseCommand } from '$lib/server/commands/parse';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import * as v from 'valibot';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { IMPORTANT_DATE_KINDS } from '$lib/dates/kinds';
import { getCommandDeps, getContactDeps, getImportantDates } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

const AddDateSchema = v.object({
	kind: v.picklist(IMPORTANT_DATE_KINDS),
	label: v.optional(v.pipe(v.string(), v.trim())),
	date: v.pipe(v.string(), v.minLength(1)),
	recursYearly: v.optional(v.boolean(), true),
	remind: v.optional(v.boolean(), true)
});

/** The profile card's dates (docs/02 §2.13). */
export const dateActions = {
	addDate: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		// The date field posts `--MM-DD` itself when the year was left blank (docs/02 §2.13).
		const date = String(form.get('date') ?? '');
		const parsed = v.safeParse(AddDateSchema, {
			kind: form.get('kind'),
			label: form.get('label') || undefined,
			date,
			recursYearly: form.get('recursYearly') !== null,
			remind: form.get('remind') !== null
		});
		if (!parsed.success) {
			return fail(400, { dateError: say(locals, 'errors.date.needKindAndDay') });
		}

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'date.add',
			payload: { contactId: params.id, ...parsed.output, label: parsed.output.label ?? null },
			issuedAt: systemClock.now()
		});
		const outcome = command
			? await dispatchCommand(
					getCommandDeps(),
					{ userId: viewer.id, householdId: viewer.householdId, locale: locals.locale },
					command
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

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		await getImportantDates().remove(params.id, dateId);
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
