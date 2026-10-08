import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import { FieldAddSchema } from '$lib/commands/payloads';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import * as v from 'valibot';
import { editContactField } from '$lib/server/domain/contact-fields/contact-fields';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/** An address rewritten where it is read; its kind stays (docs/02 §2.2). */
const EditFieldSchema = v.object({
	fieldId: v.pipe(v.string(), v.minLength(1)),
	label: v.optional(v.pipe(v.string(), v.trim())),
	value: v.pipe(v.string(), v.trim(), v.minLength(1))
});

/** The profile card's ways to reach someone (docs/02 §2.2). */
export const fieldActions = {
	addField: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const reading = readCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'field.add',
			payload: { ...fromFormData(FieldAddSchema, form), contactId: params.id },
			issuedAt: systemClock.now()
		});
		if (!reading.ok && reading.part === 'payload') {
			return fail(400, { fieldError: say(locals, 'errors.field.needKindAndValue') });
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
				fieldError:
					outcome?.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.field.couldNotAdd')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	/*
	 * Not a command: editing is not kept on the phone like adding (docs/02 §2.18), so the
	 * editor's Save waits for a connection, as the name's does.
	 */
	editField: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const parsed = v.safeParse(EditFieldSchema, {
			fieldId: form.get('fieldId'),
			label: form.get('label') ?? undefined,
			value: form.get('value')
		});
		if (!parsed.success) return fail(400, { fieldError: say(locals, 'errors.field.needValue') });

		const contact = await getContact(locals.services.people.contactDeps, viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		await editContactField(locals.services.records.contactFieldDeps, {
			contactId: params.id,
			fieldId: parsed.output.fieldId,
			label: parsed.output.label ?? null,
			value: parsed.output.value
		});
		throw redirect(303, `/contacts/${params.id}`);
	},

	removeField: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const fieldId = form.get('fieldId');
		if (typeof fieldId !== 'string') return fail(400, {});

		const contact = await getContact(locals.services.people.contactDeps, viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		await locals.services.records.contactFields.remove(params.id, fieldId);
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
